"""Reliastra-managed AI.

Only a service lives here. There is no router, model or repository: the LLM
used for evidence explanations belongs to Reliastra and is configured through
``RELIASTRA_AI_*`` platform settings, not through tenant-owned records.
"""
