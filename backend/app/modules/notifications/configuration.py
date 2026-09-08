"""Channel validation, encrypted storage, and deliberately secret-free read models."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit
from pydantic import EmailStr, TypeAdapter
from app.core.security import decrypt_jsonb, encrypt_jsonb
from app.core.exceptions import ValidationException

EVENTS = ('incident.detected', 'incident.resolved')


def unpack(config: dict) -> dict:
    # Read legacy rows during rolling deployment; all writes use the encrypted envelope.
    if '_encrypted_data' in config:
        value = decrypt_jsonb(config['_encrypted_data'])
        if not value:
            raise ValidationException('Unable to read channel configuration')
        return value
    return dict(config)


def pack(config: dict) -> dict:
    return {'_encrypted_data': encrypt_jsonb(config)}


def validate_config(channel: str, config: dict[str, Any]) -> dict:
    allowed = {'email', 'recipient', 'webhook_url', 'routing_key', 'url', 'label', 'events'}
    if set(config) - allowed:
        raise ValidationException('Unsupported channel configuration field')
    result = dict(config)
    if channel == 'email':
        try:
            result['email'] = str(TypeAdapter(EmailStr).validate_python(config.get('email') or config.get('recipient')))
        except ValueError:
            raise ValidationException('Enter a valid email address') from None
        result.pop('recipient', None)
    elif channel == 'slack':
        try:
            url = urlsplit(str(config.get('webhook_url', '')))
            valid = url.scheme == 'https' and url.hostname in {'hooks.slack.com', 'hooks.slack-gov.com'} and url.path.startswith('/services/') and not (url.username or url.password or url.query or url.fragment or url.port)
        except ValueError:
            valid = False
        if not valid:
            raise ValidationException('Enter a Slack incoming webhook URL')
    elif channel == 'pagerduty' and not config.get('routing_key'):
        raise ValidationException('PagerDuty routing key required')
    elif channel == 'webhook':
        from app.core.ssrf_protection import validate_outbound_url
        try:
            validate_outbound_url(str(config.get('url', '')))
        except ValueError:
            raise ValidationException('Enter an allowed public webhook URL') from None
    label = str(config.get('label', '')).strip()
    if len(label) > 100:
        raise ValidationException('Channel label must be 100 characters or fewer')
    result['label'] = label
    events = config.get('events', {event: True for event in EVENTS})
    if not isinstance(events, dict) or set(events) - set(EVENTS) or any(type(v) is not bool for v in events.values()):
        raise ValidationException('Unsupported notification event preference')
    result['events'] = {event: events.get(event, True) for event in EVENTS}
    return result


def public_fields(channel: str, config: dict) -> dict:
    value = unpack(config)
    verified = channel != 'email' or bool(value.get('verified_at'))
    return {
        'destination': value.get('email') or value.get('recipient') if channel == 'email' else value.get('label') or None,
        'connection_status': ('verified' if verified else 'verification_required') if channel == 'email' else ('connected' if value.get('last_test_success') else 'configured'),
        'verification_required': not verified,
        'events': value.get('events', {event: True for event in EVENTS}),
        'last_test_at': value.get('last_test_at'),
        'last_test_success': value.get('last_test_success'),
    }
