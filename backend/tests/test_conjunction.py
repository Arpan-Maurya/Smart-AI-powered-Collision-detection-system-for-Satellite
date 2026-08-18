"""
Tests for the conjunction detection layer:

- closest-approach engine (TCA, miss distance, relative velocity)
- single-pair detection service
- broad-phase catalog screening
"""

import pytest
from datetime import datetime, timedelta, timezone

from app.core.conjunction import ClosestApproach, build_satrec, find_closest_approach
from app.core.exceptions import OrbitalCalculationError
from app.services.conjunction_service import detect_pair, screen_catalog

from tests.conftest import (
    SAMPLE_TLE_1_LINE1,
    SAMPLE_TLE_1_LINE2,
    SAMPLE_TLE_2_LINE1,
    SAMPLE_TLE_2_LINE2,
    PHASE_OFFSET_LINE2_B,
    PHASE_OFFSET_MISS_M,
    phase_offset_line2,
)

START = datetime(2024, 1, 1, tzinfo=timezone.utc)


class TestClosestApproachEngine:
    def test_returns_typed_result(self):
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            start=START, horizon_hours=24,
        )
        assert isinstance(ca, ClosestApproach)

    def test_miss_distance_matches_phase_offset(self):
        """A 0.05 deg phase offset on the same orbit gives ~5.9 km miss."""
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            start=START, horizon_hours=24,
        )
        assert ca.miss_distance_m == pytest.approx(PHASE_OFFSET_MISS_M, rel=0.05)
        assert ca.miss_distance_km == pytest.approx(PHASE_OFFSET_MISS_M / 1000.0, rel=0.05)

    def test_miss_scales_with_phase_offset(self):
        """Double the phase offset -> roughly double the miss distance."""
        ca_small = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, phase_offset_line2(SAMPLE_TLE_1_LINE2, 0.05),
            start=START, horizon_hours=24,
        )
        ca_large = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, phase_offset_line2(SAMPLE_TLE_1_LINE2, 0.10),
            start=START, horizon_hours=24,
        )
        ratio = ca_large.miss_distance_m / ca_small.miss_distance_m
        assert ratio == pytest.approx(2.0, rel=0.2)

    def test_tca_within_horizon(self):
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            start=START, horizon_hours=24,
        )
        assert START <= ca.tca <= START + timedelta(hours=24)

    def test_relative_velocity_positive(self):
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_2_LINE1, SAMPLE_TLE_2_LINE2,
            start=START, horizon_hours=24,
        )
        assert ca.relative_velocity_kms > 0.0

    def test_identical_objects_zero_separation(self):
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            start=START, horizon_hours=6,
        )
        assert ca.miss_distance_m < 1.0

    def test_deterministic(self):
        kwargs = dict(
            line1_a=SAMPLE_TLE_1_LINE1,
            line2_a=SAMPLE_TLE_1_LINE2,
            line1_b=SAMPLE_TLE_1_LINE1,
            line2_b=PHASE_OFFSET_LINE2_B,
            start=START,
            horizon_hours=24,
        )
        ca1 = find_closest_approach(**kwargs)
        ca2 = find_closest_approach(**kwargs)
        assert ca1.tca == ca2.tca
        assert ca1.miss_distance_m == ca2.miss_distance_m

    def test_invalid_tle_raises(self):
        with pytest.raises(OrbitalCalculationError):
            find_closest_approach(
                "1 garbage line that is not a tle at all!!",
                "2 also not a tle at all at all!!!",
                SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
                start=START, horizon_hours=6,
            )

    def test_positions_have_three_components(self):
        ca = find_closest_approach(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            start=START, horizon_hours=24,
        )
        assert len(ca.position_a_km) == 3
        assert len(ca.position_b_km) == 3

    def test_build_satrec_invalid(self):
        with pytest.raises(OrbitalCalculationError):
            build_satrec("bad line one", "bad line two")


