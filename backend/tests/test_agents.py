"""
Tests for the agentic layer:

- each of the six agents (monitoring, risk, analysis, maneuver, validation, explanation)
- workflow graph conditional routing
"""

import pytest

from app.agents import (
    analysis_agent,
    explanation_agent,
    maneuver_agent,
    monitoring_agent,
    risk_agent,
    validation_agent,
)
from app.agents import graph
from app.agents.state import AgentName, ConjunctionState, ManeuverCandidate, WorkflowStatus

from tests.conftest import (
    SAMPLE_TLE_1_LINE1,
    SAMPLE_TLE_1_LINE2,
    PHASE_OFFSET_LINE2_B,
    PHASE_OFFSET_MISS_M,
)


@pytest.fixture(autouse=True, scope="module")
def mock_ml():
    from app.ml.model_manager import model_manager
    model_manager.load_models("./models", mock_mode=True)
    yield


@pytest.fixture(autouse=True)
def no_supabase(monkeypatch):
    """Force the in-memory persistence fallback — no network in tests."""
    monkeypatch.setattr("app.db.client.get_supabase_client", lambda: (_ for _ in ()).throw(RuntimeError("offline")))
    yield


@pytest.fixture
def state() -> ConjunctionState:
    return ConjunctionState(
        satellite_a={"norad": "25544", "name": "ISS"},
        satellite_b={"norad": "25544", "name": "ISS-CLONE"},
        line1_a=SAMPLE_TLE_1_LINE1,
        line2_a=SAMPLE_TLE_1_LINE2,
        line1_b=SAMPLE_TLE_1_LINE1,
        line2_b=PHASE_OFFSET_LINE2_B,
        miss_distance_m=PHASE_OFFSET_MISS_M,
        relative_velocity_kms=0.25,
        horizon_hours=24,
    )


def _completed_record(state, agent: AgentName):
    return any(r.agent == agent and r.status == "COMPLETED" for r in state.agent_log)


class TestMonitoringAgent:
    def test_assigns_ids(self, state):
        out = monitoring_agent.run(state)
        assert out.event_id.startswith("CJ-")
        assert out.workflow_id.startswith("WF-")

    def test_preserves_existing_ids(self, state):
        state.event_id = "CJ-EXISTING"
        state.workflow_id = "WF-EXISTING"
        out = monitoring_agent.run(state)
        assert out.event_id == "CJ-EXISTING"
        assert out.workflow_id == "WF-EXISTING"

    def test_logs_conjunction_detected(self, state):
        out = monitoring_agent.run(state)
        assert any(e["event"] == "CONJUNCTION_DETECTED" for e in out.timeline)

    def test_completes(self, state):
        out = monitoring_agent.run(state)
        assert _completed_record(out, AgentName.MONITORING)


class TestRiskAgent:
    def test_sets_risk_fields(self, state):
        out = risk_agent.run(state)
        assert out.risk_tier in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert out.risk_score is not None and 0 <= out.risk_score <= 1
        assert out.confidence is not None

    def test_features_computed(self, state):
        out = risk_agent.run(state)
        assert len(out.features) == 8

    def test_reasons_built(self, state):
        out = risk_agent.run(state)
        assert isinstance(out.reasons, list)
        assert len(out.reasons) >= 1
        # Every reason is a real string built from computed data
        assert all(isinstance(r, str) and r for r in out.reasons)

    def test_ml_prediction_marks_mock(self, state):
        out = risk_agent.run(state)
        assert out.ml_prediction["is_mock"] is True
        assert out.ml_prediction["model_version"].startswith("mock")

    def test_logs_assessment_events(self, state):
        out = risk_agent.run(state)
        events = [e["event"] for e in out.timeline]
        assert "RISK_ASSESSMENT_STARTED" in events
        assert "RISK_ASSESSMENT_COMPLETED" in events

    def test_completes(self, state):
        out = risk_agent.run(state)
        assert _completed_record(out, AgentName.RISK)


class TestAnalysisAgent:
    def test_builds_structured_findings(self, state):
        out = analysis_agent.run(state)
        assert "satellite_state" in out.physics_result
        assert "catalog_objects" in out.physics_result
        assert out.physics_result["catalog_objects"] == 0

    def test_satellite_state_has_geometry(self, state):
        out = analysis_agent.run(state)
        sat_state = out.physics_result["satellite_state"]
        assert "satellite_a" in sat_state
        assert "inclination_delta_deg" in sat_state
        assert "sma_delta_km" in sat_state
        assert sat_state["sma_delta_km"] < 1.0  # same orbit

    def test_completes(self, state):
        out = analysis_agent.run(state)
        assert _completed_record(out, AgentName.ANALYSIS)


