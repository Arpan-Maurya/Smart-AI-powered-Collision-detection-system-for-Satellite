"""
Deterministic demo replay for the SIH presentation.

Replays a guaranteed close-approach scenario through the ENTIRE pipeline:

    TLE pair -> conjunction detection -> ML risk -> agentic analysis
    -> candidate maneuvers -> physics validation -> ranking -> explanation
    -> human approval gate

The pair is DEMO-A (circular orbit) and DEMO-B (same orbit, +0.05 deg phase
offset): a deterministic ~5.9 km pass that the physics engine detects and the
ML model scores as CRITICAL (real model v1.0.0 when trained, mock otherwise).

Usage:
    python scripts/demo_workflow.py              # real model if present
    python scripts/demo_workflow.py --mock       # force mock mode
    python scripts/demo_workflow.py --approve    # also exercise the approval gate
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("ENVIRONMENT", "development")

DEMO_LINE1 = "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9021"


def _checksum(line: str) -> str:
    body = line[:68]
    total = sum(int(c) for c in body if c.isdigit()) + body.count("-")
    return body + str(total % 10)


# DEMO-A: perfect circular LEO orbit (ecc = 1e-7)
DEMO_LINE2_A = _checksum("2 25544  51.6400 208.9163 0000001 358.1484  30.8603 15.50216498484890")

# DEMO-B: same orbit, +0.05 deg phase offset -> deterministic ~5.9 km pass
_line2_b = list(DEMO_LINE2_A)
_line2_b[43:51] = "%8.4f" % (30.8603 + 0.05)
DEMO_LINE2_B = _checksum("".join(_line2_b))


def run(approve: bool = False, horizon_hours: float = 6.0) -> None:
    from app.ml.model_manager import model_manager

    real = not os.environ.get("MOCK_ML_MODE") == "true"
    model_manager.load_models("./models", mock_mode=not real)
    if not real and model_manager.is_mock:
        print("NOTE: running with the development MOCK model (set MOCK_ML_MODE=false")
        print("      and run scripts/train_models.py for real predictions)\n")
    else:
        print(f"Model: {model_manager.model_version} (REAL XGBoost)\n")

    from app.services import orchestration_service

    print("=" * 74)
    print("ORBITAL GUARDIAN — CONJUNCTION WORKFLOW DEMO")
    print("=" * 74)
    print(f"Pair: DEMO-A (25544) vs DEMO-B (25544)  |  horizon {horizon_hours:.0f} h")
    print()

    result = orchestration_service.analyze(
        DEMO_LINE1, DEMO_LINE2_A, DEMO_LINE1, DEMO_LINE2_B,
        name_a="DEMO-A", name_b="DEMO-B", horizon_hours=horizon_hours,
    )

    print(f"Event            : {result['event_id']}")
    print(f"Workflow         : {result['workflow_id']}")
    print(f"TCA              : {result['tca']}")
    print(f"Miss distance    : {result['miss_distance_m']:.0f} m  (physics, SGP4)")
    print(f"Relative vel     : {result['relative_velocity_kms']:.2f} km/s")
    print(f"Risk tier        : {result['risk_tier']}  (score {result['risk_score']:.3f})")
    print(f"Confidence       : {result['confidence']:.2%}")
    print(f"Model            : {result['model_metadata']['model_version']} "
          f"({'MOCK' if result['model_metadata']['is_mock'] else 'REAL'})")
    print()
    print("Reasons:")
    for r in result["reasons"]:
        print(f"  - {r}")
    print()

    print("Agent timeline:")
    for i, e in enumerate(result["timeline"]):
        t = e.get("t", "")[11:19]
        label = e["event"]
        extra = ""
        if "candidate" in e:
            extra = f"  [{e['candidate']}]"
        if "reason" in e:
            extra = f"  [{e['reason'][:60]}]"
        if "risk_tier" in e:
            extra = f"  [{e['risk_tier']}]"
        print(f"  {t}  {label}{extra}")
    print()

    if result["candidates"]:
        print("Maneuver comparison (validated, physics-checked):")
        print(f"  {'Cand':<5}{'Kind':<14}{'Risk before':>12}{'Risk after':>12}"
              f"{'Delta-v':>10}{'Rank':>8}")
        for c in result["validated"]:
            print(f"  {c.candidate_id:<5}{c.kind:<14}{c.risk_before:>12.3f}"
                  f"{c.risk_after:>12.3f}{c.delta_v_m_s:>9.3f} m/s{c.rank_score:>8.4f}")
        for c in result["rejected"]:
            print(f"  {c.candidate_id:<5}{c.kind:<14}  REJECTED — {c.note[:60]}")
        print()

    print("Recommendation:")
    rec = result["recommendation"]
    if rec.get("recommended_candidate"):
        print(f"  {rec['recommended_candidate']} ({rec['recommended_kind']}) — "
              f"risk {rec['risk_before']:.3f} -> {rec['risk_after']:.3f}, "
              f"dv {rec['delta_v_m_s']:.3f} m/s")
    else:
        print("  No candidate maneuver passed physics validation.")
    print(f"  Why: {rec.get('why')}")
    print(f"  Physics validation: {rec.get('physics_validation_status')}")
    print(f"  Human approval required: {result['human_approval_required']} "
          f"({result['approval_status']})")
    print()

    if result["explanation"]:
        print("Explanation:")
        for line in result["explanation"].splitlines():
            print(f"  {line}")
        print()

    if approve and result["human_approval_required"]:
        wf = result["workflow_id"]
        print(f"Operator approval -> POST /orchestration/{wf}/approve")
        decided = orchestration_service.decide(wf, approve=True, note="demo approval")
        print(f"  Status: {decided['status']}  Approval: {decided['approval_status']}")
        print("  (The maneuver is RECOMMENDED only — nothing is ever auto-executed.)")
    elif approve:
        print("No human approval required for this tier — workflow completed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orbital Guardian workflow demo")
    parser.add_argument("--mock", action="store_true", help="force mock model mode")
    parser.add_argument("--approve", action="store_true", help="exercise the approval gate")
    parser.add_argument("--horizon", type=float, default=6.0)
    args = parser.parse_args()
    if args.mock:
        os.environ["MOCK_ML_MODE"] = "true"
    run(approve=args.approve, horizon_hours=args.horizon)
