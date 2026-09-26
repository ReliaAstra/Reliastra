"""Structural guarantees for the vendor registry and taxonomy.

These invariants are what make the registry a trustworthy onboarding
surface: unique slugs (canonical URLs depend on it), honest categories,
safe deterministic targets, and the exact preservation of the five vendor
identities that are already deployed in production URLs.
"""
from urllib.parse import urlparse

from app.modules.vendors.registry import REGISTRY, REGISTRY_BY_SLUG, validate_registry
from app.modules.vendors.taxonomy import (
    CATEGORIES,
    CATEGORY_SLUGS,
    validate_taxonomy,
)


def test_registry_is_valid():
    assert validate_registry() == []


def test_taxonomy_is_valid():
    assert validate_taxonomy() == []


def test_registry_size_is_the_fifty_vendor_target():
    """The initial public catalog is exactly 50 vendors."""
    assert len(REGISTRY) == 50
    assert len(REGISTRY_BY_SLUG) == 50


def test_every_category_contains_vendors():
    """No empty taxonomy entries: a category with zero vendors cannot page."""
    by_category = {}
    for vendor in REGISTRY:
        by_category.setdefault(vendor.category, 0)
        by_category[vendor.category] += 1
    assert set(by_category) == CATEGORY_SLUGS
    for slug, count in by_category.items():
        assert count >= 1, f"category {slug} has no vendors"


def test_category_slugs_and_vendor_slugs_never_collide():
    """A URL segment must resolve to exactly one entity type."""
    vendor_slugs = set(REGISTRY_BY_SLUG)
    assert vendor_slugs.isdisjoint(CATEGORY_SLUGS)


def test_every_target_is_https_with_known_methodology():
    for vendor in REGISTRY:
        assert vendor.targets, vendor.vendor_name
        for target in vendor.targets:
            assert urlparse(target.url).scheme == "https"
            assert target.kind == "status_page"


def test_preeexisting_vendor_identities_are_preserved():
    """The five deployed vendors keep slug and primary target URL exactly.

    Public URLs already exist for these slugs and the catalog derives
    recent status from the primary target URL; changing either would orphan
    deployed links or silently redefine an existing measurement.
    """
    expected_primary = {
        "stripe": "https://status.stripe.com",
        "auth0": "https://status.auth0.com",
        "cloudflare": "https://www.cloudflarestatus.com",
        "openai": "https://status.openai.com",
        "twilio": "https://status.twilio.com",
    }
    for slug, primary_url in expected_primary.items():
        vendor = REGISTRY_BY_SLUG[slug]
        assert vendor.targets[0].url == primary_url, slug


def test_taxonomy_display_order_is_unique_and_stable():
    orders = [c.display_order for c in CATEGORIES]
    assert len(orders) == len(set(orders))
    slugs = [c.slug for c in CATEGORIES]
    assert slugs == sorted(slugs, key=lambda s: next(
        c.display_order for c in CATEGORIES if c.slug == s
    ))
