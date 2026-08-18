"""
Tests for the central orchestrator and orchestration service:

- LOW / HIGH / CRITICAL workflow routing
- human approval / rejection (persisted)
- agent failure, retry, fallback, circuit breaker
- loop detection (repeated agent / max iterations)
- timeout handling
- ML failure and DB failure resilience
- invalid TLE and physics-failure paths
"""

import time

import pytest

from app.agents import graph
from app.agents.orchestrator import AGENT_IMPL, run_workflow
from app.agents.state import AgentName, ConjunctionState, WorkflowStatus
from app.core.exceptions import OrbitalCalculationError, TLEValidationError
from app.services import orchestration_service

from tests.conftest import (
    SAMPLE_TLE_1_LINE1,
    SAMPLE_TLE_1_LINE2,
    PHASE_OFFSET_LINE2_B,
    PHASE_OFFSET_MISS_M,
)

LOW_PRED = {
    "msd_predicted_m": 25000.0,
    "collision_probability": 0.02,
    "risk_score": 0.1,
    "risk_tier": "LOW",
    "confidence": 0.9,
    "model_version": "mock-v1.0.0",
    "is_mock": True,
}
HIGH_PRED = dict(LOW_PRED, msd_predicted_m=800.0, collision_probability=0.3,
                 risk_score=0.7, risk_tier="HIGH", confidence=0.85)
CRITICAL_PRED = dict(LOW_PRED, msd_predicted_m=200.0, collision_probability=0.85,
                     risk_score=0.9, risk_tier="CRITICAL", confidence=0.9)


@pytest.fixture(autouse=True, scope="module")
def mock_ml():
    from app.ml.model_manager import model_manager
    model_manager.load_models("./models", mock_mode=True)
    yield


@pytest.fixture(autouse=True)
def no_supabase(monkeypatch):
    monkeypatch.setattr("app.db.client.get_supabase_client",
                        lambda: (_ for _ in ()).throw(RuntimeError("offline")))
    yield


@pytest.fixture
def workflow_state() -> ConjunctionState:
    return ConjunctionState(
        satellite_a={"norad": "25544", "name": "ISS"},
        satellite_b={"norad": "25544", "name": "ISS-CLONE"},
        line1_a=SAMPLE_TLE_1_LINE1,
        line2_a=SAMPLE_TLE_1_LINE2,
        line1_b=SAMPLE_TLE_1_LINE1,
        line2_b=PHASE_OFFSET_LINE2_B,
        miss_distance_m=PHASE_OFFSET_MISS_M,
        relative_velocity_kms=0.25,
        horizon_hours=6,
    )


