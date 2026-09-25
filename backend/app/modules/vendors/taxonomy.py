"""Category taxonomy for the public intelligence catalog.

Categories are data (rows in ``vendor_categories`` seeded by the registry
sync), but the *definition* of the taxonomy lives here, version controlled
and validated by tests, so onboarding a category is a reviewed change with a
clear rollback.

A slug is the canonical public identifier: it appears in URLs and API
responses and must never be renamed once deployed (add a new slug and
migrate vendors instead; the legacy ``vendor_trackings.category`` string
carries the slug for backwards compatible API output).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CategoryDefinition:
    slug: str
    name: str
    description: str
    display_order: int


#: Ordered taxonomy. display_order controls catalog presentation.
CATEGORIES: tuple[CategoryDefinition, ...] = (
    CategoryDefinition(
        slug="ai",
        name="AI and LLM",
        description=(
            "Model providers and AI inference platforms that applications "
            "call at request time. Reliability here directly shapes the "
            "reliability of every product built on top of a foundation model."
        ),
        display_order=10,
    ),
    CategoryDefinition(
        slug="payments",
        name="Payments",
        description=(
            "Payment processors and billing platforms. A degraded payment "
            "dependency is revenue loss measured in minutes, which makes "
            "independent observation of these endpoints load bearing."
        ),
        display_order=20,
    ),
    CategoryDefinition(
        slug="identity",
        name="Identity and authentication",
        description=(
            "Authentication and identity platforms. When an identity "
            "dependency fails, users cannot sign in, which makes silent "
            "degradation of this category indistinguishable from your own "
            "outage unless it is measured independently."
        ),
        display_order=30,
    ),
    CategoryDefinition(
        slug="communications",
        name="Communications",
        description=(
            "Email, SMS and messaging delivery platforms. Delivery delays "
            "are nearly invisible to application telemetry without "
            "independent observation of the provider surface."
        ),
        display_order=40,
    ),
    CategoryDefinition(
        slug="cloud",
        name="Cloud, edge and hosting",
        description=(
            "Cloud platforms, CDNs, edge networks and deployment platforms "
            "that host or front production traffic."
        ),
        display_order=50,
    ),
    CategoryDefinition(
        slug="databases",
        name="Databases and data",
        description=(
            "Managed database and data platforms. Database degradation "
            "propagates to every application in the same dependency path."
        ),
        display_order=60,
    ),
    CategoryDefinition(
        slug="storage",
        name="Storage",
        description=(
            "Object and block storage platforms behind asset delivery, "
            "backups and data pipelines."
        ),
        display_order=70,
    ),
    CategoryDefinition(
        slug="devtools",
        name="Developer infrastructure",
        description=(
            "Version control, CI/CD, package registries and build "
            "infrastructure. Outages here stall shipping rather than "
            "serving traffic, and are chronically under measured."
        ),
        display_order=80,
    ),
    CategoryDefinition(
        slug="collaboration",
        name="Collaboration and productivity",
        description=(
            "Workplace APIs that products embed for messaging, documents "
            "and coordination."
        ),
        display_order=90,
    ),
    CategoryDefinition(
        slug="observability",
        name="Observability and telemetry",
        description=(
            "Monitoring, logging, tracing and alerting platforms. The "
            "tools engineering teams rely on to see failure, which makes "
            "their own reliability harder to notice from the inside."
        ),
        display_order=100,
    ),
)

CATEGORIES_BY_SLUG: dict[str, CategoryDefinition] = {c.slug: c for c in CATEGORIES}

#: Slugs that must be treated as categories, not vendors, when a public URL
#: segment is resolved. Derived from the taxonomy; a slug not listed here is
#: a vendor lookup.
CATEGORY_SLUGS: frozenset[str] = frozenset(CATEGORIES_BY_SLUG)


def validate_taxonomy() -> list[str]:
    """Return a list of structural problems; empty means valid."""
    problems: list[str] = []
    slugs = [c.slug for c in CATEGORIES]
    if len(slugs) != len(set(slugs)):
        problems.append("duplicate category slugs")
    for c in CATEGORIES:
        if not c.slug.islower() or not c.slug.replace("-", "").isalnum():
            problems.append(f"category slug not url safe: {c.slug}")
        if not c.name:
            problems.append(f"category without name: {c.slug}")
    return problems
