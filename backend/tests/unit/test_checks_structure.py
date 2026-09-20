"""Structural contract of the checks decomposition.

``service.py`` is the module's front door: router, Celery tasks and
neighboring modules use ``CheckService`` and its signatures are the
contract. The pipeline logic lives in the focused collaborators behind it
(``dispatch`` / ``probe`` / ``results`` / ``diagnostics``), so this file
pins the wiring — not the behavior, which the pipeline tests own.
"""

import inspect

from app.modules.checks.service import CheckService, check_service


def test_facade_exposes_the_stable_public_api():
    service = CheckService(repository=object(), dep_repository=object())
    assert service.dispatcher.dep_repository is service.dep_repository
    assert service.runner.repository is service.repository
    assert service.runner.dep_repository is service.dep_repository
    assert service.diagnostics.repository is service.repository
    assert service.diagnostics.dep_repository is service.dep_repository


def test_facade_signatures_are_the_unchanged_contract():
    # (method, positional params in order, defaulted params)
    expected = {
        "schedule_due_checks": (["session"], {}),
        "trigger_manual_check": (
            ["session", "dependency_id", "org_id"],
            {"region": None},
        ),
        "execute_check": (
            ["session", "dependency_id", "region"],
            {"result_id": None},
        ),
        "get_check_state": (["session", "dependency_id", "org_id"], {}),
        "list_results_for_dependency": (
            ["session", "dependency_id"],
            {"limit": 50},
        ),
        "list_results_for_org": (["session", "org_id"], {"limit": 50}),
    }
    for name, (params, defaults) in expected.items():
        sig = inspect.signature(getattr(CheckService, name))
        positional = [
            p.name
            for p in sig.parameters.values()
            if p.name != "self" and p.default is inspect.Parameter.empty
        ]
        defaulted = {
            p.name: p.default
            for p in sig.parameters.values()
            if p.default is not inspect.Parameter.empty
        }
        assert positional == params, name
        assert defaulted == defaults, name
        assert sig.return_annotation is not inspect.Signature.empty, name
    # Pure classifier stays callable on the class, without a database.
    assert isinstance(
        inspect.getattr_static(CheckService, "classify_check_state"), staticmethod
    )


def test_singleton_is_wired_and_probes_stay_pinned():
    from app.modules.checks import http_probe

    assert isinstance(check_service, CheckService)
    # Every probe hop runs on its own SSRF-pinned transport: no shared pool
    # can exist here, so the façade must not grow one back.
    assert not hasattr(check_service, "get_http_client")
    import app.modules.checks.service as service_module

    assert not hasattr(service_module, "get_http_client")
    # The pinned-transport hooks stay module attributes: tests and future
    # probes patch them where they are used.
    assert callable(http_probe.resolve_pinned_target_async)
    assert callable(http_probe.pinned_transport_for)