class TestWorkflowRouting:
    def test_low_workflow_completes(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: LOW_PRED)
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.COMPLETED
        assert out.risk_tier == "LOW"
        assert not out.human_approval_required
        assert out.candidates == []  # maneuver generation skipped for LOW

    def test_high_workflow_requires_human(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: HIGH_PRED)
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.REQUIRES_HUMAN
        assert out.risk_tier == "HIGH"
        assert out.human_approval_required
        assert out.candidates
        assert out.validated  # NO_ACTION always validates

    def test_critical_workflow_requires_human(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.REQUIRES_HUMAN
        assert out.risk_tier == "CRITICAL"
        assert out.human_approval_required
        assert out.recommendation.get("recommended_candidate")

    def test_all_six_agents_executed_for_critical(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        out = run_workflow(workflow_state)
        completed = {r.agent for r in out.agent_log if r.status == "COMPLETED"}
        assert completed == {AgentName.MONITORING, AgentName.RISK, AgentName.ANALYSIS,
                             AgentName.MANEUVER, AgentName.VALIDATION, AgentName.EXPLANATION}

    def test_timeline_has_key_events(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        out = run_workflow(workflow_state)
        events = [e["event"] for e in out.timeline]
        for expected in ("WORKFLOW_STARTED", "CONJUNCTION_DETECTED",
                         "RISK_ASSESSMENT_COMPLETED", "MANEUVER_GENERATED",
                         "MANEUVER_VALIDATED", "RECOMMENDATION_READY",
                         "HUMAN_APPROVAL_REQUIRED", "WORKFLOW_REQUIRES_HUMAN"):
            assert expected in events

    def test_explanation_present(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: HIGH_PRED)
        out = run_workflow(workflow_state)
        assert out.explanation
        assert out.recommendation.get("why")


class TestFailureRecovery:
    def test_agent_failure_falls_back_deterministically(self, workflow_state, monkeypatch):
        monkeypatch.setitem(AGENT_IMPL, AgentName.RISK,
                            lambda s: (_ for _ in ()).throw(RuntimeError("agent crash")))
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("fallback_used") is True
        # fallback still produced a deterministic risk assessment via physics + ML
        assert out.risk_tier in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
        assert any(e["event"] == "WORKFLOW_FAILED" for e in out.timeline)

    def test_ml_failure_never_silent(self, workflow_state, monkeypatch):
        from app.ml.model_manager import model_manager
        monkeypatch.setattr(model_manager, "predict",
                            lambda f: (_ for _ in ()).throw(RuntimeError("model down")))
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("fallback_used") is True

    def test_circuit_breaker(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.orchestrator.CIRCUIT_BREAKER_LIMIT", 1)
        monkeypatch.setitem(AGENT_IMPL, AgentName.MONITORING,
                            lambda s: (_ for _ in ()).throw(RuntimeError("monitor crash")))
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("failure") == "circuit_breaker"
        assert out.recommendation.get("fallback_used") is True

    def test_timeout(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.orchestrator.WORKFLOW_TIMEOUT_SECONDS", 0.05)

        def slow_monitor(s):
            time.sleep(0.2)
            return s

        monkeypatch.setitem(AGENT_IMPL, AgentName.MONITORING, slow_monitor)
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("failure") == "timeout"

    def test_database_failure_never_blocks(self, workflow_state, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: LOW_PRED)
        monkeypatch.setattr("app.db.orchestration_repo.upsert_run",
                            lambda s: (_ for _ in ()).throw(RuntimeError("db down")))
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.COMPLETED


class TestLoopProtection:
    def test_repeated_agent_detected(self, workflow_state, monkeypatch):
        # Force the graph to always re-offer the RISK step -> repeated-agent loop
        monkeypatch.setattr(graph, "next_steps", lambda s: [AgentName.RISK])
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("failure") in ("repeated_agent_RISK", "max_iterations_exceeded")

    def test_max_iterations_enforced(self, workflow_state, monkeypatch):
        monkeypatch.setattr(graph, "next_steps", lambda s: [AgentName.MONITORING])
        out = run_workflow(workflow_state)
        assert out.workflow_status == WorkflowStatus.FAILED
        assert out.recommendation.get("failure") in ("repeated_agent_MONITORING", "max_iterations_exceeded")


class TestHumanInTheLoop:
    def test_approve_persists_decision(self, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        result = orchestration_service.analyze(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            name_a="ISS", name_b="ISS-CLONE", horizon_hours=6,
        )
        assert result["status"] == "REQUIRES_HUMAN"
        wf = result["workflow_id"]

        approved = orchestration_service.decide(wf, approve=True, note="operator confirmed")
        assert approved["status"] == "COMPLETED"
        assert approved["approval_status"] == "APPROVED"
        assert approved["approval_note"] == "operator confirmed"

    def test_reject_persists_decision(self, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        result = orchestration_service.analyze(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            horizon_hours=6,
        )
        wf = result["workflow_id"]
        rejected = orchestration_service.decide(wf, approve=False, note="stand down")
        assert rejected["status"] == "REJECTED"
        assert rejected["approval_status"] == "REJECTED"

    def test_decision_on_unknown_workflow_returns_none(self):
        assert orchestration_service.decide("WF-NOPE", approve=True) is None


class TestServiceAnalyze:
    def test_analyze_returns_full_contract(self):
        result = orchestration_service.analyze(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            name_a="ISS", name_b="ISS-CLONE", horizon_hours=6,
        )
        for key in ("workflow_id", "event_id", "status", "risk_tier", "reasons",
                    "candidates", "validated", "rejected", "recommendation",
                    "explanation", "agent_log", "timeline", "model_metadata"):
            assert key in result
        assert result["status"] in ("COMPLETED", "REQUIRES_HUMAN", "FAILED")
        assert result["model_metadata"]["is_mock"] is True
        assert len(result["agent_log"]) >= 4

    def test_analyze_returns_real_high_risk(self):
        """Real mock-model end-to-end on the close pair must land HIGH/CRITICAL."""
        result = orchestration_service.analyze(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            horizon_hours=6,
        )
        assert result["risk_tier"] in ("HIGH", "CRITICAL")
        assert result["human_approval_required"] is True

    def test_run_timeline_maneuvers_round_trip(self):
        result = orchestration_service.analyze(
            SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            horizon_hours=6,
        )
        wf = result["workflow_id"]
        run = orchestration_service.get_run(wf)
        assert run is not None and run["workflow_id"] == wf

        timeline = orchestration_service.get_timeline(wf)
        assert timeline is not None
        assert any(e["event"] == "CONJUNCTION_DETECTED" for e in timeline["timeline"])

        maneuvers = orchestration_service.get_maneuvers(wf)
        assert maneuvers is not None
        assert "candidates" in maneuvers and "validated" in maneuvers and "rejected" in maneuvers

    def test_unknown_run_returns_none(self):
        assert orchestration_service.get_run("WF-NOPE") is None
        assert orchestration_service.get_timeline("WF-NOPE") is None
        assert orchestration_service.get_maneuvers("WF-NOPE") is None

    def test_invalid_tle_raises(self):
        with pytest.raises(TLEValidationError):
            orchestration_service.analyze(
                "not a tle", "not a tle",
                SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
            )

    def test_no_conjunction_raises(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.conjunction_service.detect_pair",
            lambda *a, **k: None,
        )
        with pytest.raises(OrbitalCalculationError):
            orchestration_service.analyze(
                SAMPLE_TLE_1_LINE1, SAMPLE_TLE_1_LINE2,
                SAMPLE_TLE_1_LINE1, PHASE_OFFSET_LINE2_B,
            )
