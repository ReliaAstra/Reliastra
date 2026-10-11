"""Reliastra MCP server — agent-native access to external-dependency intelligence.

Exposes Reliastra's *verified* capabilities (public observatory, evidence
verification, workspace reads, two safe writes, dependency analysis and
integration planning) over the Model Context Protocol via stdio (local) and
Streamable HTTP (remote).

The server never reimplements Reliastra business logic and never touches the
database: every operational tool is an HTTP client of the canonical Reliastra
API. Capabilities advertised here are transcribed from the deployed product
contract — see ``capabilities.py``.
"""

__version__ = "0.1.0"

__all__ = ["__version__"]
