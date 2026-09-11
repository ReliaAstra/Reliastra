"""Outreach hunter tasks. Fetch -> kill-first -> upsert. Never sends."""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings
from app.db.session import get_session_maker
from app.infrastructure.celery_app import celery_app
from app.modules.outreach import hunter
from app.modules.outreach.service import upsert_hunter_lead

logger = logging.getLogger(__name__)

FETCH_TIMEOUT_SECONDS = 20.0
MAX_HTML_BYTES = 1_500_000
HUNTER_UA = "ReliastraHunter/1.0 (+https://reliastra.com; lead-research bot)"
DDG_DELAY_SECONDS = 4.0
MAX_DISCOVERY_CANDIDATES = 300


def _fetch(url: str) -> str | None:
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": HUNTER_UA})
        if resp.status_code >= 400:
            return None
        content = resp.content[:MAX_HTML_BYTES]
        return content.decode(resp.encoding or "utf-8", errors="replace")
    except Exception as exc:
        logger.info("Outreach fetch failed url=%s err=%s", url[:120], type(exc).__name__)
        return None


async def _process_urls(urls: list[str], seed_source: str | None) -> dict:
    seen = 0
    kept = 0
    killed = 0
    errors = 0
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            for url in urls[:300]:  # hard per-run bound
                html = await asyncio.to_thread(_fetch, url)
                if html is None:
                    errors += 1
                    continue
                try:
                    lead = await upsert_hunter_lead(
                        session, url=url, html=html, seed_source=seed_source
                    )
                    seen += 1
                    if lead.status == "killed":
                        killed += 1
                    else:
                        kept += 1
                except ValueError:
                    errors += 1
                    continue
            await session.commit()
        except Exception:
            await session.rollback()
            raise
    return {"seen": seen, "kept": kept, "killed": killed, "errors": errors}


@celery_app.task(name="app.modules.outreach.tasks.process_seed_urls")
def process_seed_urls(urls: list[str], seed_source: str | None = None) -> dict:
    """Process an explicit URL batch. Manual trigger from the admin review queue."""
    return asyncio.run(_process_urls(list(urls or []), seed_source or "manual"))


@celery_app.task(name="app.modules.outreach.tasks.hunt_daily")
def hunt_daily() -> dict:
    """Beat-driven daily hunt over configured seeds. No-op when unconfigured."""
    raw = (settings.OUTREACH_SEEDS or "").strip()
    if not raw:
        return {"seen": 0, "kept": 0, "killed": 0, "errors": 0, "skipped": "no-seeds"}
    urls = [u.strip() for u in raw.split(",") if u.strip()]
    return asyncio.run(_process_urls(urls, "beat-seeds"))


def _ddg_search(query: str) -> list[str]:
    """One free-ground search page -> candidate agency URLs (first page only)."""
    import time

    try:
        with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.get(
                hunter.DDG_HTML_URL,
                params={"q": query},
                headers={
                    "User-Agent": HUNTER_UA,
                    "Accept": "text/html",
                    "Accept-Language": "en-GB,en;q=0.8",
                },
            )
        time.sleep(DDG_DELAY_SECONDS)  # stay polite on the free ground
        if resp.status_code >= 400:
            logger.warning("Outreach DDG search rejected status=%s", resp.status_code)
            return []
        return hunter.extract_ddg_results(resp.text[:MAX_HTML_BYTES])
    except Exception as exc:
        logger.info("Outreach DDG search failed err=%s", type(exc).__name__)
        return []


@celery_app.task(name="app.modules.outreach.tasks.discover_daily")
def discover_daily() -> dict:
    """Beat-driven discovery: free grounds -> candidates -> hunt pipeline.

    Runs BEFORE the seed hunt. One DDG killer query per day (rotation) plus
    any configured directory listing pages. Everything flows through the same
    kill-first + dedup pipeline, so discovery can never create duplicates or
    send anything.
    """
    candidates: list[str] = []
    grounds: list[str] = []

    query = hunter.discovery_query_for_today(settings.OUTREACH_DISCOVERY_QUERIES or None)
    for url in _ddg_search(query):
        if len(candidates) >= MAX_DISCOVERY_CANDIDATES:
            break
        candidates.append(url)
    grounds.append(f"ddg:{query[:60]}")

    sources = [s.strip() for s in (settings.OUTREACH_DISCOVERY_SOURCES or "").split(",") if s.strip()]
    for source in sources[:10]:  # hard bound on listing pages per day
        html = _fetch(source)
        if html is None:
            continue
        own = hunter.normalize_domain(source)
        for url in hunter.extract_outbound_candidates(html, own):
            if len(candidates) >= MAX_DISCOVERY_CANDIDATES:
                break
            candidates.append(url)
        grounds.append(f"dir:{own}")

    if not candidates:
        return {"seen": 0, "kept": 0, "killed": 0, "errors": 0, "skipped": "no-candidates"}
    result = asyncio.run(_process_urls(candidates, "discovery"))
    result["grounds"] = grounds
    result["query"] = query
    return result
