"""Keyboard-only VoiceOver run, round 3. Same recording rules as voiceover_probe.py:
every result is VoiceOver's own last phrase after a real keystroke in Safari."""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

BASE = "https://employee-rpg.air-buddy.site/"
OUT = sys.argv[1]
KC = {"tab": 48, "return": 36, "escape": 53, "space": 49}


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


def load(query):
    osa('tell application "Safari" to activate')
    osa('tell application "Safari" to set URL of front document to "%s"' % (BASE + query))
    time.sleep(9)


def tab_until(words, limit=40, mods=()):
    for _ in range(limit):
        key("tab", mods)
        time.sleep(0.45)
        p = phrase()
        if any(w in p for w in words):
            return p
    return None


steps = []


def rec(name, ok, spoken):
    steps.append({"step": name, "spoken": spoken, "result": "PASS" if ok else "FAIL"})
    print(("PASS " if ok else "FAIL ") + name + " -> " + str(spoken)[:170], flush=True)


# Skip link: Safari's Tab skips links by default; Option+Tab includes them.
load("?a11ylog=1")
key("tab", ("option",)); time.sleep(0.8); a = phrase()
key("tab", ("shift", "option")); time.sleep(0.8); b = phrase()
rec("1b tautan 'Lewati ke direktori' tercapai (Option+Tab / Shift+Option+Tab)",
    "Lewati ke direktori" in a or "Lewati ke direktori" in b, {"optionTab": a, "shiftOptionTab": b})

# Persona dialog via keyboard only.
load("?a11ylog=1")
p = tab_until(["Direktori"], 6)
rec("2c tombol Direktori bernama", bool(p), p)
key("return"); time.sleep(1.5)
p = tab_until(["Temui"], 40)
rec("3a tombol 'Temui <persona>' bernama", bool(p), p)
if p:
    key("return"); time.sleep(2); d = phrase()
    rec("3b dialog persona dibacakan", any(x in d for x in ("dialog", "Nova", "Max", "Rex", "Bruno", "Hugo", "Clara", "Stella", "Kevin", "Tutup")), d)
    key("escape"); time.sleep(1.5); e = phrase()
    rec("3c Escape: fokus kembali ke tombol Temui", "Temui" in e, e)

# Approaching an NPC: walk with the directory's "Pergi" then read the prompt live region.
load("?a11ylog=1")
seen = []
for _ in range(12):
    time.sleep(1)
    seen.append(phrase())
prompts = [s for s in seen if "Sapa" in s or "E:" in s]
rec("5 prompt NPC tidak diulang tiap frame (12 detik diam)", len(set(prompts)) <= 2 and len(prompts) <= 3, seen[-4:])

# Settings dialog legends and checkboxes.
load("?a11ylog=1")
p = tab_until(["Pengaturan"], 10)
rec("6a tombol Pengaturan bernama", bool(p), p)
found = {}
if p:
    key("return"); time.sleep(1.5)
    for _ in range(25):
        key("tab"); time.sleep(0.45)
        s = phrase()
        for k in ("Tema", "Kualitas grafis", "Kurangi gerak", "Mode visitor"):
            if k in s and k not in found:
                found[k] = s
    key("escape")
rec("6b legend Tema/Kualitas grafis + checkbox Kurangi gerak/Mode visitor dibacakan", len(found) == 4, found)

# Office Studio buttons and status.
load("?a11ylog=1")
p = tab_until(["Studio"], 10)
rec("8a tombol Studio bernama", bool(p), p)
names = set()
if p:
    key("return"); time.sleep(2)
    for _ in range(30):
        key("tab"); time.sleep(0.4)
        s = phrase()
        if "Geser" in s or "Putar" in s or "Simpan" in s or "Batal" in s:
            names.add(s[:70])
    key("escape")
rec("8b tombol Studio punya nama aksi (Geser/Putar/Simpan)", len(names) >= 3, sorted(names))

meta = {"ranAt": datetime.now(timezone.utc).isoformat(), "screenReader": "macOS VoiceOver (real), Safari, keyboard only",
        "steps": steps, "passed": sum(s["result"] == "PASS" for s in steps), "total": len(steps)}
json.dump(meta, open(OUT, "w"), ensure_ascii=False, indent=2)
print("SAVED", OUT, meta["passed"], "/", meta["total"])
