"""Acquisition attribution - where did this customer originally come from?

First-party FIRST TOUCH capture: UTM parameters observed at a visitor's
arriving page are persisted client-side (write-once) and attached to the
RELIASTRA account at signup. First-touch records are immutable; later
campaigns may only refresh the non-destructive ``last_*`` mirror.

Deliberately out of scope here:
* Incident/vendor blame attribution -> ``app.modules.attribution``
* Partner/referral commissions     -> ``app.modules.partners``
* Multi-touch analytics / warehouses
"""

from app.modules.acquisition.models import AcquisitionFirstTouch

__all__ = ["AcquisitionFirstTouch"]
