"""
ML model manager — loads, caches and serves predictions from XGBoost models.

Models are loaded ONCE at application startup and reused for all requests.
Supports a mock mode (MOCK_ML_MODE=true) for development without real model files.
Mock mode predictions are clearly labeled as non-production.
"""

import logging
import os
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

from app.core.exceptions import ModelNotLoadedError, ModelPredictionError
from app.core.feature_engine import EXPECTED_FEATURE_COUNT

logger = logging.getLogger(__name__)

REGRESSOR_FILENAME = "collision_msd_regressor.pkl"
CLASSIFIER_FILENAME = "collision_risk_classifier.pkl"


class ModelManager:
    """Singleton-style ML model manager."""

    def __init__(self) -> None:
        self._regressor = None
        self._classifier = None
        self._model_version: str = "unknown"
        self._is_mock: bool = False
        self._loaded: bool = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def is_mock(self) -> bool:
        return self._is_mock

    @property
    def model_version(self) -> str:
        return self._model_version

    def load_models(self, model_dir: str, mock_mode: bool = False) -> None:
        """
        Load ML models from disk, or activate mock mode.

        Args:
            model_dir: Directory containing .pkl model files.
            mock_mode: If True, skip loading real models and use mock predictions.
        """
        if mock_mode:
            logger.warning(
                "⚠️  MOCK ML MODE ENABLED — predictions are synthetic and NOT for production use"
            )
            self._is_mock = True
            self._model_version = "mock-v1.0.0"
            self._loaded = True
            return

        model_path = Path(model_dir)
        regressor_path = model_path / REGRESSOR_FILENAME
        classifier_path = model_path / CLASSIFIER_FILENAME

        if not regressor_path.exists():
            raise ModelNotLoadedError(
                f"Regressor model not found at {regressor_path}"
            )
        if not classifier_path.exists():
            raise ModelNotLoadedError(
                f"Classifier model not found at {classifier_path}"
            )

        try:
            import joblib

            logger.info("Loading regressor from %s", regressor_path)
            self._regressor = joblib.load(str(regressor_path))

            logger.info("Loading classifier from %s", classifier_path)
            self._classifier = joblib.load(str(classifier_path))

            self._model_version = self._detect_version(model_path)
            self._is_mock = False
            self._loaded = True

            logger.info("✅ Models loaded successfully (version: %s)", self._model_version)

        except Exception as e:
            self._loaded = False
            raise ModelNotLoadedError(f"Failed to load models: {e}")

    def predict(self, features: np.ndarray) -> Tuple[float, float, float]:
        """
        Run inference on both models.

        Args:
            features: numpy array of shape (8,) — the 8 engineered features.

        Returns:
            Tuple of (msd_predicted_meters, collision_probability, confidence).

        Raises:
            ModelNotLoadedError: If models are not loaded.
            ModelPredictionError: If prediction fails.
        """
        if not self._loaded:
            raise ModelNotLoadedError()

        self._validate_features(features)

        if self._is_mock:
            return self._mock_predict(features)

        return self._real_predict(features)

    def _real_predict(self, features: np.ndarray) -> Tuple[float, float, float]:
        """Run real model inference."""
        try:
            X = features.reshape(1, -1)

            # Regressor: trained on log1p(miss_meters) — invert to meters
            msd_pred = float(np.expm1(self._regressor.predict(X)[0]))
            if msd_pred < 0:
                msd_pred = 0.0  # MSD cannot be negative

            # Classifier: predict collision probability
            if hasattr(self._classifier, "predict_proba"):
                proba = self._classifier.predict_proba(X)
                # Probability of positive class (collision)
                collision_prob = float(proba[0][1]) if proba.shape[1] > 1 else float(proba[0][0])
            else:
                # Fallback: binary prediction
                pred = float(self._classifier.predict(X)[0])
                collision_prob = pred  # Already 0 or 1

            collision_prob = max(0.0, min(1.0, collision_prob))

            # Confidence: average of individual model confidences
            confidence = self._compute_confidence(X)

            return msd_pred, collision_prob, confidence

        except Exception as e:
            raise ModelPredictionError(f"Prediction failed: {e}")

    def _mock_predict(self, features: np.ndarray) -> Tuple[float, float, float]:
        """
        Generate synthetic predictions for development/testing.
        Uses feature values deterministically so results are reproducible.

        ⚠️  These are NOT real predictions and must NOT be used in production.
        """
        # Use feature magnitudes to create a deterministic mock prediction
        feature_sum = float(np.sum(features))
        feature_hash = abs(hash(features.tobytes())) % 10000

        # Mock MSD: derived from SMA difference (feature index 3)
        sma_diff = features[3]
        mock_msd = max(50.0, sma_diff * 100.0 + (feature_hash % 500))

        # Mock collision probability: inversely related to feature differences
        mean_feat = float(np.mean(features))
        mock_prob = max(0.01, min(0.99, 1.0 / (1.0 + mean_feat / 10.0)))

        mock_confidence = 0.5  # Fixed low confidence for mock

        logger.debug(
            "MOCK prediction: MSD=%.1fm, prob=%.4f, confidence=%.2f",
            mock_msd, mock_prob, mock_confidence,
        )

        return mock_msd, mock_prob, mock_confidence

    def _validate_features(self, features: np.ndarray) -> None:
        """Validate feature array shape and values."""
        if features.ndim != 1:
            raise ModelPredictionError(
                f"Expected 1D feature array, got shape {features.shape}"
            )
        if features.shape[0] != EXPECTED_FEATURE_COUNT:
            raise ModelPredictionError(
                f"Expected {EXPECTED_FEATURE_COUNT} features, got {features.shape[0]}"
            )
        if np.any(np.isnan(features)):
            raise ModelPredictionError("Feature array contains NaN values")
        if np.any(np.isinf(features)):
            raise ModelPredictionError("Feature array contains infinite values")

    def _compute_confidence(self, X: np.ndarray) -> float:
        """Compute prediction confidence. Uses classifier probability margin."""
        try:
            if hasattr(self._classifier, "predict_proba"):
                proba = self._classifier.predict_proba(X)[0]
                # Confidence = distance from decision boundary (0.5)
                max_prob = float(np.max(proba))
                return round(max_prob, 4)
            return 0.5  # Default when confidence unavailable
        except Exception:
            return 0.5

    def _detect_version(self, model_path: Path) -> str:
        """Detect model version from metadata file if available."""
        version_file = model_path / "model_version.txt"
        if version_file.exists():
            return version_file.read_text().strip()

        # Fallback: use file modification times
        reg_path = model_path / REGRESSOR_FILENAME
        if reg_path.exists():
            mtime = os.path.getmtime(reg_path)
            from datetime import datetime
            dt = datetime.fromtimestamp(mtime)
            return f"v1.0.0-{dt.strftime('%Y%m%d')}"

        return "v1.0.0"

    # ------------------------------------------------------------------
    # Extensions: batch inference, metadata, explainability (additive)
    # ------------------------------------------------------------------

    def predict_batch(self, features_matrix: np.ndarray) -> list:
        """
        Run inference on a batch of feature vectors (N x 8).

        Returns a list of (msd_meters, collision_prob, confidence) tuples,
        one per row. Mock mode is supported and clearly labelled.
        """
        if not self._loaded:
            raise ModelNotLoadedError()
        if features_matrix.ndim != 2 or features_matrix.shape[1] != EXPECTED_FEATURE_COUNT:
            raise ModelPredictionError(
                f"Expected (N, {EXPECTED_FEATURE_COUNT}) matrix, got {features_matrix.shape}"
            )
        results = []
        for row in features_matrix:
            results.append(self.predict(row))
        return results

    def get_metadata(self) -> dict:
        """Return model metadata for observability / GET /models/status."""
        return {
            "model_version": self._model_version,
            "is_mock": self._is_mock,
            "model_source": "MOCK" if self._is_mock else "REAL",
            "model_type": "xgboost" if not self._is_mock else "deterministic-mock",
            "feature_count": EXPECTED_FEATURE_COUNT,
            "loaded": self._loaded,
            "regressor": REGRESSOR_FILENAME if not self._is_mock else None,
            "classifier": CLASSIFIER_FILENAME if not self._is_mock else None,
            "status": "ready" if self._loaded else "unavailable",
        }

    def feature_importances(self) -> dict:
        """
        Return feature importances for explainability.

        Uses the real XGBoost feature_importances_ when a real model is
        loaded; otherwise returns a deterministic, clearly-labelled mock
        importance so explanations never fabricate real-model claims.
        """
        names = [
            "inc_diff", "raan_diff", "ecc_diff", "sma_diff",
            "argp_diff", "mean_motion_diff", "apogee_diff", "perigee_diff",
        ]
        if not self._is_mock and self._classifier is not None and hasattr(self._classifier, "feature_importances_"):
            try:
                vals = [float(x) for x in self._classifier.feature_importances_]
                total = sum(vals) or 1.0
                return {
                    "source": "REAL_MODEL",
                    "importances": {n: round(v / total, 6) for n, v in zip(names, vals)},
                }
            except Exception:
                pass
        # deterministic mock importance (dev/testing only)
        mock = [0.22, 0.14, 0.10, 0.18, 0.06, 0.16, 0.08, 0.06]
        return {
            "source": "MOCK_MODEL",
            "importances": {n: v for n, v in zip(names, mock)},
        }


# Global singleton instance
model_manager = ModelManager()
