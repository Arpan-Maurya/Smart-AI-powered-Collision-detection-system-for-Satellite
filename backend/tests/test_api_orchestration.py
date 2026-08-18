"""
API tests for the new endpoints:

- POST /conjunctions/detect and /conjunctions/detect/catalog
- POST /orchestration/analyze
- GET /orchestration/{workflow_id}, /timeline, /maneuvers
- POST /orchestration/{workflow_id}/approve and /reject
- GET /models/status
"""

import pytest

from tests.conftest import (
    SAMPLE_TLE_1_LINE1,
    SAMPLE_TLE_1_LINE2,
    SAMPLE_TLE_2_LINE1,
    SAMPLE_TLE_2_LINE2,
    PHASE_OFFSET_LINE2_B,
    PHASE_OFFSET_MISS_M,
)

CRITICAL_PRED = {
    "msd_predicted_m": 200.0,
    "collision_probability": 0.85,
    "risk_score": 0.9,
    "risk_tier": "CRITICAL",
    "confidence": 0.9,
    "model_version": "mock-v1.0.0",
    "is_mock": True,
}


@pytest.fixture(autouse=True)
def no_supabase(monkeypatch):
    """Force in-memory orchestration persistence so GET round-trips work."""
    monkeypatch.setattr("app.db.client.get_supabase_client",
                        lambda: (_ for _ in ()).throw(RuntimeError("offline")))
    yield


class TestConjunctionEndpoints:
    def test_detect_single_pair(self, client):
        resp = client.post("/conjunctions/detect", json={
            "line1_a": SAMPLE_TLE_1_LINE1,
            "line2_a": SAMPLE_TLE_1_LINE2,
            "line1_b": SAMPLE_TLE_1_LINE1,
            "line2_b": PHASE_OFFSET_LINE2_B,
            "name_a": "ISS",
            "name_b": "ISS-CLONE",
            "horizon_hours": 6,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        event = data["events"][0]
        assert event["miss_distance_m"] == pytest.approx(PHASE_OFFSET_MISS_M, rel=0.05)
        assert len(event["features"]) == 8
        assert "tca_horizon_hours" in event["diagnostics"]
        assert data["source"].startswith("SGP4")

    def test_detect_invalid_tle_returns_400(self, client):
        resp = client.post("/conjunctions/detect", json={
            "line1_a": "not a tle",
            "line2_a": "not a tle",
            "line1_b": SAMPLE_TLE_1_LINE1,
            "line2_b": SAMPLE_TLE_1_LINE2,
        })
        assert resp.status_code == 400

    def test_detect_catalog(self, client):
        resp = client.post("/conjunctions/detect/catalog", json={
            "tles": [
                {"name": "ISS", "line1": SAMPLE_TLE_1_LINE1, "line2": SAMPLE_TLE_1_LINE2},
                {"name": "ISS-CLONE", "line1": SAMPLE_TLE_1_LINE1, "line2": PHASE_OFFSET_LINE2_B},
                {"name": "STARLINK", "line1": SAMPLE_TLE_2_LINE1, "line2": SAMPLE_TLE_2_LINE2},
            ],
            "horizon_hours": 6,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 1
        assert data["total_pairs"] == 3
        assert "BROAD-PHASE" in data["source"]


class TestOrchestrationEndpoints:
    def _analyze(self, client, horizon_hours=6):
        return client.post("/orchestration/analyze", json={
            "line1_a": SAMPLE_TLE_1_LINE1,
            "line2_a": SAMPLE_TLE_1_LINE2,
            "line1_b": SAMPLE_TLE_1_LINE1,
            "line2_b": PHASE_OFFSET_LINE2_B,
            "name_a": "ISS",
            "name_b": "ISS-CLONE",
            "horizon_hours": horizon_hours,
        })

    def test_analyze_critical_workflow(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        resp = self._analyze(client)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "REQUIRES_HUMAN"
        assert data["risk_tier"] == "CRITICAL"
        assert data["human_approval_required"] is True
        assert data["candidates"]
        assert data["validated"]
        assert data["recommendation"]["recommended_candidate"]
        assert data["explanation"]
        assert data["model_metadata"]["is_mock"] is True
        assert len(data["agent_log"]) == 6

    def test_analyze_invalid_tle_returns_400(self, client):
        resp = client.post("/orchestration/analyze", json={
            "line1_a": "bad",
            "line2_a": "bad",
            "line1_b": SAMPLE_TLE_1_LINE1,
            "line2_b": SAMPLE_TLE_1_LINE2,
        })
        assert resp.status_code == 400

    def test_get_run(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        wf = self._analyze(client).json()["workflow_id"]
        resp = client.get(f"/orchestration/{wf}")
        assert resp.status_code == 200
        assert resp.json()["workflow_id"] == wf

    def test_get_timeline(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        wf = self._analyze(client).json()["workflow_id"]
        resp = client.get(f"/orchestration/{wf}/timeline")
        assert resp.status_code == 200
        events = [e["event"] for e in resp.json()["timeline"]]
        assert "CONJUNCTION_DETECTED" in events
        assert "RECOMMENDATION_READY" in events

    def test_get_maneuvers(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        wf = self._analyze(client).json()["workflow_id"]
        resp = client.get(f"/orchestration/{wf}/maneuvers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["candidates"]
        assert any(m["status"] == "VALID" for m in data["validated"])

    def test_approve_workflow(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        wf = self._analyze(client).json()["workflow_id"]
        resp = client.post(f"/orchestration/{wf}/approve", json={"approve": True, "note": "go"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "COMPLETED"
        assert data["approval_status"] == "APPROVED"

    def test_reject_workflow(self, client, monkeypatch):
        monkeypatch.setattr("app.agents.tools.predict_collision_risk", lambda f, t: CRITICAL_PRED)
        wf = self._analyze(client).json()["workflow_id"]
        resp = client.post(f"/orchestration/{wf}/reject", json={"approve": False, "note": "stand down"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "REJECTED"
        assert data["approval_status"] == "REJECTED"

    def test_unknown_workflow_returns_404(self, client):
        assert client.get("/orchestration/WF-NOPE").status_code == 404
        assert client.get("/orchestration/WF-NOPE/timeline").status_code == 404
        assert client.get("/orchestration/WF-NOPE/maneuvers").status_code == 404
        assert client.post("/orchestration/WF-NOPE/approve", json={"approve": True}).status_code == 404


class TestModelsEndpoint:
    def test_models_status(self, client):
        resp = client.get("/models/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["loaded"] is True
        assert data["is_mock"] is True
        assert data["feature_count"] == 8
        assert data["status"] == "ready"
