"""Observation facts are independent of the endpoint's health contract.

Legacy rows retain their recorded evaluation; a raw status is sufficient to
recover response receipt, never sufficient to rewrite historical health.
"""
from pydantic import BaseModel


def normalize(status_code, error_type=None, error_message=None, metadata=None):
    stored = (metadata or {}).get('observation', {})
    received = status_code is not None
    transport = stored.get('transport_status')
    if received:
        transport = 'http_response'
    elif not transport:
        text = f'{error_type or ""} {error_message or ""}'.lower()
        transport = next((kind for token, kind in (
            ('timeout', 'timeout'), ('cannot resolve', 'dns_error'), ('dns', 'dns_error'), ('gaierror', 'dns_error'),
            ('ssl', 'tls_error'), ('tls', 'tls_error'), ('certificate', 'tls_error'),
            ('connect', 'connection_error'),
        ) if token in text), 'unknown')
    return dict(reachable=received, response_received=received,
                transport_status=transport, http_status=status_code,
                response_class=f'{status_code // 100}xx' if received else 'no_http_response',
                evaluation=stored.get('evaluation', 'expected' if received and not error_type else 'unexpected' if error_type else 'unknown'))


def observation_semantics(row):
    metadata = getattr(row, 'observation_metadata', None)
    if metadata is None:
        metadata = getattr(row, 'metadata', None)
    return normalize(row.status_code, row.error_type, row.error_message, metadata if isinstance(metadata, dict) else None)


class ObservationFacts(BaseModel):
    """Additive API facts; status_code and is_up remain compatibility fields."""
    reachable: bool = False
    response_received: bool = False
    transport_status: str = 'unknown'
    http_status: int | None = None
    response_class: str = 'no_http_response'
    evaluation: str = 'unknown'


def expected_sql(model):
    """Legacy-compatible evaluation projection, not a reachability predicate.

    error_type also includes contract failures. Availability measures expectation
    compliance. Never reevaluate historical rows using today's endpoint policy.
    """
    return model.status_code.is_not(None) & model.error_type.is_(None)
