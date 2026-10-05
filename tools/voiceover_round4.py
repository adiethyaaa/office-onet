"""Round 4: re-run the two VoiceOver steps whose round-3 expectation was wrong.

3c: the app closes the directory when "Temui" runs, so on Escape focus returns to the
Direktori button (asserted in npc.spec.ts), not to the "Temui" button.
8b: Studio move buttons are disabled until a fixture is chosen, and Tab skips disabled
buttons; choose a fixture with the keyboard first, then read the tool names.
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

BASE = "https://employee-rpg.air-buddy.site/?a11ylog=1"
OUT = sys.argv[1]
KC = {"tab": 48, "return": 36, "escape": 53, "down": 125, "space": 49}


def osa(s, t=15):
    try:
        r = subprocess.run(["osascript", "-e", s], capture_output=True, text=True, timeout=t)
        return r.stdout.strip() if r.returncode == 0 else "ERROR: " + r.stderr.strip()[:160]
    except subprocess.TimeoutExpired:
        return "TIMEOUT"


def phrase():
    return osa('tell application "VoiceOver" to return content of last phrase')


def key(name, mods=()):
    using = (" using {" + ", ".join(m + " down" for m in mods) + "}") if mods else ""
    osa('tell application "System Events" to key code %d%s' % (KC[name], using))


def load():
    osa('tell application "Safari" to activate')
    osa('tell application "Safari" to set URL of front document to "%s"' % BASE)
    time.sleep(9)


def tab_until(words, limit=40):
    for _ in range(limit):
        key("tab")
        time.sleep(0.45)
        p = phrase()
        if any(w in p for w in words):
            return p
    return None


steps = []


def rec(name, ok, spoken):
    steps.append({"step": name, "spoken": spoken, "result": "PASS" if ok else "FAIL"})
    print(("PASS " if ok else "FAIL ") + name + " -> " + str(spoken)[:200], flush=True)


load()
tab_until(["Direktori"], 6)
key("return"); time.sleep(1.5)
p = tab_until(["Temui"], 40)
key("return"); time.sleep(2.5)
d = phrase()
key("escape"); time.sleep(1.5)
key("tab"); time.sleep(0.6); fwd = phrase()
key("tab", ("shift",)); time.sleep(0.8); back = phrase()
rec("3 Temui -> dialog -> Escape: fokus kembali ke tombol Direktori",
    "dialog" in d and "Direktori" in back, {"temui": p, "dialog": d, "afterEscapeTab": fwd, "shiftTabBack": back})

load()
tab_until(["Direktori"], 6)
opened = tab_until(["Studio button"], 6)
key("return"); time.sleep(3)
first = phrase()
key("space"); time.sleep(1.5); key("down"); time.sleep(0.8); key("down"); time.sleep(0.8); key("return"); time.sleep(2); chosen = phrase()
names = set()
for _ in range(30):
    key("tab"); time.sleep(0.4)
    s = phrase()
    if any(w in s for w in ("Geser", "Putar", "Simpan", "Hapus", "Batal")):
        names.add(s[:80])
key("escape")
rec("8 Studio: pilih fixture dengan keyboard, tombol aksi bernama", len([n for n in names if "Geser" in n]) >= 2,
    {"studioButton": opened, "focusOnOpen": first, "afterChoose": chosen, "toolNames": sorted(names)})

meta = {"ranAt": datetime.now(timezone.utc).isoformat(), "screenReader": "macOS VoiceOver (real), Safari, keyboard only",
        "steps": steps, "passed": sum(s["result"] == "PASS" for s in steps), "total": len(steps)}
json.dump(meta, open(OUT, "w"), ensure_ascii=False, indent=2)
print("SAVED", OUT, meta["passed"], "/", meta["total"])
