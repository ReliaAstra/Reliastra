"""Superseded by ``app.modules.vendors.registry``.

The original flat seed list is kept for archaeological reference only; the
canonical, validated, much larger registry drives seeding now. Do not add
vendors here and do not import this module from new code - ``registry.py``
is the single onboarding surface.

Historical note: these five slugs (stripe, auth0, cloudflare, openai,
twilio) are in production URLs, and the registry preserves them exactly.
"""

SEED_VENDORS: list[dict[str, str]] = [
    {
        "vendor_name": "stripe",
        "display_name": "Stripe",
        "endpoint_url": "https://status.stripe.com",
        "category": "payments",
    },
    {
        "vendor_name": "auth0",
        "display_name": "Auth0",
        "endpoint_url": "https://status.auth0.com",
        "category": "identity",
    },
    {
        "vendor_name": "cloudflare",
        "display_name": "Cloudflare",
        "endpoint_url": "https://www.cloudflarestatus.com",
        "category": "cloud",
    },
    {
        "vendor_name": "openai",
        "display_name": "OpenAI",
        "endpoint_url": "https://status.openai.com",
        "category": "ai",
    },
    {
        "vendor_name": "twilio",
        "display_name": "Twilio",
        "endpoint_url": "https://status.twilio.com",
        "category": "communications",
    },
]