class TestDetectPair:
    def test_returns_event_for_close_pair(self):
        ev = detect_pair(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            name_a="ISS", name_b="ISS-CLONE",
            horizon_hours=24,
        )
        assert ev is not None
        assert ev.miss_distance_m < 50_000.0
        assert ev.sat1_name == "ISS"
        assert ev.sat2_name == "ISS-CLONE"
        assert ev.event_id.startswith("CJ-")

    def test_event_has_8_model_features(self):
        ev = detect_pair(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            horizon_hours=24,
        )
        assert len(ev.features) == 8
        assert len(ev.feature_names) == 8

    def test_event_has_physics_diagnostics(self):
        ev = detect_pair(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            horizon_hours=24,
        )
        for key in ("tca_horizon_hours", "relative_velocity_kms", "mean_altitude_km"):
            assert key in ev.diagnostics
        assert ev.relative_velocity_kms == pytest.approx(ev.diagnostics["relative_velocity_kms"])

    def test_no_event_for_far_pair(self):
        """ISS vs a very different orbit never gets within 50 km in the window."""
        ev = detect_pair(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_2_LINE1, SAMPLE_TLE_2_LINE2,
            horizon_hours=24,
        )
        assert ev is None

    def test_invalid_tle_raises(self):
        from app.core.exceptions import TLEValidationError
        with pytest.raises(TLEValidationError):
            detect_pair(
                "not a tle", "not a tle either",
                SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            )


class TestScreenCatalog:
    def test_finds_conjunction_in_catalog(self):
        catalog = [
            {"name": "ISS", "line1": SAMPLE_TLE_1_LINE1, "line2": SAMPLE_TLE_1_LINE2},
            {"name": "ISS-CLONE", "line1": SAMPLE_TLE_1_LINE1, "line2": PHASE_OFFSET_LINE2_B},
            {"name": "STARLINK", "line1": SAMPLE_TLE_2_LINE1, "line2": SAMPLE_TLE_2_LINE2},
        ]
        events, screened, total = screen_catalog(catalog, horizon_hours=24)
        assert len(events) >= 1
        assert all(e.miss_distance_m <= 50_000.0 for e in events)
        assert screened <= total
        assert total == 3

    def test_events_sorted_by_miss_distance(self):
        catalog = [
            {"name": "A", "line1": SAMPLE_TLE_1_LINE1, "line2": SAMPLE_TLE_1_LINE2},
            {"name": "B", "line1": SAMPLE_TLE_1_LINE1, "line2": phase_offset_line2(SAMPLE_TLE_1_LINE2, 0.02)},
            {"name": "C", "line1": SAMPLE_TLE_1_LINE1, "line2": phase_offset_line2(SAMPLE_TLE_1_LINE2, 0.10)},
        ]
        events, _, _ = screen_catalog(catalog, horizon_hours=24)
        misses = [e.miss_distance_m for e in events]
        assert misses == sorted(misses)

    def test_skips_invalid_tles(self):
        catalog = [
            {"name": "ISS", "line1": SAMPLE_TLE_1_LINE1, "line2": SAMPLE_TLE_1_LINE2},
            {"name": "GARBAGE", "line1": "not a tle", "line2": "not a tle"},
        ]
        events, screened, total = screen_catalog(catalog, horizon_hours=24)
        # Only the valid object survives parsing, so no pairs remain
        assert events == []
        assert total == 0

    def test_too_few_objects(self):
        events, screened, total = screen_catalog(
            [{"name": "only", "line1": SAMPLE_TLE_1_LINE1, "line2": SAMPLE_TLE_1_LINE2}],
            horizon_hours=24,
        )
        assert events == []
        assert total == 0

    def test_max_pairs_cap(self):
        catalog = []
        for i in range(6):
            offset = 0.02 + i * 0.01
            catalog.append(
                {"name": f"O{i}", "line1": SAMPLE_TLE_1_LINE1,
                 "line2": phase_offset_line2(SAMPLE_TLE_1_LINE2, offset)}
            )
        events, screened, total = screen_catalog(catalog, horizon_hours=24, max_pairs=2)
        assert len(events) <= 2
