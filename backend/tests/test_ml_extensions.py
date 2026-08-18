"""
Tests for the extended ML model manager:

- batch inference
- model metadata / status contract
- feature importances for explainability
- mock-mode labelling (never presented as a real model)
"""

import numpy as np
import pytest

from app.core.exceptions import ModelNotLoadedError, ModelPredictionError
from app.ml.model_manager import ModelManager, model_manager

VALID_FEATURES = np.array([1.5, 20.0, 0.001, 100.0, 45.0, 0.5, 50.0, 40.0])


@pytest.fixture(autouse=True)
def mock_ml():
    """Ensure the singleton is loaded in mock mode for every test here."""
    model_manager.load_models("./models", mock_mode=True)
    yield


class TestBatchInference:
    def test_batch_returns_one_result_per_row(self):
        X = np.array([VALID_FEATURES, VALID_FEATURES + 1.0, VALID_FEATURES * 2.0])
        results = model_manager.predict_batch(X)
        assert len(results) == 3
        for msd, prob, conf in results:
            assert isinstance(msd, float)
            assert isinstance(prob, float)
            assert isinstance(conf, float)
            assert msd >= 0
            assert 0 <= prob <= 1

    def test_batch_matches_single_predictions(self):
        X = np.array([VALID_FEATURES, VALID_FEATURES])
        results = model_manager.predict_batch(X)
        assert results[0] == results[1] == model_manager.predict(VALID_FEATURES)

    def test_batch_rejects_wrong_shape(self):
        with pytest.raises(ModelPredictionError):
            model_manager.predict_batch(np.zeros(8))  # 1D, not (N, 8)
        with pytest.raises(ModelPredictionError):
            model_manager.predict_batch(np.zeros((2, 5)))

    def test_batch_requires_loaded_model(self):
        fresh = ModelManager()
        with pytest.raises(ModelNotLoadedError):
            fresh.predict_batch(np.zeros((2, 8)))


class TestModelMetadata:
    def test_metadata_contract(self):
        meta = model_manager.get_metadata()
        for key in ("model_version", "is_mock", "model_source", "model_type",
                    "feature_count", "loaded", "status"):
            assert key in meta
        assert meta["feature_count"] == 8
        assert meta["loaded"] is True
        assert meta["status"] == "ready"

    def test_mock_is_clearly_labelled(self):
        meta = model_manager.get_metadata()
        assert meta["is_mock"] is True
        assert meta["model_source"] == "MOCK"
        assert "mock" in meta["model_version"].lower()

    def test_mock_regressor_classifier_none(self):
        meta = model_manager.get_metadata()
        assert meta["regressor"] is None
        assert meta["classifier"] is None


class TestFeatureImportances:
    def test_returns_8_named_importances(self):
        fi = model_manager.feature_importances()
        assert "importances" in fi
        assert "source" in fi
        assert len(fi["importances"]) == 8

    def test_mock_source_labelled(self):
        fi = model_manager.feature_importances()
        assert fi["source"] == "MOCK_MODEL"

    def test_importances_are_valid_probabilities(self):
        fi = model_manager.feature_importances()
        total = sum(fi["importances"].values())
        assert total == pytest.approx(1.0, abs=1e-6)
        assert all(0 <= v <= 1 for v in fi["importances"].values())

    def test_predict_marks_mock(self):
        msd, prob, conf = model_manager.predict(VALID_FEATURES)
        assert model_manager.is_mock
        assert msd >= 0 and 0 <= prob <= 1


class TestRealModel:
    """Validates the trained model artifacts (skip when models are absent)."""

    @pytest.fixture(autouse=True)
    def real_models(self):
        from pathlib import Path
        from app.ml.model_manager import REGRESSOR_FILENAME, CLASSIFIER_FILENAME
        models_dir = Path("./models")
        if not (models_dir / REGRESSOR_FILENAME).exists() or not (models_dir / CLASSIFIER_FILENAME).exists():
            pytest.skip("trained models not present — run scripts/train_models.py")
        model_manager.load_models("./models", mock_mode=False)
        yield

    def test_real_model_loaded(self):
        assert model_manager.is_loaded
        assert not model_manager.is_mock
        assert model_manager.model_version == "v1.0.0"

    def test_real_predict_sane(self):
        msd, prob, conf = model_manager.predict(VALID_FEATURES)
        assert msd >= 0
        assert 0 <= prob <= 1
        assert 0 <= conf <= 1

    def test_real_importances_source(self):
        fi = model_manager.feature_importances()
        assert fi["source"] == "REAL_MODEL"
        assert len(fi["importances"]) == 8

    def test_real_metadata(self):
        meta = model_manager.get_metadata()
        assert meta["model_source"] == "REAL"
        assert meta["regressor"] == "collision_msd_regressor.pkl"
        assert meta["classifier"] == "collision_risk_classifier.pkl"
