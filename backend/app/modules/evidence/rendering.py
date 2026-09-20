"""Evidence rendering: HTML templating and PDF production.

Owns the Jinja environment (strict-undefined templates, one filter per
figure), the footer Chromium prints, and both PDF paths - Chromium via
Playwright, with an xhtml2pdf fallback. Records which renderer produced
each artifact's bytes.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
from typing import Any

import jinja2

from app.modules.evidence import design
from app.modules.evidence.constants import (
    EVIDENCE_TEMPLATE_PATH,
)
from app.modules.evidence.errors import EvidenceGenerationError

logger = logging.getLogger(__name__)


_TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    EVIDENCE_TEMPLATE_PATH,
)


#: Renderer identities, recorded on the artifact and printed on it. Not
#: cosmetic: the two renderers lay this template out differently, so pagination
#: is only reproducible together with the renderer that produced the bytes whose
#: checksum is published.
RENDERER_CHROMIUM = "chromium (playwright)"
RENDERER_XHTML2PDF = "xhtml2pdf"


def _footer_template(note: str) -> str:
    """The running footer Chromium prints in the bottom margin.

    Page numbers cannot come from CSS here: Chromium implements ``@page``
    margins but not ``@page`` margin-box content, so ``counter(page)`` is a
    Firefox-only route to pagination. The renderer's own header/footer template
    is the one mechanism both this layout and a real print dialog agree on, and
    it carries the report reference so a loose page still identifies itself.

    ``xhtml2pdf`` has no equivalent, which is precisely why the artifact records
    which renderer produced it.
    """
    safe = (
        str(note)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    style = (
        "width:100%;padding:0 15mm;font-size:7pt;color:#5A6472;"
        "font-family:Inter,Helvetica,Arial,'Liberation Sans',sans-serif;"
        "display:flex;justify-content:space-between;letter-spacing:0.06em;"
    )
    return (
        f'<div style="{style}">'
        f"<div>RELIASTRA · {safe}</div>"
        '<div>Page <span class="pageNumber"></span> of '
        '<span class="totalPages"></span></div>'
        "</div>"
    )



class EvidenceRenderer:
    """Jinja environment plus HTML/PDF production."""

    def __init__(self) -> None:
        self.jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(os.path.dirname(_TEMPLATE_PATH)),
            autoescape=True,
            # A typo in a document template must fail the generation attempt, not
            # print an empty cell in a document meant to be quoted in a dispute.
            # Silence is the worst available failure mode here.
            undefined=jinja2.StrictUndefined,
        )
        # Every figure the artifact prints passes through one of these, so
        # precision, absence markers and enum wording live in one module instead
        # of being re-derived field by field in markup. That is how
        # ``0.73 * 100 -> 73.00000000000001%`` once reached a customer document.
        self.jinja_env.filters.update(
            {
                "utc": design.utc_stamp,
                "utcdate": design.utc_date,
                "int": design.int_grouped,
                "percent": design.percent,
                "ms": design.milliseconds,
                "secs": design.seconds,
                "duration": design.duration,
                "share_pct": design.share_percent,
                "severity_label": lambda value: design.label(
                    value, design.SEVERITY_LABELS
                ),
                "status_label": lambda value: design.label(value, design.STATUS_LABELS),
                "classification_label": lambda value: design.label(
                    value, design.CLASSIFICATION_LABELS
                ),
                "method_label": lambda value: design.label(
                    value, design.CORRELATION_METHOD_LABELS
                ),
            }
        )

    def _render_html(self, context: dict[str, Any]) -> str:
        template = self.jinja_env.get_template(os.path.basename(_TEMPLATE_PATH))
        return template.render(**context)

    @staticmethod
    def _pdf_via_xhtml2pdf(html_str: str) -> bytes:
        """Fallback renderer. Runs in a worker thread via ``asyncio.to_thread``."""
        from xhtml2pdf import pisa

        buffer = io.BytesIO()
        status = pisa.CreatePDF(io.StringIO(html_str), dest=buffer)
        if status.err:
            raise EvidenceGenerationError(
                "PDF generation failed via xhtml2pdf"
            )
        data = buffer.getvalue()
        if not data:
            raise EvidenceGenerationError("PDF renderer produced an empty document")
        return data

    async def _html_to_pdf(
        self, html_str: str, *, footer_note: str = ""
    ) -> tuple[bytes, dict[str, Any]]:
        """Render HTML to PDF and report which renderer produced the bytes.

        Returns ``(pdf_bytes, provenance)``. Provenance belongs to the record,
        not to a log line: the artifact prints its renderer and the row stores
        it, because a PDF's pagination is a property of the renderer as much as
        of the markup. A silent fallback used to be possible here; now a
        fallback is possible but legible, and the image build refuses to ship an
        artifact renderer that cannot launch (see ``Dockerfile``).

        Both paths raise on failure: an artifact that cannot be rendered must
        fail the generation attempt rather than produce an empty or partial
        document that still gets a checksum.
        """
        try:
            from playwright.async_api import async_playwright
        except Exception as exc:  # pragma: no cover - optional dependency
            logger.warning(
                "evidence: playwright is not importable (%s); rendering with "
                "xhtml2pdf and recording it on the artifact",
                exc,
            )
        else:
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(headless=True)
                    try:
                        version = browser.version
                        page = await browser.new_page()
                        await page.set_content(html_str)
                        data = await page.pdf(
                            format="A4",
                            print_background=True,
                            # The stylesheet carries @page margins that
                            # xhtml2pdf honours too; Chromium needs the same
                            # frame passed here because the running footer is
                            # drawn inside the bottom margin.
                            margin={
                                "top": "17mm",
                                "bottom": "18mm",
                                "left": "15mm",
                                "right": "15mm",
                            },
                            display_header_footer=True,
                            header_template="<div></div>",
                            footer_template=_footer_template(footer_note),
                        )
                    finally:
                        await browser.close()
                if not data:
                    raise EvidenceGenerationError(
                        "Playwright produced an empty document"
                    )
                return data, {
                    "renderer": RENDERER_CHROMIUM,
                    "renderer_version": version,
                    "pagination": "running footer with page numbers",
                }
            except Exception as exc:
                logger.warning(
                    "evidence: chromium rendering failed (%s); falling back to "
                    "xhtml2pdf and recording it on the artifact",
                    exc,
                )

        data = await asyncio.to_thread(self._pdf_via_xhtml2pdf, html_str)
        try:
            import xhtml2pdf as xhtml2pdf_module

            fallback_version = str(getattr(xhtml2pdf_module, "__version__", "unknown"))
        except Exception:  # pragma: no cover - the import already succeeded
            fallback_version = "unknown"
        return data, {
            "renderer": RENDERER_XHTML2PDF,
            "renderer_version": fallback_version,
            "pagination": "no running footer (page numbers unavailable)",
        }
