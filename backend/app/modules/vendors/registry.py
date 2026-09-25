"""Deterministic vendor registry for the public intelligence catalog.

The registry is the configuration driven onboarding surface for the
observatory: one typed, version controlled entry per vendor, validated by
``validate_registry`` (continuous safety) and executed by
``vendor_service.seed_vendors`` (idempotent upsert into the database).

Design rules:

* The vendor_name IS the canonical public slug. It is part of deployed URLs
  (/observatory/{vendor_name}) and never changes once public.
* Every target is a publicly documented status/health surface observed over
  HTTPS GET expecting 200. That is the existing methodology
  (status_page, v1.0); new target kinds require a new methodology version,
  not a silent reinterpretation.
* The FIRST target of a vendor is its primary observed surface. The primary
  target's URL continues to populate ``vendor_trackings.endpoint_url``,
  which the catalog's recent_status derives from. Do not reorder a
  deployed vendor's targets without thinking about that derivation.
* Targets are selected for determinism and public documentation quality:
  a machine reachable HTTPS endpoint whose 200 response is stable enough
  to mean "the public surface answered".

Adding a vendor: append a RegistryVendor entry, run the registry tests,
deploy. The daily registry sync (beat) applies it; operators may also invoke
``app.modules.vendors.tasks.seed_vendors`` immediately. Seeding only ever
inserts or updates identity fields and inserts missing endpoints; it never
deactivates or deletes existing rows.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from urllib.parse import urlparse

from app.modules.vendors.taxonomy import CATEGORIES_BY_SLUG


@dataclass(frozen=True)
class TargetDefinition:
    """One deterministic observation target for a vendor."""

    url: str
    slug: str
    name: str
    kind: str = "status_page"
    product: str | None = None
    display_order: int = 100


@dataclass(frozen=True)
class RegistryVendor:
    """One canonical infrastructure vendor definition."""

    vendor_name: str
    display_name: str
    category: str
    targets: tuple[TargetDefinition, ...]
    description: str
    official_name: str | None = None
    website_url: str | None = None
    documentation_url: str | None = None
    status_page_url: str | None = None
    country: str | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)


def _status(url: str, *, slug: str = "status", name: str = "Official status page") -> TargetDefinition:
    """Convenience for the standard single status page target."""
    return TargetDefinition(url=url, slug=slug, name=name)


REGISTRY: tuple[RegistryVendor, ...] = (
    # ------------------------------------------------------------- ai
    RegistryVendor(
        vendor_name="openai",
        display_name="OpenAI",
        official_name="OpenAI, Inc.",
        category="ai",
        description=(
            "Foundation model provider behind the GPT family and the "
            "OpenAI API used by a large share of production AI features."
        ),
        website_url="https://openai.com",
        documentation_url="https://platform.openai.com/docs",
        status_page_url="https://status.openai.com",
        country="United States",
        tags=("llm", "api"),
        targets=(_status("https://status.openai.com"),),
    ),
    RegistryVendor(
        vendor_name="anthropic",
        display_name="Anthropic",
        official_name="Anthropic PBC",
        category="ai",
        description=(
            "Foundation model provider behind the Claude family, with the "
            "Anthropic API as the primary integration surface."
        ),
        website_url="https://www.anthropic.com",
        documentation_url="https://docs.anthropic.com",
        status_page_url="https://status.anthropic.com",
        country="United States",
        tags=("llm", "api"),
        targets=(_status("https://status.anthropic.com"),),
    ),
    RegistryVendor(
        vendor_name="mistral",
        display_name="Mistral AI",
        official_name="Mistral AI SAS",
        category="ai",
        description=(
            "European foundation model provider; La Plateforme is the "
            "hosted inference API for the Mistral model family."
        ),
        website_url="https://mistral.ai",
        documentation_url="https://docs.mistral.ai",
        status_page_url="https://status.mistral.ai",
        country="France",
        tags=("llm", "api"),
        targets=(_status("https://status.mistral.ai"),),
    ),
    RegistryVendor(
        vendor_name="cohere",
        display_name="Cohere",
        official_name="Cohere Inc.",
        category="ai",
        description=(
            "Foundation model provider focused on enterprise retrieval, "
            "generation and embedding workloads."
        ),
        website_url="https://cohere.com",
        documentation_url="https://docs.cohere.com",
        status_page_url="https://status.cohere.com",
        country="Canada",
        tags=("llm", "api"),
        targets=(_status("https://status.cohere.com"),),
    ),
    RegistryVendor(
        vendor_name="groq",
        display_name="Groq",
        official_name="Groq, Inc.",
        category="ai",
        description=(
            "Low latency inference provider running open weight models on "
            "custom LPU hardware."
        ),
        website_url="https://groq.com",
        documentation_url="https://console.groq.com/docs",
        status_page_url="https://groqstatus.com",
        country="United States",
        tags=("llm", "inference"),
        targets=(_status("https://groqstatus.com"),),
    ),
    RegistryVendor(
        vendor_name="xai",
        display_name="xAI",
        official_name="xAI Corp.",
        category="ai",
        description=(
            "Foundation model provider behind the Grok family and the xAI API."
        ),
        website_url="https://x.ai",
        documentation_url="https://docs.x.ai",
        status_page_url="https://status.x.ai",
        country="United States",
        tags=("llm", "api"),
        targets=(_status("https://status.x.ai"),),
    ),
    RegistryVendor(
        vendor_name="together",
        display_name="Together AI",
        official_name="Together AI, Inc.",
        category="ai",
        description=(
            "Inference cloud for open weight foundation models, including "
            "fine tuning and dedicated capacity."
        ),
        website_url="https://www.together.ai",
        documentation_url="https://docs.together.ai",
        status_page_url="https://status.together.ai",
        country="United States",
        tags=("llm", "inference"),
        targets=(_status("https://status.together.ai"),),
    ),
    RegistryVendor(
        vendor_name="huggingface",
        display_name="Hugging Face",
        official_name="Hugging Face, Inc.",
        category="ai",
        description=(
            "Model hub and inference platform; the default distribution "
            "point for open weight models and datasets."
        ),
        website_url="https://huggingface.co",
        documentation_url="https://huggingface.co/docs",
        status_page_url="https://status.huggingface.co",
        country="United States",
        tags=("llm", "hub"),
        targets=(_status("https://status.huggingface.co"),),
    ),
    # ------------------------------------------------------- payments
    RegistryVendor(
        vendor_name="stripe",
        display_name="Stripe",
        official_name="Stripe, Inc.",
        category="payments",
        description=(
            "Payment processing and billing platform; one of the most "
            "common revenue path dependencies in production software."
        ),
        website_url="https://stripe.com",
        documentation_url="https://docs.stripe.com",
        status_page_url="https://status.stripe.com",
        country="United States",
        tags=("payments", "billing"),
        targets=(_status("https://status.stripe.com"),),
    ),
    RegistryVendor(
        vendor_name="paypal",
        display_name="PayPal",
        official_name="PayPal Holdings, Inc.",
        category="payments",
        description=(
            "Consumer and merchant payment platform with checkout, "
            "wallet and payouts surfaces."
        ),
        website_url="https://www.paypal.com",
        documentation_url="https://developer.paypal.com",
        status_page_url="https://www.paypal-status.com",
        country="United States",
        tags=("payments", "checkout"),
        targets=(_status("https://www.paypal-status.com"),),
    ),
    RegistryVendor(
        vendor_name="adyen",
        display_name="Adyen",
        official_name="Adyen N.V.",
        category="payments",
        description=(
            "Global acquiring and payment platform used by large "
            "merchants and marketplaces."
        ),
        website_url="https://www.adyen.com",
        documentation_url="https://docs.adyen.com",
        status_page_url="https://status.adyen.com",
        country="Netherlands",
        tags=("payments", "acquiring"),
        targets=(_status("https://status.adyen.com"),),
    ),
    RegistryVendor(
        vendor_name="paddle",
        display_name="Paddle",
        official_name="Paddle.com Market Ltd",
        category="payments",
        description=(
            "Merchant of record billing platform popular with SaaS and "
            "software sellers."
        ),
        website_url="https://www.paddle.com",
        documentation_url="https://developer.paddle.com",
        status_page_url="https://status.paddle.com",
        country="United Kingdom",
        tags=("payments", "billing"),
        targets=(_status("https://status.paddle.com"),),
    ),
    RegistryVendor(
        vendor_name="braintree",
        display_name="Braintree",
        official_name="Braintree, a PayPal service",
        category="payments",
        description=(
            "Payment gateway for cards, wallets and marketplace payments, "
            "operated as a PayPal service."
        ),
        website_url="https://www.braintreepayments.com",
        documentation_url="https://developer.paypal.com/braintree/docs",
        status_page_url="https://status.braintreepayments.com",
        country="United States",
        tags=("payments", "gateway"),
        targets=(_status("https://status.braintreepayments.com"),),
    ),
    # ------------------------------------------------------- identity
    RegistryVendor(
        vendor_name="auth0",
        display_name="Auth0",
        official_name="Auth0 by Okta",
        category="identity",
        description=(
            "Identity platform for authentication and authorization, now "
            "part of Okta."
        ),
        website_url="https://auth0.com",
        documentation_url="https://auth0.com/docs",
        status_page_url="https://status.auth0.com",
        country="United States",
        tags=("identity", "authentication"),
        targets=(_status("https://status.auth0.com"),),
    ),
    RegistryVendor(
        vendor_name="clerk",
        display_name="Clerk",
        official_name="Clerk, Inc.",
        category="identity",
        description=(
            "Drop in authentication and user management platform for "
            "modern web applications."
        ),
        website_url="https://clerk.com",
        documentation_url="https://clerk.com/docs",
        status_page_url="https://status.clerk.com",
        country="United States",
        tags=("identity", "authentication"),
        targets=(_status("https://status.clerk.com"),),
    ),
    RegistryVendor(
        vendor_name="okta",
        display_name="Okta",
        official_name="Okta, Inc.",
        category="identity",
        description=(
            "Enterprise identity and access management platform covering "
            "workforce and customer identity."
        ),
        website_url="https://www.okta.com",
        documentation_url="https://developer.okta.com",
        status_page_url="https://status.okta.com",
        country="United States",
        tags=("identity", "sso"),
        targets=(_status("https://status.okta.com"),),
    ),
    RegistryVendor(
        vendor_name="workos",
        display_name="WorkOS",
        official_name="WorkOS, Inc.",
        category="identity",
        description=(
            "Enterprise readiness APIs: SSO, directory sync, audit logs "
            "and admin tooling."
        ),
        website_url="https://workos.com",
        documentation_url="https://workos.com/docs",
        status_page_url="https://status.workos.com",
        country="United States",
        tags=("identity", "sso"),
        targets=(_status("https://status.workos.com"),),
    ),
    RegistryVendor(
        vendor_name="stytch",
        display_name="Stytch",
        official_name="Stytch, Inc.",
        category="identity",
        description=(
            "Passwordless authentication API: magic links, OTPs, sessions "
            "and B2B auth primitives."
        ),
        website_url="https://stytch.com",
        documentation_url="https://stytch.com/docs",
        status_page_url="https://status.stytch.com",
        country="United States",
        tags=("identity", "authentication"),
        targets=(_status("https://status.stytch.com"),),
    ),
    # -------------------------------------------------- communications
    RegistryVendor(
        vendor_name="twilio",
        display_name="Twilio",
        official_name="Twilio Inc.",
        category="communications",
        description=(
            "Communications platform for SMS, voice, video and email APIs."
        ),
        website_url="https://www.twilio.com",
        documentation_url="https://www.twilio.com/docs",
        status_page_url="https://status.twilio.com",
        country="United States",
        tags=("sms", "voice"),
        targets=(_status("https://status.twilio.com"),),
    ),
    RegistryVendor(
        vendor_name="telnyx",
        display_name="Telnyx",
        official_name="Telnyx LLC",
        category="communications",
        description=(
            "Carrier grade communications API for voice, messaging and "
            "global connectivity."
        ),
        website_url="https://telnyx.com",
        documentation_url="https://developers.telnyx.com",
        status_page_url="https://status.telnyx.com",
        country="United States",
        tags=("sms", "voice"),
        targets=(_status("https://status.telnyx.com"),),
    ),
    RegistryVendor(
        vendor_name="resend",
        display_name="Resend",
        official_name="Resend, Inc.",
        category="communications",
        description=(
            "Developer first transactional email API."
        ),
        website_url="https://resend.com",
        documentation_url="https://resend.com/docs",
        status_page_url="https://status.resend.com",
        country="United States",
        tags=("email", "transactional"),
        targets=(_status("https://status.resend.com"),),
    ),
    RegistryVendor(
        vendor_name="sendgrid",
        display_name="SendGrid",
        official_name="Twilio SendGrid",
        category="communications",
        description=(
            "Email delivery platform for transactional and marketing email "
            "at scale."
        ),
        website_url="https://sendgrid.com",
        documentation_url="https://docs.sendgrid.com",
        status_page_url="https://status.sendgrid.com",
        country="United States",
        tags=("email", "delivery"),
        targets=(_status("https://status.sendgrid.com"),),
    ),
    RegistryVendor(
        vendor_name="postmark",
        display_name="Postmark",
        official_name="Postmark (Wildbit, activecampaign)",
        category="communications",
        description=(
            "Transactional email delivery service focused on speed and "
            "deliverability."
        ),
        website_url="https://postmarkapp.com",
        documentation_url="https://postmarkapp.com/developer",
        status_page_url="https://status.postmarkapp.com",
        country="United States",
        tags=("email", "transactional"),
        targets=(_status("https://status.postmarkapp.com"),),
    ),
    # ---------------------------------------------------------- cloud
    RegistryVendor(
        vendor_name="cloudflare",
        display_name="Cloudflare",
        official_name="Cloudflare, Inc.",
        category="cloud",
        description=(
            "Global network providing CDN, DNS, security and edge compute; "
            "a structural dependency for a large share of the web."
        ),
        website_url="https://www.cloudflare.com",
        documentation_url="https://developers.cloudflare.com",
        status_page_url="https://www.cloudflarestatus.com",
        country="United States",
        tags=("cdn", "edge", "dns"),
        targets=(_status("https://www.cloudflarestatus.com"),),
    ),
    RegistryVendor(
        vendor_name="vercel",
        display_name="Vercel",
        official_name="Vercel Inc.",
        category="cloud",
        description=(
            "Frontend hosting and serverless deployment platform behind a "
            "large share of Next.js production workloads."
        ),
        website_url="https://vercel.com",
        documentation_url="https://vercel.com/docs",
        status_page_url="https://www.vercel-status.com",
        country="United States",
        tags=("hosting", "edge"),
        targets=(_status("https://www.vercel-status.com"),),
    ),
    RegistryVendor(
        vendor_name="flyio",
        display_name="Fly.io",
        official_name="Fly.io, Inc.",
        category="cloud",
        description=(
            "Global application platform running containers close to users "
            "on a private anycast network."
        ),
        website_url="https://fly.io",
        documentation_url="https://fly.io/docs",
        status_page_url="https://status.flyio.net",
        country="United States",
        tags=("hosting", "edge"),
        targets=(_status("https://status.flyio.net"),),
    ),
    RegistryVendor(
        vendor_name="digitalocean",
        display_name="DigitalOcean",
        official_name="DigitalOcean Holdings, Inc.",
        category="cloud",
        description=(
            "Developer oriented cloud provider for compute, storage and "
            "managed databases."
        ),
        website_url="https://www.digitalocean.com",
        documentation_url="https://docs.digitalocean.com",
        status_page_url="https://status.digitalocean.com",
        country="United States",
        tags=("cloud", "compute"),
        targets=(_status("https://status.digitalocean.com"),),
    ),
    RegistryVendor(
        vendor_name="netlify",
        display_name="Netlify",
        official_name="Netlify, Inc.",
        category="cloud",
        description=(
            "Composible web platform for hosting, serverless functions and "
            "edge delivery."
        ),
        website_url="https://www.netlify.com",
        documentation_url="https://docs.netlify.com",
        status_page_url="https://status.netlify.com",
        country="United States",
        tags=("hosting", "edge"),
        targets=(_status("https://status.netlify.com"),),
    ),
    RegistryVendor(
        vendor_name="render",
        display_name="Render",
        official_name="Render (Render Services, Inc.)",
        category="cloud",
        description=(
            "Unified cloud for web services, background workers, cron jobs "
            "and managed databases."
        ),
        website_url="https://render.com",
        documentation_url="https://render.com/docs",
        status_page_url="https://status.render.com",
        country="United States",
        tags=("hosting", "compute"),
        targets=(_status("https://status.render.com"),),
    ),
    RegistryVendor(
        vendor_name="aws",
        display_name="Amazon Web Services",
        official_name="Amazon Web Services, Inc.",
        category="cloud",
        description=(
            "The largest public cloud provider; the public health dashboard "
            "is the observation surface tracked here."
        ),
        website_url="https://aws.amazon.com",
        documentation_url="https://docs.aws.amazon.com",
        status_page_url="https://status.aws.amazon.com",
        country="United States",
        tags=("cloud", "compute", "storage"),
        targets=(_status("https://status.aws.amazon.com"),),
    ),
    # ------------------------------------------------------- databases
    RegistryVendor(
        vendor_name="supabase",
        display_name="Supabase",
        official_name="Supabase, Inc.",
        category="databases",
        description=(
            "Hosted Postgres platform with auth, realtime, storage and "
            "edge functions."
        ),
        website_url="https://supabase.com",
        documentation_url="https://supabase.com/docs",
        status_page_url="https://status.supabase.com",
        country="United States",
        tags=("postgres", "backend"),
        targets=(_status("https://status.supabase.com"),),
    ),
    RegistryVendor(
        vendor_name="neon",
        display_name="Neon",
        official_name="Neon, Inc.",
        category="databases",
        description=(
            "Serverless Postgres platform separating storage and compute."
        ),
        website_url="https://neon.tech",
        documentation_url="https://neon.tech/docs",
        status_page_url="https://neonstatus.com",
        country="United States",
        tags=("postgres", "serverless"),
        targets=(_status("https://neonstatus.com"),),
    ),
    RegistryVendor(
        vendor_name="planetscale",
        display_name="PlanetScale",
        official_name="PlanetScale, Inc.",
        category="databases",
        description=(
            "Serverless MySQL compatible platform built on Vitess."
        ),
        website_url="https://planetscale.com",
        documentation_url="https://planetscale.com/docs",
        status_page_url="https://www.planetscalestatus.com",
        country="United States",
        tags=("mysql", "serverless"),
        targets=(_status("https://www.planetscalestatus.com"),),
    ),
    RegistryVendor(
        vendor_name="mongodb",
        display_name="MongoDB Atlas",
        official_name="MongoDB, Inc.",
        category="databases",
        description=(
            "Managed MongoDB database platform; the Atlas cloud service "
            "is the observed surface."
        ),
        website_url="https://www.mongodb.com",
        documentation_url="https://www.mongodb.com/docs",
        status_page_url="https://status.cloud.mongodb.com",
        country="United States",
        tags=("document", "database"),
        targets=(_status("https://status.cloud.mongodb.com"),),
    ),
    RegistryVendor(
        vendor_name="upstash",
        display_name="Upstash",
        official_name="Upstash, Inc.",
        category="databases",
        description=(
            "Serverless data platform for Redis compatible caching, Kafka "
            "compatible streaming and vector search."
        ),
        website_url="https://upstash.com",
        documentation_url="https://upstash.com/docs",
        status_page_url="https://upstash.instatus.com",
        country="United States",
        tags=("redis", "serverless"),
        targets=(_status("https://upstash.instatus.com"),),
    ),
    # --------------------------------------------------------- storage
    RegistryVendor(
        vendor_name="backblaze",
        display_name="Backblaze B2",
        official_name="Backblaze, Inc.",
        category="storage",
        description=(
            "S3 compatible object storage platform used for backups, "
            "assets and data lakes."
        ),
        website_url="https://www.backblaze.com",
        documentation_url="https://www.backblaze.com/docs",
        status_page_url="https://status.backblaze.com",
        country="United States",
        tags=("object-storage", "s3-compatible"),
        targets=(_status("https://status.backblaze.com"),),
    ),
    # ------------------------------------------------------- devtools
    RegistryVendor(
        vendor_name="github",
        display_name="GitHub",
        official_name="GitHub, Inc.",
        category="devtools",
        description=(
            "Git hosting, code review, Actions CI and package delivery; the "
            "center of most developer workflows."
        ),
        website_url="https://github.com",
        documentation_url="https://docs.github.com",
        status_page_url="https://www.githubstatus.com",
        country="United States",
        tags=("git", "ci"),
        targets=(_status("https://www.githubstatus.com"),),
    ),
    RegistryVendor(
        vendor_name="gitlab",
        display_name="GitLab",
        official_name="GitLab Inc.",
        category="devtools",
        description=(
            "DevOps platform covering source control, CI/CD and security "
            "scanning in one surface."
        ),
        website_url="https://gitlab.com",
        documentation_url="https://docs.gitlab.com",
        status_page_url="https://status.gitlab.com",
        country="United States",
        tags=("git", "ci"),
        targets=(_status("https://status.gitlab.com"),),
    ),
    RegistryVendor(
        vendor_name="circleci",
        display_name="CircleCI",
        official_name="Circle Internet Services, Inc.",
        category="devtools",
        description=(
            "Continuous integration and delivery platform for pipelines "
            "at scale."
        ),
        website_url="https://circleci.com",
        documentation_url="https://circleci.com/docs",
        status_page_url="https://status.circleci.com",
        country="United States",
        tags=("ci", "cd"),
        targets=(_status("https://status.circleci.com"),),
    ),
    RegistryVendor(
        vendor_name="docker",
        display_name="Docker Hub",
        official_name="Docker, Inc.",
        category="devtools",
        description=(
            "Container image registry and distribution; a hard dependency "
            "for builds and deployments that pull public images."
        ),
        website_url="https://www.docker.com",
        documentation_url="https://docs.docker.com",
        status_page_url="https://status.docker.com",
        country="United States",
        tags=("registry", "containers"),
        targets=(_status("https://status.docker.com"),),
    ),
    RegistryVendor(
        vendor_name="npm",
        display_name="npm",
        official_name="npm, Inc. (GitHub)",
        category="devtools",
        description=(
            "JavaScript package registry; the default distribution channel "
            "for the Node.js ecosystem."
        ),
        website_url="https://www.npmjs.com",
        documentation_url="https://docs.npmjs.com",
        status_page_url="https://status.npmjs.org",
        country="United States",
        tags=("registry", "javascript"),
        targets=(_status("https://status.npmjs.org"),),
    ),
    RegistryVendor(
        vendor_name="pypi",
        display_name="PyPI",
        official_name="Python Package Index (PSF)",
        category="devtools",
        description=(
            "Python package registry operated by the Python Software "
            "Foundation; the default distribution channel for Python."
        ),
        website_url="https://pypi.org",
        documentation_url="https://packaging.python.org",
        status_page_url="https://status.python.org",
        country="United States",
        tags=("registry", "python"),
        targets=(_status("https://status.python.org"),),
    ),
    # --------------------------------------------------- collaboration
    RegistryVendor(
        vendor_name="slack",
        display_name="Slack",
        official_name="Slack Technologies (Salesforce)",
        category="collaboration",
        description=(
            "Workplace messaging platform; its API underpins alerts, bots "
            "and workflow integrations."
        ),
        website_url="https://slack.com",
        documentation_url="https://api.slack.com",
        status_page_url="https://status.slack.com",
        country="United States",
        tags=("messaging", "api"),
        targets=(_status("https://status.slack.com"),),
    ),
    RegistryVendor(
        vendor_name="notion",
        display_name="Notion",
        official_name="Notion Labs, Inc.",
        category="collaboration",
        description=(
            "Connected workspace with a public API for docs, wikis and "
            "databases."
        ),
        website_url="https://www.notion.so",
        documentation_url="https://developers.notion.com",
        status_page_url="https://status.notion.so",
        country="United States",
        tags=("docs", "api"),
        targets=(_status("https://status.notion.so"),),
    ),
    RegistryVendor(
        vendor_name="discord",
        display_name="Discord",
        official_name="Discord Inc.",
        category="collaboration",
        description=(
            "Communication platform whose APIs and gateway power community "
            "tooling, bots and support workflows."
        ),
        website_url="https://discord.com",
        documentation_url="https://discord.com/developers/docs",
        status_page_url="https://discordstatus.com",
        country="United States",
        tags=("messaging", "api"),
        targets=(_status("https://discordstatus.com"),),
    ),
    RegistryVendor(
        vendor_name="linear",
        display_name="Linear",
        official_name="Linear Orbit, Inc.",
        category="collaboration",
        description=(
            "Issue tracking and project platform with a GraphQL API wired "
            "into many engineering workflows."
        ),
        website_url="https://linear.app",
        documentation_url="https://developers.linear.app",
        status_page_url="https://linearstatus.com",
        country="United States",
        tags=("issues", "api"),
        targets=(_status("https://linearstatus.com"),),
    ),
    # --------------------------------------------------- observability
    RegistryVendor(
        vendor_name="sentry",
        display_name="Sentry",
        official_name="Functional Software, Inc.",
        category="observability",
        description=(
            "Error tracking and performance monitoring; an outage here "
            "silences the signal engineers rely on to notice everything else."
        ),
        website_url="https://sentry.io",
        documentation_url="https://docs.sentry.io",
        status_page_url="https://status.sentry.io",
        country="United States",
        tags=("errors", "apm"),
        targets=(_status("https://status.sentry.io"),),
    ),
    RegistryVendor(
        vendor_name="datadog",
        display_name="Datadog",
        official_name="Datadog, Inc.",
        category="observability",
        description=(
            "Infrastructure and application monitoring platform for "
            "metrics, logs, traces and synthetics."
        ),
        website_url="https://www.datadoghq.com",
        documentation_url="https://docs.datadoghq.com",
        status_page_url="https://status.datadoghq.com",
        country="United States",
        tags=("metrics", "logs"),
        targets=(_status("https://status.datadoghq.com"),),
    ),
    RegistryVendor(
        vendor_name="grafana",
        display_name="Grafana Cloud",
        official_name="Grafana Labs",
        category="observability",
        description=(
            "Managed observability stack for metrics, logs and traces "
            "from Grafana Labs."
        ),
        website_url="https://grafana.com",
        documentation_url="https://grafana.com/docs",
        status_page_url="https://status.grafana.com",
        country="United States",
        tags=("metrics", "visualization"),
        targets=(_status("https://status.grafana.com"),),
    ),
    RegistryVendor(
        vendor_name="pagerduty",
        display_name="PagerDuty",
        official_name="PagerDuty, Inc.",
        category="observability",
        description=(
            "Incident response and on call management; when it fails, "
            "alerts about other failures stop moving."
        ),
        website_url="https://www.pagerduty.com",
        documentation_url="https://developer.pagerduty.com",
        status_page_url="https://status.pagerduty.com",
        country="United States",
        tags=("alerting", "on-call"),
        targets=(_status("https://status.pagerduty.com"),),
    ),
)

REGISTRY_BY_SLUG: dict[str, RegistryVendor] = {v.vendor_name: v for v in REGISTRY}


def validate_registry() -> list[str]:
    """Return a list of structural problems; empty means valid.

    Pure configuration lint: it catches mistakes in this file. Runtime
    probing and the HTTP SSRF guard remain the actual network safety
    barrier; this check only rejects targets a human editor obviously
    should not have added (non-HTTPS, localhost, IP literals, duplicate
    slugs, unknown categories).
    """
    problems: list[str] = []
    names = [v.vendor_name for v in REGISTRY]
    if len(names) != len(set(names)):
        problems.append("duplicate vendor slugs")

    for vendor in REGISTRY:
        label = f"vendor {vendor.vendor_name}"
        if not vendor.vendor_name.islower() or not vendor.vendor_name.replace(
            "-", ""
        ).isalnum():
            problems.append(f"{label}: slug not url safe")
        if vendor.category not in CATEGORIES_BY_SLUG:
            problems.append(f"{label}: unknown category {vendor.category}")
        if not vendor.display_name or not vendor.description:
            problems.append(f"{label}: missing display name or description")
        if not vendor.targets:
            problems.append(f"{label}: at least one observation target required")

        seen_slugs: set[str] = set()
        seen_urls: set[str] = set()
        for target in vendor.targets:
            t_label = f"{label} target {target.slug}"
            if not target.slug.islower() or not target.slug.replace("-", "").isalnum():
                problems.append(f"{t_label}: slug not url safe")
            if target.slug in seen_slugs:
                problems.append(f"{t_label}: duplicate target slug")
            seen_slugs.add(target.slug)
            if target.url in seen_urls:
                problems.append(f"{t_label}: duplicate target url")
            seen_urls.add(target.url)
            problems.extend(_url_problems(t_label, target.url))

        for field_name, url in (
            ("website_url", vendor.website_url),
            ("documentation_url", vendor.documentation_url),
            ("status_page_url", vendor.status_page_url),
        ):
            if url is not None:
                problems.extend(_url_problems(f"{label} {field_name}", url))
    return problems


def _url_problems(label: str, url: str) -> list[str]:
    problems: list[str] = []
    parsed = urlparse(url)
    if parsed.scheme != "https":
        problems.append(f"{label}: only https urls are allowed")
    host = parsed.hostname or ""
    if not host or "." not in host:
        problems.append(f"{label}: host must be a public domain name")
    if host.lower() in ("localhost", "localhost.localdomain"):
        problems.append(f"{label}: localhost is not a valid target")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            problems.append(f"{label}: private or reserved ip target")
        else:
            problems.append(f"{label}: ip literal targets are not allowed")
    except ValueError:
        pass  # hostname, fine
    if parsed.username or parsed.password:
        problems.append(f"{label}: credentials in url are never allowed")
    return problems
