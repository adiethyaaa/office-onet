"""Gate daya ICT konsep: PoE per-switch, UPS W/VA, panas ruang server.

Masukan: world.json SETELAH patch world-ict-power.patch.json + ict-portmap.json asli.
Nilai vendor dari world.ict.referenceModels (sumber di powerModel.sources); faktor
efisiensi/PF/allowance adalah asumsi berlabel (AS-ICT-08), bukan pengukuran.

Pakai (baca-saja terhadap repo):
  python3 ict_power_reference.py --world <repo>/design/world.json \
      --portmap <repo>/design/derived/ict-portmap.json \
      --patch world-ict-power.patch.json --out ict-power.json
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path


# ---------- RFC 6902 subset (test/add/replace) -------------------------------
def _walk(doc, pointer):
    parts = [p.replace("~1", "/").replace("~0", "~") for p in pointer.split("/")[1:]]
    parent = doc
    for p in parts[:-1]:
        parent = parent[int(p)] if isinstance(parent, list) else parent[p]
    return parent, parts[-1]


def apply_patch(doc, ops):
    doc = copy.deepcopy(doc)
    ops = copy.deepcopy(ops)  # values must not alias the caller's patch document
    for i, op in enumerate(ops):
        parent, key = _walk(doc, op["path"])
        kind = op["op"]
        if isinstance(parent, list):
            idx = len(parent) if key == "-" else int(key)
            if kind == "test":
                if idx >= len(parent) or parent[idx] != op["value"]:
                    raise ValueError(f"patch op {i}: test failed at {op['path']}")
            elif kind == "add":
                if idx > len(parent):
                    raise ValueError(f"patch op {i}: index out of range {op['path']}")
                parent.insert(idx, op["value"])
            elif kind == "replace":
                parent[idx] = op["value"]
            else:
                raise ValueError(f"patch op {i}: unsupported {kind}")
        else:
            if kind == "test":
                if key not in parent or parent[key] != op["value"]:
                    raise ValueError(f"patch op {i}: test failed at {op['path']}")
            elif kind == "add":
                parent[key] = op["value"]
            elif kind == "replace":
                if key not in parent:
                    raise ValueError(f"patch op {i}: replace missing {op['path']}")
                parent[key] = op["value"]
            else:
                raise ValueError(f"patch op {i}: unsupported {kind}")
    return doc


# ---------- derivation --------------------------------------------------------
def derive_power(world, portmap):
    ict = world["ict"]
    pm = ict["powerModel"]
    refs = ict["referenceModels"]
    margin, pf, eta = pm["sizingMultiplier"], pm["loadPowerFactorFloor"], pm["psuEfficiencyFloorAssumed"]
    if not (0 < pf <= 1 and 0 < eta <= 1 and margin >= 1):
        raise ValueError("invalid powerModel parameters")
    if portmap.get("worldRevision") != world["revision"]["id"]:
        raise ValueError("portmap revision does not match world revision")
    btu = pm["btuPerW"]
    errors, gates = [], {}
    devices = {d["id"]: d for d in ict["devices"]}
    classes = ict["poeClasses"]

    # 1) PoE per switch, from the ORIGINAL port map (no reallocation, no averaging).
    pse, pd, npd, seen, per_port = Counter(), Counter(), Counter(), Counter(), []
    for c in portmap["cables"]:
        if c["poeClass"] is None:
            continue
        cls = str(c["poeClass"])
        pse[c["switch"]] += classes[cls]["pseW"]
        pd[c["switch"]] += classes[cls]["pdW"]
        npd[c["switch"]] += 1
        seen[c["serves"]] += 1
        per_port.append((c["switch"], c["switchPort"], cls))
    if set(seen) != set(devices) or any(n != 1 for n in seen.values()):
        errors.append("PoE endpoint coverage is not exactly once per device")

    sw_ref = refs["switch_access_48_poe"]
    if ict["rackDeviceTypes"]["switch_access_48_poe"].get("poeBudgetW") != sw_ref["poeBudgetW"]:
        errors.append("rackDeviceTypes.poeBudgetW differs from reference model")
    switch_rows = []
    for s in portmap["switches"]:
        sid = s["switch"]
        alloc = round(pse[sid], 3)
        need = round(alloc * margin, 3)
        port_ok = all(classes[cls]["pseW"] <= sw_ref["poePerPortMaxW"][cls] for (sw, _, cls) in per_port if sw == sid)
        count_ok = npd[sid] <= sw_ref["poePlusPorts"] + sw_ref["poePlusPlusPorts"]
        ok = need <= sw_ref["poeBudgetW"] + 1e-9 and port_ok and count_ok
        if not ok:
            errors.append(f"{sid}: PoE gate fails (need {need} W vs {sw_ref['poeBudgetW']} W, port_ok={port_ok}, count_ok={count_ok})")
        switch_rows.append({"switch": sid, "model": sw_ref["model"], "pdPorts": npd[sid],
                            "poeAllocPseW": alloc, "poeAllocWithMarginW": need, "poeBudgetW": sw_ref["poeBudgetW"],
                            "budgetUtilization": round(need / sw_ref["poeBudgetW"], 4),
                            "headroomW": round(sw_ref["poeBudgetW"] - need, 3),
                            "pdPowerW": round(pd[sid], 3), "status": "PASS" if ok else "BLOCKED"})
    gates["poe_per_switch"] = "PASS" if all(r["status"] == "PASS" for r in switch_rows) else "BLOCKED"

    # 2) UPS-fed rack loads; redundant PSU counted once.
    rows = []
    for rack in ict["racks"]:
        for item in rack["contents"]:
            kind = item["type"]
            ref = refs.get(kind)
            if not ref or kind == "ups_placeholder":
                continue
            dev = item["device"]
            if kind.startswith("switch_access"):
                # Vendor max excluding PoE + the PoE actually allocated, through the PSU.
                # NOT the 660 W full-PoE ceiling plus PoE again (double count).
                ac = ref["noPdAcW"] + pse[dev] / eta
                if ac > ref["fullPoeAcW"] + 1e-9:
                    errors.append(f"{dev}: AC envelope above vendor full-PoE maximum")
                basis = "maks vendor tanpa PoE + alokasi PSE / efisiensi PSU (asumsi)"
                export = pd[dev]
            elif "psuOutputW" in ref and "maxAcW" not in ref:
                ac = ref["psuOutputW"] * ref.get("psuActiveCount", 1) / eta
                basis = "rating PSU aktif / efisiensi (asumsi); bukan beban terukur"
                export = 0.0
            else:
                ac = ref["maxAcW"]
                basis = "konsumsi maksimum/terukur vendor"
                export = 0.0
            rows.append({"device": dev, "rack": rack["id"], "room": rack["room"], "model": ref["model"],
                         "source": ref["source"], "basis": basis, "acW": round(ac, 3), "va": round(ac / pf, 3),
                         "pdExportW": round(export, 3), "roomHeatW": round(ac - export, 3)})
    allowance = pm["accessoryAllowanceW"]
    rows.append({"device": "ALLOWANCE-AKSESORI", "rack": "RK-L1-01", "room": "L1-SERVER", "model": "allowance",
                 "source": "AS-ICT-08", "basis": "optik/PDU/aksesori kecil; asumsi", "acW": allowance,
                 "va": round(allowance / pf, 3), "pdExportW": 0.0, "roomHeatW": allowance})
    load_w = sum(r["acW"] for r in rows)
    load_va = load_w / pf
    ups = refs["ups_placeholder"]
    need_w, need_va = load_w * margin, load_va * margin
    ups_ok = need_w <= ups["outputW"] + 1e-9 and need_va <= ups["outputVA"] + 1e-9
    if not ups_ok:
        errors.append(f"UPS capacity exceeded: need {need_w:.1f} W / {need_va:.1f} VA vs {ups['outputW']} W / {ups['outputVA']} VA")
    gates["ups_w_va"] = "PASS" if ups_ok else "BLOCKED"
    gates["ups_runtime"] = "BLOCKED"  # no autonomy target given; vendor curve only brackets it
    load_frac = load_w / ups["outputW"]
    if 0.5 <= load_frac <= 1:
        runtime_note = (f"antara {ups['runtimeFullLoadMin']} dan {ups['runtimeHalfLoadMin']} menit "
                        f"(beban {load_frac:.0%} dari rating; kurva vendor, baterai baru)")
    else:
        runtime_note = f"beban {load_frac:.0%} di luar braket 50-100% kurva vendor; pakai runtime tool vendor"

    # 3) Thermal: PD power leaves the room; PoE cable loss stays counted in the room (conservative).
    #    UPS loss = vendor online dissipation at full load, added once.
    ups_loss = ups["onlineThermalBTUh"] / btu
    rack_heat = sum(r["roomHeatW"] for r in rows)
    room_heat = rack_heat + ups_loss
    distributed = sum(pd.values())
    gates["thermal_input_for_mep"] = "PASS-KONSEP"
    upstream_w = load_w + ups_loss
    return {
        "status": "PASS-KONSEP" if not errors else "BLOCKED",
        "worldRevision": world["revision"]["id"], "referenceOnly": True, "gates": gates,
        "switches": switch_rows, "rackLoads": rows,
        "ups": {"model": ups["model"], "source": ups["source"], "ratingW": ups["outputW"], "ratingVA": ups["outputVA"],
                "connectedW": round(load_w, 1), "connectedVA": round(load_va, 1),
                "requiredWithMarginW": round(need_w, 1), "requiredWithMarginVA": round(need_va, 1),
                "utilizationW": round(need_w / ups["outputW"], 4), "utilizationVA": round(need_va / ups["outputVA"], 4),
                "runtime": runtime_note, "runtimeStatus": "BLOCKED: target otonomi belum ditetapkan; kurva vendor = baterai baru"},
        "mepInputForHugo": {
            "circuit": "1 sirkit dedicated untuk UPS-01 di L1-SERVER (rack RK-L1-02)",
            "upsInputW": round(upstream_w, 1),
            "upsInputVAatPF0_9": round(upstream_w / 0.9, 1),
            "upsInputCurrentA_at230V_PF0_9": round(upstream_w / 0.9 / pm["nominalVoltageV"], 2),
            "upsRatedVA_for_breaker_selection": ups["outputVA"],
            "note": "PF input 0,9 = asumsi konservatif; arus pengisian baterai tidak dihitung; rating breaker/kabel = Hugo"},
        "thermal": {"room": "L1-SERVER", "rackEquipmentHeatW": round(rack_heat, 1), "upsLossW": round(ups_loss, 1),
                    "serverRoomHeatW": round(room_heat, 1), "serverRoomHeatBTUh": round(room_heat * btu),
                    "serverRoomHeatWithMarginW": round(room_heat * margin, 1),
                    "serverRoomHeatWithMarginBTUh": round(room_heat * margin * btu),
                    "distributedPdHeatW": round(distributed, 1),
                    "method": "input AC rack - daya PD yang keluar ruang; rugi kabel PoE dihitung di ruang server (konservatif); "
                              "rugi UPS = disipasi online vendor pada beban penuh",
                    "excludes": ["penghuni", "lampu", "radiasi matahari", "selubung bangunan", "workstation non-UPS", "sizing AC"]},
        "errors": errors,
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", required=True)
    ap.add_argument("--portmap", required=True)
    ap.add_argument("--patch")
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    world = json.loads(Path(a.world).read_text(encoding="utf-8"))
    if a.patch:
        world = apply_patch(world, json.loads(Path(a.patch).read_text(encoding="utf-8")))
    res = derive_power(world, json.loads(Path(a.portmap).read_text(encoding="utf-8")))
    txt = json.dumps(res, indent=1, ensure_ascii=False) + "\n"
    if a.out:
        Path(a.out).write_text(txt, encoding="utf-8")
    print(json.dumps({"status": res["status"], "gates": res["gates"], "errors": res["errors"]}, ensure_ascii=False))
    return 0 if not res["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
