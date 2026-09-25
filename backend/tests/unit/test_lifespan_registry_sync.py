"""Startup registry sync is a boot assist, never a boot blocker.

If the registry sync at startup throws (DB down, registry bug), the API
must still boot and serve the last synced catalog; the daily beat sync is
the recovery path. These invariants are the whole reason the hook exists.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.bootstrap import lifespan as lifespan_module


@pytest.mark.asyncio
async def test_registry_sync_runs_and_commits(monkeypatch):
    session = AsyncMock()
    session_maker = MagicMock()
    session_maker.return_value.__aenter__ = AsyncMock(return_value=session)
    session_maker.return_value.__aexit__ = AsyncMock(return_value=False)

    service = MagicMock()
    service.seed_vendors = AsyncMock(return_value=7)

    monkeypatch.setattr(
        "app.db.session.get_session_maker", lambda: session_maker, raising=True
    )
    monkeypatch.setattr(
        "app.modules.vendors.service.vendor_service", service, raising=True
    )

    await lifespan_module._sync_vendor_registry()

    service.seed_vendors.assert_awaited_once_with(session)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_registry_sync_failure_never_blocks_boot(monkeypatch):
    def _boom():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(
        "app.db.session.get_session_maker", _boom, raising=True
    )
    error = MagicMock()
    monkeypatch.setattr(lifespan_module.logger, "error", error)

    # Must not raise: startup continues and the API serves the catalog it
    # already has. The failure is logged loudly, exactly once.
    await lifespan_module._sync_vendor_registry()

    assert error.call_count == 1
    assert "registry sync" in str(error.call_args).lower()
