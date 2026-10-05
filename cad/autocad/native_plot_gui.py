#!/usr/bin/env python3
"""Plot native AutoCAD 2025 (GUI, mode skrip -b) untuk semua layout kertas.

AcCoreConsole crash saat memuat device "DWG To PDF.pc3", jadi plot dijalankan
lewat AutoCAD GUI dengan argumen `-b <script>`. Tidak ada klik: GUI hanya
menjalankan .scr lalu QUIT tanpa menyimpan. DWG sumber disalin dulu ke folder
kerja; DWG asli di cad/out tidak pernah dibuka untuk ditulis.

Prasyarat font: DejaVuSans.ttf terpasang di ~/Library/Fonts (style KR-SANS).
"""
import hashlib, json, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/evidence/MAX/native-plot-20261005"
WORK = Path.home() / ".hermes/cache/scratch/native-plot-work"
PAPER = {"A3": "ISO full bleed A3 (420.00 x 297.00 MM)", "A2": "ISO full bleed A2 (594.00 x 420.00 MM)"}
APP = "AutoCAD 2025"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def layouts(sheet: str, pages: int) -> list[str]:
    return [sheet] if pages == 1 else [f"{sheet}-{i}" for i in range(1, pages + 1)]


def script(layout: str, paper: str, pdf: Path) -> str:
    lines = ["FILEDIA", "0", "CMDDIA", "0", "_-PLOT", "_Y", layout, "", paper, "_M", "_L", "_N",
             "_L", "1:1", "0,0", "_Y", "", "_Y", "_N", "_N", "_N", str(pdf), "_N", "_Y", "_QUIT", "_N", ""]
    return "\n".join(lines)


def run(dwg: Path, scr: Path, pdf: Path, limit: int = 150) -> bool:
    pat = f"{dwg} -b"
    subprocess.run(["open", "-na", APP, "--args", str(dwg), "-b", str(scr)], check=True)
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(3)
        if pdf.exists() and pdf.stat().st_size > 0:
            time.sleep(4)
            break
    # tunggu proses keluar sendiri; paksa hanya bila macet
    for _ in range(20):
        if subprocess.run(["pgrep", "-f", pat], capture_output=True).returncode != 0:
            break
        time.sleep(1)
    else:
        subprocess.run(["pkill", "-f", pat])
    return pdf.exists() and pdf.stat().st_size > 0


def main() -> None:
    reg = json.loads((ROOT / "drawings/register.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(exist_ok=True)
    results = []
    for s in reg["sheets"]:
        src = ROOT / "cad/out" / f"{s['id']}.dwg"
        for lay in layouts(s["id"], s["pdf_pages"]):
            dwg = WORK / f"{lay}.dwg"
            shutil.copyfile(src, dwg)
            pdf = OUT / f"{lay}.pdf"
            if pdf.exists():
                pdf.unlink()
            scr = WORK / f"{lay}.scr"
            scr.write_text(script(lay, PAPER[s["size"]], pdf))
            ok = False
            for _attempt in range(3):
                ok = run(dwg, scr, pdf, limit=180)
                if ok:
                    break
                subprocess.run(["pkill", "-f", f"{dwg} -b"])
                time.sleep(5)
            fonts = subprocess.run(["pdffonts", str(pdf)], capture_output=True, text=True).stdout if ok else ""
            info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout if ok else ""
            rec = {"sheet": s["id"], "layout": lay, "ok": ok, "source_dwg_sha256": sha(src),
                   "pdf_sha256": sha(pdf) if ok else None, "bytes": pdf.stat().st_size if ok else 0,
                   "creator_autocad": "AutoCAD 2025" in info,
                   "page_size": next((l.split(":", 1)[1].strip() for l in info.splitlines() if l.startswith("Page size")), None),
                   "fonts_embedded": [l.split()[0] for l in fonts.splitlines()[2:]],
                   "simplex_substitution": "simplex" in fonts.lower()}
            results.append(rec)
            print(json.dumps(rec), flush=True)
    (OUT / "native-plot-results.json").write_text(json.dumps(results, indent=1))
    print("NATIVE_PLOT_OK=%d/%d" % (sum(r["ok"] for r in results), len(results)))


if __name__ == "__main__":
    main()
