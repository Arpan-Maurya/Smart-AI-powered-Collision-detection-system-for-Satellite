"""
Tests for the maneuver simulation core:

- TLE modification (SMA change) with valid checksums
- candidate generation
- physics validation (propagation, risk, secondary conflicts)
- deterministic ranking
"""

import pytest

from app.agents.state import ConjunctionState, ManeuverCandidate
from app.core.exceptions import OrbitalCalculationError
from app.core.maneuver import (
    apply_sma_change,
    generate_candidates,
    rank_candidates,
    simulate_maneuver,
)
from app.core.tle_parser import parse_tle

from tests.conftest import (
    SAMPLE_TLE_1_LINE1,
    SAMPLE_TLE_1_LINE2,
    PHASE_OFFSET_LINE2_B,
    PHASE_OFFSET_MISS_M,
)


@pytest.fixture(autouse=True, scope="module")
def mock_ml():
    """Load the mock model so maneuver risk re-scoring works offline."""
    from app.ml.model_manager import model_manager
    model_manager.load_models("./models", mock_mode=True)
    yield


@pytest.fixture
def state() -> ConjunctionState:
    return ConjunctionState(
        line1_a=SAMPLE_TLE_1_LINE1,
        line2_a=SAMPLE_TLE_1_LINE2,
        line1_b=SAMPLE_TLE_1_LINE1,
        line2_b=PHASE_OFFSET_LINE2_B,
        risk_score=0.85,
        miss_distance_m=PHASE_OFFSET_MISS_M,
        tca="2024-01-01T12:00:00+00:00",
        horizon_hours=24,
    )


class TestApplySmaChange:
    def test_returns_valid_new_tle(self):
        new = apply_sma_change(SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2, 0.5)
        assert new is not None
        line1, line2 = new
        assert line1 == SAMPLE_TLE_1_LINE1.rstrip()
        # Reparses cleanly (checksum + field validation)
        parsed = parse_tle(line1, line2)
        assert parsed.norad_id == "25544"

    def test_mean_motion_decreases_for_raise(self):
        new = apply_sma_change(SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2, 0.5)
        parsed = parse_tle(*new)
        assert parsed.mean_motion < 15.50216  # bigger SMA -> slower

    def test_mean_motion_increases_for_lower(self):
        new = apply_sma_change(SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2, -0.5)
        parsed = parse_tle(*new)
        assert parsed.mean_motion > 15.50216

    def test_perigee_constraint_rejects_extreme_lower(self):
        assert apply_sma_change(SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2, -300.0) is None

    def test_invalid_tle_returns_none(self):
        assert apply_sma_change("garbage", "garbage", 0.5) is None


class TestGenerateCandidates:
    def test_returns_no_action_plus_maneuvers(self, state):
        cands = generate_candidates(state)
        assert len(cands) == 4
        assert cands[0].kind == "NO_ACTION"
        assert cands[0].status == "VALID"
        assert cands[0].delta_v_m_s == 0.0
        assert cands[0].risk_before == pytest.approx(0.85)

    def test_maneuvers_pending_for_validation(self, state):
        for c in generate_candidates(state)[1:]:
            assert c.status == "PENDING"
            assert c.kind in ("ALTITUDE_UP", "ALTITUDE_DOWN", "PHASE_SHIFT")

    def test_delta_v_within_budget(self, state):
        for c in generate_candidates(state)[1:]:
            assert 0.0 < c.delta_v_m_s <= 30.0
            assert abs(c.sma_delta_km) <= 3.0


