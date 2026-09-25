"""Intelligence taxonomy: categories + canonical vendor/target identity.

Additive only. Nothing here renames, drops, or reinterprets existing data.

Rationale:

* ``vendor_trackings.category`` was a free string and the only organisation
  the public catalog had. Categories are now first class rows
  (``vendor_categories``) with a stable slug, a name, a description and an
  order, referenced by a nullable foreign key. The legacy string column is
  kept in place and continues to carry the category slug, so every existing
  API consumer sees identical payloads while the relational model underneath
  gains integrity.

* A vendor is a canonical infrastructure entity, not merely a probed URL.
  Identity links (website, documentation, official status page, logo),
  the legal/official name, a description, a country and tags are stored on
  the vendor row.

* An observation target is more than a URL: it gets a per-vendor stable
  ``slug`` and ``name`` (the future address of its dependency record),
  a ``kind`` (status_page today; api_surface/docs/http later), a
  ``product_name``, an ordering, and a ``methodology_version`` so a target
  always knows which observation semantics produced its measurements.

Data written by this migration: none. Category rows and the vendor registry
sync are data-plane concerns handled by ``vendor_service.seed_vendors``;
a migration must stay schema-only so it remains reversible and replay safe.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0039_intelligence_taxonomy"
down_revision: str | None = "0038_public_endpoint_regions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vendor_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendor_categories_slug", "vendor_categories", ["slug"], unique=True)

    op.add_column(
        "vendor_trackings",
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("vendor_trackings", sa.Column("official_name", sa.String(length=150), nullable=True))
    op.add_column("vendor_trackings", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("vendor_trackings", sa.Column("website_url", sa.String(length=500), nullable=True))
    op.add_column("vendor_trackings", sa.Column("documentation_url", sa.String(length=500), nullable=True))
    op.add_column("vendor_trackings", sa.Column("status_page_url", sa.String(length=500), nullable=True))
    op.add_column("vendor_trackings", sa.Column("logo_url", sa.String(length=500), nullable=True))
    op.add_column("vendor_trackings", sa.Column("country", sa.String(length=100), nullable=True))
    op.add_column("vendor_trackings", sa.Column("tags", sa.JSON(), nullable=True))
    op.create_index("ix_vendor_trackings_category_id", "vendor_trackings", ["category_id"])
    op.create_foreign_key(
        "fk_vendor_trackings_category_id",
        "vendor_trackings",
        "vendor_categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("vendor_endpoints", sa.Column("slug", sa.String(length=100), nullable=True))
    op.add_column("vendor_endpoints", sa.Column("name", sa.String(length=200), nullable=True))
    op.add_column(
        "vendor_endpoints",
        sa.Column("kind", sa.String(length=50), nullable=False, server_default="status_page"),
    )
    op.add_column("vendor_endpoints", sa.Column("product_name", sa.String(length=200), nullable=True))
    op.add_column(
        "vendor_endpoints",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="100"),
    )
    op.add_column(
        "vendor_endpoints",
        sa.Column("methodology_version", sa.String(length=20), nullable=False, server_default="v1.0"),
    )
    op.create_unique_constraint(
        "uq_vendor_endpoints_vendor_slug",
        "vendor_endpoints",
        ["vendor_id", "slug"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_vendor_endpoints_vendor_slug", "vendor_endpoints", type_="unique")
    op.drop_column("vendor_endpoints", "methodology_version")
    op.drop_column("vendor_endpoints", "display_order")
    op.drop_column("vendor_endpoints", "product_name")
    op.drop_column("vendor_endpoints", "kind")
    op.drop_column("vendor_endpoints", "name")
    op.drop_column("vendor_endpoints", "slug")

    op.drop_constraint("fk_vendor_trackings_category_id", "vendor_trackings", type_="foreignkey")
    op.drop_index("ix_vendor_trackings_category_id", table_name="vendor_trackings")
    op.drop_column("vendor_trackings", "tags")
    op.drop_column("vendor_trackings", "country")
    op.drop_column("vendor_trackings", "logo_url")
    op.drop_column("vendor_trackings", "status_page_url")
    op.drop_column("vendor_trackings", "documentation_url")
    op.drop_column("vendor_trackings", "website_url")
    op.drop_column("vendor_trackings", "description")
    op.drop_column("vendor_trackings", "official_name")
    op.drop_column("vendor_trackings", "category_id")

    op.drop_index("ix_vendor_categories_slug", table_name="vendor_categories")
    op.drop_table("vendor_categories")
