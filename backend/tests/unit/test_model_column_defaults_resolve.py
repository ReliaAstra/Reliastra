"""Every mapped column default must actually resolve.

A column default is a lambda the SQLAlchemy ORM calls at flush time, not at
import time. A typo or missing import inside one therefore imports cleanly,
passes every unit test that mocks the repository, and then raises `NameError`
the first time a real row is inserted - which in this repo meant six
integration tests failing with:

    sqlalchemy.exc.StatementError: (builtins.NameError)
        name 'DEFAULT_REGIONS' is not defined

after the `dependencies.regions` default was changed to a named constant.
Mocked unit tests cannot see this class of bug; evaluating the defaults can.
"""

import pytest

# Importing the app factory registers every mapper on Base.metadata, which is
# the reliable way to reach them: walking the module tree and importing by hand
# silently skips anything that raises, and a test that quietly inspects nothing
# passes for the right-looking wrong reason.
import app.main  # noqa: F401
from app.db.base import Base

TABLES = sorted(Base.metadata.tables.values(), key=lambda t: t.name)


def test_metadata_is_populated():
    """Guard against the traversal silently inspecting nothing."""
    assert len(TABLES) > 40, f"expected the full schema, found {len(TABLES)} tables"


@pytest.mark.parametrize("table", TABLES, ids=[t.name for t in TABLES])
def test_column_defaults_resolve(table):
    """Evaluating a default must not raise - that is where NameError lives."""
    broken = []
    for column in table.columns:
        arg = column.default.arg if column.default is not None else None
        if arg is None or not callable(arg):
            continue
        try:
            try:
                arg(None)  # SQLAlchemy hands callables an execution context
            except TypeError:
                arg()  # zero-argument callable
        except Exception as exc:
            broken.append(f"{table.name}.{column.name}: {type(exc).__name__}: {exc}")
    assert not broken, "unresolvable column defaults:\n  " + "\n  ".join(broken)


def test_dependency_regions_default_is_the_deployed_region():
    """The specific regression, pinned with its reason.

    One observation point exists. A default of two labels dispatched two probes
    per interval from a single worker, and under a multi-point topology the
    quorum rule counts distinct labels - so one machine could have satisfied a
    two-point quorum on its own.
    """
    from app.modules.dependencies.constants import DEPLOYED_REGION

    arg = Base.metadata.tables["dependencies"].c.regions.default.arg
    value = arg(None)
    assert value == [DEPLOYED_REGION]
    # A shared mutable default would alias every row to one list.
    assert arg(None) is not value
