"""Prospect AI: import prospect research reports, generate outreach drafts.

The operator uploads a RELIASTRA prospect report (the daily research JSON,
optionally with its Markdown twin). Each prospect becomes a lead row. The
Reliastra-managed LLM (``app.modules.ai_integration``) drafts a first-touch
email per lead from the *pre-researched evidence only* - the model is
instructed to never invent facts, measurements, or vendor claims.

Nothing sends automatically: drafts are human-reviewed, edited if needed,
and sent one at a time through the Email Center pipeline
(:class:`app.modules.email_center.service.EmailService`), so every send
keeps its audit record and Resend delivery trail.
"""
