"""Canonical commercial terms: no invented refund window, $9 Developer."""

from app.core.commercial_terms import (
    REFUND_PERIOD_DAYS,
    public_policy,
    refund_summary,
    terms_acceptance_label,
)
from app.core.permissions import PLAN_ANNUAL_PRICES_USD, PLAN_PRICES_USD, TRIAL_DAYS


def test_no_advertised_refund_window():
    assert REFUND_PERIOD_DAYS is None
    policy = public_policy()
    assert policy["refund_period_days"] is None
    assert policy["pro_price_usd"] == 9
    assert policy["trial_length_days"] == TRIAL_DAYS == 14
    assert policy["trial_requires_payment"] is False
    assert "money-back window" in refund_summary().lower()
    assert "14-day money-back" not in refund_summary().lower()
    assert "$9" in terms_acceptance_label()


def test_canonical_usd_list_price():
    """One paid product: Developer, $9/month. No annual billing exists."""
    assert PLAN_PRICES_USD["pro"] == 9
    assert PLAN_ANNUAL_PRICES_USD["pro"] is None
