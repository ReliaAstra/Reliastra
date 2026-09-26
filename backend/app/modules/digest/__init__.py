"""Digest drafts: newsletter and social content, generated for review.

Phase 9 of the intelligence rollout. Canonical public incident records are
rendered into DRAFT content (weekly newsletter, per-incident social posts)
by an idempotent, scheduled generator. The pipeline ends at draft rows -
human review and delivery happen on the admin surface and outside this
module. No auto-posting, ever.
"""
