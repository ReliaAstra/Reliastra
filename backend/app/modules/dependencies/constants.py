from enum import Enum


class HttpMethod(str, Enum):
    GET = "GET"
    HEAD = "HEAD"
    POST = "POST"


#: The single region label the deployed observation point uses.
#:
#: This used to be ``["us-east", "eu-west"]``. Every check for a default
#: dependency was then dispatched once *per region* from the same worker, so one
#: machine produced two rows per interval stamped with two different region
#: values. Under ``OBSERVATION_TOPOLOGY=multi`` the quorum rule counts distinct
#: ``observation_point`` strings, so those two labels satisfied
#: ``QUORUM_MIN_REGIONS = 2`` and a single host's opinion was published as
#: independent corroboration - the precise failure
#: ``app.modules.checks.detection`` exists to prevent.
DEPLOYED_REGION: str = "us-east"
DEFAULT_REGIONS: list[str] = [DEPLOYED_REGION]
DEFAULT_EXPECTED_STATUS_CODES: list[int] = [200]
DEFAULT_TIMEOUT_SECONDS: int = 10
