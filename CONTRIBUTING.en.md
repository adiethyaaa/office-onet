[Bahasa Indonesia](CONTRIBUTING.md) · **English**

# Contributing

Bug reports, ideas, and pull requests are welcome. This guide explains how to set up the repo and what gets checked before a change is merged.

## Setup

```bash
git clone https://github.com/air-buddy410/kantor-rpg.git
cd kantor-rpg/app
npm ci
npm run dev
```

For the backend, Python, Blender, and CAD, see [INSTALL.en.md](INSTALL.en.md) and [docs/REBUILD.md](docs/REBUILD.md).

## Before opening a pull request

Run the same checks as CI:

```bash
cd app
npx tsc --noEmit
npx vitest run
npx playwright test
cd ../server && npm test
```

If you change `design/`, `tools/`, `cad/`, or `blender/`, also run:

```bash
python3 tools/build_design.py
python3 -m pytest tests/py -q
```

## Rules enforced by tests

- `design/world.json` is the single source of building data. Change the dataset. Do not edit its derived outputs (`design/derived/`, `cad/out/`, `drawings/`) by hand.
- Assets must be self-made or clearly licensed, and recorded in `design/asset-registry.json`. `tests/py/test_provenance.py` fails if any file has an unknown origin.
- 3D surfaces with different colors must not sit on the same plane. `app/tests/unit/coplanar.test.ts` catches this.
- Do not commit credentials, tokens, private server addresses, or chat data. `tools/safety_scan.py` checks for common patterns.
- New architecture decisions are recorded as ADRs in `docs/decisions.md`.

## Reporting bugs

Include your browser and device, the full URL (including `?seed=` if present), steps to reproduce, and a screenshot. For 3D display issues, also mention the graphics quality option selected in Pengaturan (Settings).

## License

By submitting a contribution, you agree that it is released under the same [MIT license](LICENSE) as this project.
