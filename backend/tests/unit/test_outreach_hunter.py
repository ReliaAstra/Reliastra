"""Unit tests for the outreach hunter kill-first rules (no DB, no network)."""

from app.modules.outreach import hunter


def test_whale_killed_before_anything_else():
    verdict = hunter.judge("We are a global digital transformation enterprise with offices in 12 countries")
    assert not verdict.keep
    assert verdict.kill_reason is not None and verdict.kill_reason.startswith("whale:")


def test_oversize_team_killed():
    verdict = hunter.judge("Our team of 250 professionals delivers care plans and monthly maintenance")
    assert not verdict.keep
    assert verdict.kill_reason is not None and verdict.kill_reason.startswith("size:")


def test_freelancer_without_retainer_killed():
    verdict = hunter.judge("About me: I'm a freelance web designer. Hire me for your next project.")
    assert not verdict.keep


def test_care_plan_agency_kept_with_signals():
    verdict = hunter.judge(
        "Our website care plans start at $99/mo. Monthly maintenance, managed hosting, "
        "and ongoing support from our team of 12."
    )
    assert verdict.keep
    assert verdict.size_band == "5-50"
    assert verdict.retainer_signals


def test_no_retainer_language_killed():
    verdict = hunter.judge("We build beautiful brand identities and award-winning marketing campaigns.")
    assert not verdict.keep
    assert verdict.kill_reason == "no-retainer-language"


def test_normalize_domain_strips_www_and_path():
    assert hunter.normalize_domain("https://www.AltAgency.co.uk/services/maintenance/") == "altagency.co.uk"
    assert hunter.normalize_domain("not a url at all!!!") == ""


def test_extract_emails_prefers_real_addresses_and_skips_noreply():
    html = (
        '<a href="mailto:hello@altagency.co.uk">mail</a> '
        '<a href="mailto:noreply@altagency.co.uk">x</a> '
        "Contact support@altagency.co.uk for help"
    )
    emails = hunter.extract_emails(html, "altagency.co.uk")
    assert "hello@altagency.co.uk" in emails
    assert "support@altagency.co.uk" in emails
    assert "noreply@altagency.co.uk" not in emails


def test_build_draft_anchors_on_evidence():
    subject, body, angle = hunter.build_draft("ALT Agency", "$99/mo", ["care plan"])
    assert "care plan" in angle
    assert "$99/mo" in subject
    assert "ALT Agency" in body


def test_extract_ddg_results_unwraps_uddg_links():
    html = (
        '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Famadesignagency.com%2Fwebsite%2Dcare%2Dplans&rut=abc">x</a>'
        '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Fsomepage&rut=def">y</a>'
    )
    results = hunter.extract_ddg_results(html)
    assert results == ["https://amadesignagency.com/website-care-plans"]


def test_extract_outbound_candidates_skips_own_and_blocklisted():
    html = (
        '<a href="https://someagency.co.uk/">agency</a>'
        '<a href="https://linkedin.com/company/x">li</a>'
        '<a href="https://thedirectory.com/about">own</a>'
        '<a href="/relative/path">rel</a>'
    )
    results = hunter.extract_outbound_candidates(html, "thedirectory.com")
    assert results == ["https://someagency.co.uk/"]


def test_discovery_query_rotates_daily():
    first = hunter.discovery_query_for_today(None)
    assert first in hunter.DISCOVERY_QUERIES
    custom = hunter.discovery_query_for_today("alpha\nbeta")
    assert custom in ("alpha", "beta")