class TestManeuverAgent:
    def test_skips_for_low_tier(self, state):
        state.risk_tier = "LOW"
        out = maneuver_agent.run(state)
        assert any(r.agent == AgentName.MANEUVER and r.status == "SKIPPED" for r in out.agent_log)
        assert out.candidates == []

    def test_generates_candidates_for_high(self, state):
        state.risk_tier = "HIGH"
        state.risk_score = 0.7
        out = maneuver_agent.run(state)
        assert _completed_record(out, AgentName.MANEUVER)
        assert len(out.candidates) >= 2
        assert out.candidates[0].kind == "NO_ACTION"

    def test_logs_generation_event(self, state):
        state.risk_tier = "CRITICAL"
        state.risk_score = 0.9
        out = maneuver_agent.run(state)
        assert any(e["event"] == "MANEUVER_GENERATED" for e in out.timeline)


class TestValidationAgent:
    def test_no_candidates_is_ok(self, state):
        state.candidates = []
        out = validation_agent.run(state)
        assert out.validated == [] and out.rejected == []
        assert _completed_record(out, AgentName.VALIDATION)

    def test_validates_no_action(self, state):
        state.risk_tier = "CRITICAL"
        state.risk_score = 0.9
        state.candidates = [ManeuverCandidate(candidate_id="M1", kind="NO_ACTION", status="VALID",
                                              risk_before=0.9, risk_after=0.9)]
        out = validation_agent.run(state)
        assert any(c.candidate_id == "M1" and c.status == "VALID" for c in out.validated)

    def test_logs_validation_events(self, state):
        state.risk_tier = "CRITICAL"
        state.risk_score = 0.9
        state.candidates = [ManeuverCandidate(candidate_id="M1", kind="NO_ACTION", status="VALID",
                                              risk_before=0.9, risk_after=0.9)]
        out = validation_agent.run(state)
        events = [e["event"] for e in out.timeline]
        assert "MANEUVER_VALIDATED" in events


class TestExplanationAgent:
    def test_builds_recommendation(self, state):
        state.risk_tier = "CRITICAL"
        state.risk_score = 0.9
        state.reasons = ["Predicted separation below threshold", "Collision probability elevated"]
        state.validated = [
            ManeuverCandidate(candidate_id="M2", kind="ALTITUDE_UP", status="VALID",
                              risk_before=0.9, risk_after=0.2, delta_v_m_s=0.28,
                              secondary_conflicts=0, rank_score=0.5)
        ]
        out = explanation_agent.run(state)
        assert out.recommendation["recommended_candidate"] == "M2"
        assert out.recommendation["physics_validation_status"] == "PASSED"
        assert out.explanation
        assert "M2" in out.explanation

    def test_no_validated_maneuver(self, state):
        state.risk_tier = "HIGH"
        state.risk_score = 0.7
        state.reasons = ["Reason one"]
        state.candidates = [ManeuverCandidate(candidate_id="M1", kind="NO_ACTION")]
        state.validated = []
        state.rejected = [ManeuverCandidate(candidate_id="M2", kind="ALTITUDE_UP", status="REJECTED")]
        out = explanation_agent.run(state)
        assert out.recommendation["recommended_candidate"] is None
        assert out.recommendation["physics_validation_status"] == "FAILED"
        assert "No candidate maneuver passed physics validation" in out.explanation

    def test_completes(self, state):
        state.risk_tier = "MEDIUM"
        state.risk_score = 0.4
        state.reasons = ["No risk factors above their configured thresholds"]
        out = explanation_agent.run(state)
        assert _completed_record(out, AgentName.EXPLANATION)
        assert out.recommendation["physics_validation_status"] == "NOT_REQUIRED"


class TestGraphRouting:
    def test_low_skips_maneuver_and_validation(self):
        state = ConjunctionState(risk_tier="LOW")
        steps = graph.next_steps(state)
        assert AgentName.MANEUVER not in steps
        assert AgentName.VALIDATION not in steps
        assert AgentName.MONITORING in steps
        assert AgentName.EXPLANATION in steps

    def test_critical_includes_all(self):
        state = ConjunctionState(risk_tier="CRITICAL")
        steps = graph.next_steps(state)
        assert AgentName.MANEUVER in steps
        assert AgentName.VALIDATION in steps

    def test_completed_steps_dropped(self):
        state = ConjunctionState(risk_tier="CRITICAL")
        from app.agents.state import AgentRecord
        state.agent_log.append(AgentRecord(agent=AgentName.MONITORING, status="COMPLETED"))
        state.agent_log.append(AgentRecord(agent=AgentName.RISK, status="COMPLETED"))
        steps = graph.next_steps(state)
        assert AgentName.MONITORING not in steps
        assert AgentName.RISK not in steps
        assert steps[0] == AgentName.ANALYSIS

    def test_has_analysis_helper(self):
        assert graph.has_analysis([AgentName.ANALYSIS])
        assert not graph.has_analysis([AgentName.RISK])
