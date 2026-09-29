"""The configured check interval must be one the scheduler can actually honour.

`PLAN_CHECK_INTERVALS` is a commercial promise. `CHECK_SCHEDULE_SECONDS` is a
physical limit. Enforcing only the first let a dependency store an interval the
Beat tick can never reach: a plan with no configured floor could set 1 second and
be probed every 30, and the row would claim 1 for as long as it existed.
"""

import pytest

from app.config import settings
from app.platform.commercial.entitlements import (
    get_deliverable_check_interval,
    get_min_check_interval,
)


class TestDeliverableFloor:
    def test_never_below_the_scheduler_tick(self):
        tick = int(float(settings.CHECK_SCHEDULE_SECONDS))
        for plan in ("free", "pro", "enterprise", "unknown-plan"):
            assert get_deliverable_check_interval(plan) >= tick, plan

    def test_enterprise_is_bounded_rather_than_unbounded(self):
        """No plan floor must mean "platform floor", not "any value at all"."""
        assert get_min_check_interval("enterprise") is None
        assert get_deliverable_check_interval("enterprise") == int(
            float(settings.CHECK_SCHEDULE_SECONDS)
        )

    def test_keeps_the_plan_floor_when_it_is_stricter(self):
        # Free is 60s, which is slower than the 30s tick, so the plan wins.
        assert get_deliverable_check_interval("free") == 60
        assert get_deliverable_check_interval("pro") == 30

    def test_follows_a_slower_tick(self, monkeypatch):
        """A slower scheduler raises the floor even for an unlimited plan."""
        monkeypatch.setattr(settings, "CHECK_SCHEDULE_SECONDS", 90.0, raising=False)
        assert get_deliverable_check_interval("enterprise") == 90
        assert get_deliverable_check_interval("pro") == 90
        assert get_deliverable_check_interval("free") == 90

    def test_survives_a_nonsense_tick(self, monkeypatch):
        """A zero or missing tick must not collapse the floor to zero."""
        for bad in (0, 0.0, None, ""):
            monkeypatch.setattr(settings, "CHECK_SCHEDULE_SECONDS", bad, raising=False)
            assert get_deliverable_check_interval("enterprise") >= 1

    @pytest.mark.parametrize("requested,plan,expected_error", [
        (1, "enterprise", True),      # below the tick
        (5, "enterprise", True),      # below the tick
        (30, "enterprise", False),     # exactly the tick
        (29, "pro", True),             # below the plan floor
        (30, "pro", False),
        (59, "free", True),            # below the plan floor
        (60, "free", False),
    ])
    def test_acceptance_matrix(self, requested, plan, expected_error):
        """A caller is refused exactly when the interval is undeliverable."""
        refused = requested < get_deliverable_check_interval(plan)
        assert refused is expected_error, f"{requested}s on {plan}"
