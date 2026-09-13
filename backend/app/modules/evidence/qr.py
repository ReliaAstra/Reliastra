"""QR code for the verification URL, inline as SVG.

A recipient of an evidence PDF is usually in a dispute, on a call, and holding
a printed page. The distance between "verified by RELIASTRA" printed on paper
and the verification page being open should be zero, which is what a QR is for.

Rendering is done by hand from the module matrix rather than through an image
factory for three reasons: the output is a single ``<path>`` (one draw call in
the PDF instead of ~600 rects, which matters because these documents get
emailed and archived), no raster/PIL dependency enters a worker image that
otherwise needs none, and the colours are ours.

``qrcode`` is imported lazily and every failure degrades to an empty string: a
missing optional dependency must never stop an evidence report being produced.
The URL is always printed as text beside the code, so the QR is a convenience,
never the only route to verification.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def render_qr_svg(
    data: str,
    *,
    module_px: int = 3,
    quiet_modules: int = 3,
    colour: str = "#0B1220",
) -> str:
    """Inline SVG for ``data``, or ``""`` when QR generation is unavailable."""
    if not data:
        return ""
    try:
        import qrcode
        from qrcode.constants import ERROR_CORRECT_M
    except Exception:  # pragma: no cover - optional dependency
        logger.info("evidence: qrcode not installed; omitting the QR mark")
        return ""

    try:
        code = qrcode.QRCode(
            version=None,
            # Medium: survives a photocopy and a coffee ring, and costs fewer
            # modules than Q/H, which are for hostile environments rather than
            # office printers.
            error_correction=ERROR_CORRECT_M,
            box_size=module_px,
            border=quiet_modules,
        )
        code.add_data(data)
        code.make(fit=True)
        matrix = code.get_matrix()
    except Exception:  # pragma: no cover - defensive against a bad payload
        logger.warning("evidence: QR generation failed", exc_info=True)
        return ""

    size = len(matrix)
    span = size * module_px
    units = module_px
    parts: list[str] = []
    for y, row in enumerate(matrix):
        for x, dark in enumerate(row):
            if dark:
                parts.append(
                    f"M{x * units} {y * units}h{units}v{units}h-{units}z"
                )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{span}" height="{span}" '
        f'viewBox="0 0 {span} {span}" role="img" '
        f'aria-label="Scan to verify this report" shape-rendering="crispEdges">'
        f'<path d="{"".join(parts)}" fill="{colour}"/></svg>'
    )
