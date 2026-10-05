"""Every PRD section 12 Must has AC/test/failure/boundary rows whose references exist (R2)."""
from tools.must_audit import audit


def test_must_audit_is_complete_and_references_exist():
    rep = audit()
    assert rep["problems"] == [], rep["problems"]
    assert len(rep["prdRequirements"]) == 12


def test_committed_report_matches_the_generator():
    # A hand edit to the .md (2a0a599) left the summary line and the JSON
    # source disagreeing with the rows; the report must only come from the JSON.
    from pathlib import Path
    from tools.must_audit import ROOT, render
    assert (Path(ROOT) / "docs" / "MUST-AUDIT.md").read_text(encoding="utf-8") == render(audit())