class TestSimulateManeuver:
    def test_no_action_unchanged(self, state):
        cand = ManeuverCandidate(
            candidate_id="M1", kind="NO_ACTION", status="VALID",
            risk_before=0.85, risk_after=0.85,
            miss_before_m=PHASE_OFFSET_MISS_M, miss_after_m=PHASE_OFFSET_MISS_M,
        )
        out = simulate_maneuver(state, cand)
        assert out.status == "VALID"
        assert out.risk_after == pytest.approx(0.85)
        assert out.miss_after_m == pytest.approx(PHASE_OFFSET_MISS_M)

    def test_valid_maneuver_updates_physics(self, state):
        cand = generate_candidates(state)[1]  # ALTITUDE_UP
        out = simulate_maneuver(state, cand)
        # Either validated with new numbers, or rejected on constraints — never silently left pending
        assert out.status in ("VALID", "REJECTED")
        assert out.miss_after_m > 0

    def test_propagation_failure_rejects(self, state, monkeypatch):
        cand = generate_candidates(state)[1]
        from app.core import maneuver as maneuver_mod
        monkeypatch.setattr(
            maneuver_mod, "find_closest_approach",
            lambda *a, **k: (_ for _ in ()).throw(OrbitalCalculationError("boom")),
        )
        out = simulate_maneuver(state, cand)
        assert out.status == "REJECTED"
        assert out.constraint_violations

    def test_increased_risk_rejected(self, state, monkeypatch):
        cand = generate_candidates(state)[1]
        from app.core import maneuver as maneuver_mod
        monkeypatch.setattr(
            maneuver_mod, "_risk_for_pair",
            lambda *a, **k: {"risk_score": 0.99, "risk_tier": "CRITICAL",
                             "collision_prob": 0.9, "msd_m": 100.0, "confidence": 0.5},
        )
        out = simulate_maneuver(state, cand)
        assert out.status == "REJECTED"
        assert any("risk higher" in v for v in out.constraint_violations)

    def test_secondary_conflict_rejects(self, state, monkeypatch):
        """A maneuver that brings a third object within 5 km is rejected."""
        from datetime import datetime, timezone

        from app.core import maneuver as maneuver_mod
        from app.core.conjunction import ClosestApproach

        # Keep the post-maneuver risk low so the risk rule cannot fire first;
        # the rejection must be caused by the secondary conflict alone.
        monkeypatch.setattr(
            maneuver_mod, "_risk_for_pair",
            lambda *a, **k: {"risk_score": 0.1, "risk_tier": "LOW",
                             "collision_prob": 0.01, "msd_m": 20000.0, "confidence": 0.9},
        )
        # The catalog screening is a separate propagation: stub it to report a
        # 3 km pass for the THIRD object while the primary pair uses real physics.
        real_fca = maneuver_mod.find_closest_approach

        def fake_fca(l1a, l2a, l1b, l2b, horizon_hours=24.0):
            if l2b == state.line2_b:
                return real_fca(l1a, l2a, l1b, l2b, horizon_hours=horizon_hours)
            return ClosestApproach(
                tca=datetime.now(timezone.utc),
                miss_distance_km=3.0, miss_distance_m=3000.0,
                relative_velocity_kms=1.0,
                position_a_km=(0.0, 0.0, 0.0), position_b_km=(0.0, 0.0, 0.0),
            )

        monkeypatch.setattr(maneuver_mod, "find_closest_approach", fake_fca)
        state.catalog = [
            {"name": "THIRD-OBJ", "line1": SAMPLE_TLE_1_LINE1,
             "line2": "2 99999  51.64 208.91 0006703 358.14  30.86 15.50216498 99990"}
        ]
        cand = generate_candidates(state)[1]
        out = simulate_maneuver(state, cand)
        assert out.secondary_conflicts >= 1
        assert out.status == "REJECTED"
        assert any("secondary conflict" in v for v in out.constraint_violations)


class TestRankCandidates:
    def test_sorts_descending(self, state):
        cands = generate_candidates(state)
        results = [simulate_maneuver(state, c) for c in cands]
        valid = [c for c in results if c.status == "VALID"]
        assert valid, "expected at least NO_ACTION to validate"
        ranked = rank_candidates(valid)
        scores = [c.rank_score for c in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_deterministic(self, state):
        cands = generate_candidates(state)
        results = [simulate_maneuver(state, c) for c in cands]
        valid = [c for c in results if c.status == "VALID"]
        r1 = rank_candidates(list(valid))
        r2 = rank_candidates(list(valid))
        assert [c.candidate_id for c in r1] == [c.candidate_id for c in r2]

    def test_rank_is_score_driven_not_llm(self, state):
        """Ranking must be deterministic — never chosen by an LLM."""
        cands = generate_candidates(state)
        results = [simulate_maneuver(state, c) for c in cands]
        valid = [c for c in results if c.status == "VALID"]
        ranked = rank_candidates(valid)
        # Every ranked candidate carries a numeric score computed by the engine
        assert all(isinstance(c.rank_score, float) for c in ranked)
