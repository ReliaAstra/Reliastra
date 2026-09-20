"""Cross-cutting platform code: no business logic.

Subpackages: observability, security, web, tenancy, persistence, messaging,
integrations, resilience, config. Domain code in app.modules/* may import
from here; this package must never import from app.modules/*."""
