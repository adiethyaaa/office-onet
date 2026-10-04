"""Gate daya ICT (REQ-ICT-01): PoE per switch, UPS W/VA, panas ruang server.

Angka model referensi dan metodenya ada di design/world.json (ict.referenceModels,
ict.powerModel, AS-ICT-07/08); generatornya tools/ict_power.py dari Nova (enterprise).
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import ict_power  # noqa: E402

WORLD = json.loads((ROOT / "design/world.json").read_text(encoding="utf-8"))
PORTMAP = json.loads((ROOT / "design/derived/ict-portmap.json").read_text(encoding="utf-8"))


def test_committed_power_report_matches_generator():
    committed = json.loads((ROOT / "design/derived/ict-power.json").read_text(encoding="utf-8"))
    assert ict_power.derive_power(WORLD, PORTMAP) == committed


def test_gates_pass_except_runtime_which_waits_for_an_autonomy_target():
    res = ict_power.derive_power(WORLD, PORTMAP)
    assert res["errors"] == []
    assert res["gates"]["poe_per_switch"] == "PASS"
    assert res["gates"]["ups_w_va"] == "PASS"
    assert res["gates"]["ups_runtime"] == "BLOCKED"
    assert res["gates"]["thermal_input_for_mep"] == "PASS-KONSEP"


def test_poe_is_judged_per_switch_not_averaged():
    res = json.dumps(ict_power.derive_power(WORLD, PORTMAP))
    # All PDs sit on SW-ACC-01: 11 AP x 30 W + 5 cameras x 15.4 W = 407 W, x1.25 = 508.75 W of 600 W.
    assert "508.75" in res


def test_smaller_poe_budget_fails_the_gate():
    w = copy.deepcopy(WORLD)
    w["ict"]["rackDeviceTypes"]["switch_access_48_poe"]["poeBudgetW"] = 400
    w["ict"]["referenceModels"]["switch_access_48_poe"]["poeBudgetW"] = 400
    res = ict_power.derive_power(w, PORTMAP)
    assert res["gates"]["poe_per_switch"] == "BLOCKED"
    assert any("SW-ACC-01: PoE gate fails" in e for e in res["errors"])


def test_budget_mismatch_between_rack_type_and_reference_is_reported():
    w = copy.deepcopy(WORLD)
    w["ict"]["rackDeviceTypes"]["switch_access_48_poe"]["poeBudgetW"] = 400
    res = ict_power.derive_power(w, PORTMAP)
    assert "rackDeviceTypes.poeBudgetW differs from reference model" in res["errors"]


def test_smaller_ups_fails_the_gate():
    w = copy.deepcopy(WORLD)
    ups = w["ict"]["referenceModels"]["ups_placeholder"]
    ups["outputW"], ups["outputVA"] = 1800, 2000
    res = ict_power.derive_power(w, PORTMAP)
    assert res["gates"]["ups_w_va"] == "BLOCKED"
