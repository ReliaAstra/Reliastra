"""Outbound agency-hunter module (V1).

Daily hunter: seed URLs (care-plan pages, geo-TLD sweeps, partner dirs)
-> fetch -> kill-first (whale/freelancer, no LLM) -> extract + draft
-> dedup on domain+email -> suppression check -> warmup-capped review queue
-> human approve -> send via isolated outreach Resend stream.

Manual review is mandatory in V1: there is no auto-send path.
"""

from app.modules.outreach.router import router as outreach_admin_router

__all__ = ["outreach_admin_router"]
