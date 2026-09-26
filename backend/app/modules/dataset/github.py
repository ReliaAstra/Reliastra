"""Minimal GitHub Git Data API client for the dataset publisher.

House rules for outbound integrations apply: pooled client from the shared
HTTP infrastructure, explicit timeout, secret never logged, and **optional
and disclosed** configuration - an unset token/repo is a legitimate
deployment state the service reports as disabled, never an error buried in
logs and never a fabricated "published".

Only what publishing needs, via the Git Data API (one atomic commit for the
whole tree, unlike per-file Contents calls):

    GET  /repos/{owner}/{repo}/git/ref/heads/{branch}   -> base commit
    GET  /repos/{owner}/{repo}/git/commits/{sha}        -> base tree
    POST /repos/{owner}/{repo}/git/trees                -> new tree
    POST /repos/{owner}/{repo}/git/commits              -> new commit
    PATCH /repos/{owner}/{repo}/git/refs/heads/{branch} -> fast-forward ref

A ref update rejected because the branch moved is a retryable race: the
caller's next attempt re-reads the ref and re-applies its (deterministic)
tree on top. Nothing here mutates or force-pushes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(15.0)
LIMITS = httpx.Limits(max_connections=10, max_keepalive_connections=5)


class GitHubError(Exception):
    """A GitHub API failure that the retrying task may re-attempt."""


@dataclass(frozen=True)
class DatasetGitHubConfig:
    owner: str
    repo: str
    branch: str
    token: str
    api_url: str

    @property
    def target(self) -> str:
        return f"{self.owner}/{self.repo}"


def dataset_github_config() -> DatasetGitHubConfig | None:
    """The publisher's configuration, or None when not configured.

    Both a token and a repo are required; a branch always has a default.
    Partial configuration is treated as unconfigured and logged once per
    attempt: silence about a misconfigured publisher would look identical
    to a deliberately disabled one.
    """
    token = settings.DATASET_GITHUB_TOKEN
    repo = settings.DATASET_GITHUB_REPO
    token_value: str | None = None
    if token is not None:
        try:
            token_value = token.get_secret_value()  # type: ignore[union-attr]
        except AttributeError:
            token_value = str(token)
    if not token_value or not repo:
        if token_value or repo:
            logger.warning(
                "Dataset publisher partially configured: DATASET_GITHUB_TOKEN and "
                "DATASET_GITHUB_REPO must both be set; publishing disabled"
            )
        return None
    owner, _, name = repo.partition("/")
    if not owner or not name:
        logger.warning(
            "DATASET_GITHUB_REPO must be owner/name; got %r; publishing disabled",
            repo,
        )
        return None
    return DatasetGitHubConfig(
        owner=owner,
        repo=name,
        branch=settings.DATASET_GITHUB_BRANCH,
        token=token_value,
        api_url=settings.DATASET_GITHUB_API_URL.rstrip("/"),
    )


def _headers(config: DatasetGitHubConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _repo_url(config: DatasetGitHubConfig, *parts: str) -> str:
    return "/".join(
        [config.api_url, "repos", config.owner, config.repo, *parts]
    )


async def _github_request(
    client: httpx.AsyncClient,
    config: DatasetGitHubConfig,
    method: str,
    url: str,
    payload: dict | None = None,
) -> dict:
    response = await client.request(
        method, url, json=payload, headers=_headers(config)
    )
    if response.status_code >= 400:
        # The token is never in the body; log status + endpoint only.
        logger.error(
            "GitHub API %s %s failed: %s %s",
            method,
            url,
            response.status_code,
            response.text[:300],
        )
        raise GitHubError(
            f"GitHub {method} {url.split('/repos/')[-1]} -> {response.status_code}"
        )
    if response.status_code == 204:
        return {}
    return response.json()  # type: ignore[no-any-return]


async def commit_tree(
    files: dict[str, bytes],
    message: str,
    *,
    config: DatasetGitHubConfig,
    client: httpx.AsyncClient | None = None,
) -> tuple[str, str]:
    """Commit the tree to the configured branch atomically.

    Returns ``(commit_sha, tree_sha)``. Raises :class:`GitHubError` on any
    API failure; the branch race (ref moved since the base was read) raises
    too, and the caller's retry re-reads the ref.
    """
    if not files:
        raise ValueError("refusing to commit an empty dataset tree")

    owns_client = client is None
    if owns_client:
        from app.platform.integrations.http import get_shared_client

        client = get_shared_client("github", timeout=TIMEOUT, limits=LIMITS)

    try:
        ref = await _github_request(
            client, config, "GET", _repo_url(config, "git", "ref", "heads", config.branch)
        )
        base_commit = ref["object"]["sha"]

        base = await _github_request(
            client, config, "GET", _repo_url(config, "git", "commits", base_commit)
        )
        base_tree = base["tree"]["sha"]

        tree_payload = [
            {
                "path": path,
                "mode": "100644",
                "type": "blob",
                "content": content.decode("utf-8"),
            }
            for path, content in sorted(files.items())
        ]
        tree = await _github_request(
            client,
            config,
            "POST",
            _repo_url(config, "git", "trees"),
            {"base_tree": base_tree, "tree": tree_payload},
        )

        commit = await _github_request(
            client,
            config,
            "POST",
            _repo_url(config, "git", "commits"),
            {"message": message, "tree": tree["sha"], "parents": [base_commit]},
        )

        await _github_request(
            client,
            config,
            "PATCH",
            _repo_url(config, "git", "refs", "heads", config.branch),
            {"sha": commit["sha"], "force": False},
        )
        return str(commit["sha"]), str(tree["sha"])
    finally:
        if owns_client:
            from app.platform.integrations.http import aclose_shared_client

            await aclose_shared_client("github")
