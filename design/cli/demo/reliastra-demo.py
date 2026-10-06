#!/usr/bin/env python3
"""reliastra CLI — terminal design demo (design spike, not the shipped CLI).

Replays the screens in demo/screens/*.json into YOUR terminal with real ANSI
escapes, so the design can be judged where it will live. The run lists are the
same ones the PNG mockups are drawn from, so the picture and the bytes cannot
disagree.

    python3 design/cli/demo/reliastra-demo.py --list
    python3 design/cli/demo/reliastra-demo.py 06
    python3 design/cli/demo/reliastra-demo.py 06 --play          # line-by-line reveal
    python3 design/cli/demo/reliastra-demo.py 04 --color never   # the plain fidelity level
    python3 design/cli/demo/reliastra-demo.py 12 --theme light
    python3 design/cli/demo/reliastra-demo.py all --play

Fidelity is negotiated like the real CLI will:
    NO_COLOR set, --color never, or not a TTY  -> plain (no escapes at all)
    COLORTERM=truecolor|24bit                  -> 24-bit
    TERM=*256*                                 -> 256 colours
    otherwise                                  -> 16 colours, chips as reverse video
"""

import argparse
import json
import os
import signal
import sys
import time
from pathlib import Path

if hasattr(signal, "SIGPIPE"):
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # piping into head is a feature, not a crash

ROOT = Path(__file__).resolve().parents[1]          # design/cli/
SCREENS_DIR = ROOT / "demo" / "screens"
TOKENS = json.loads((ROOT / "tokens.json").read_text(encoding="utf-8"))
ROLES = TOKENS["roles"]
STYLES = {
    " ": {"fg": "text.primary"},
    "d": {"fg": "text.secondary"},
    "t": {"fg": "text.tertiary"},
    "f": {"fg": "text.faint"},
    "b": {"fg": "brand"},
    "B": {"fg": "brand.bright"},
    "u": {"fg": "verdict.up"},
    "x": {"fg": "verdict.down"},
    "w": {"fg": "verdict.degraded"},
    "q": {"fg": "verdict.unknown"},
    "p": {"fg": "provenance"},
    "i": {"fg": "text.inverse"},
    "m": {"fg": "text.secondary"},
    "h": {"fg": "text.tertiary", "w": 600},
    "H": {"fg": "text.primary", "w": 600},
    "k": {"fg": "text.tertiary"},
    "v": {"fg": "text.primary", "w": 500},
    "n": {"fg": "text.primary", "w": 500},
    "V": {"fg": "text.primary", "w": 600},
    "1": {"fg": "chart.1"},
    "2": {"fg": "chart.2"},
    "3": {"fg": "chart.3"},
    "4": {"fg": "chart.4"},
    "5": {"fg": "chart.5"},
    "U": {"fg": "verdict.up", "bg": "verdict.up", "tint": True, "w": 600},
    "X": {"fg": "verdict.down", "bg": "verdict.down", "tint": True, "w": 600},
    "W": {"fg": "verdict.degraded", "bg": "verdict.degraded", "tint": True, "w": 600},
    "Q": {"fg": "verdict.unknown", "bg": "verdict.unknown", "tint": True, "w": 600},
    "S": {"fg": "text.inverse", "bg": "brand", "w": 600},
    "s": {"fg": "text.primary", "bg": "canvas.selection"},
    "P": {"fg": "provenance", "bg": "provenance", "tint": True, "w": 600},
    "R": {"fg": "text.primary", "bg": "canvas.raised"},
    "K": {"fg": "text.secondary", "bg": "canvas.sunken"},
    "e": {"mix": ["text.faint", "canvas.base", 0.20]},
}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(v))):02x}" for v in rgb)


def blend(fg, bg, a):
    f, b = hex_rgb(fg), hex_rgb(bg)
    return rgb_hex(tuple(f[i] * a + b[i] * (1 - a) for i in range(3)))


def role_hex(name, theme):
    return ROLES[name][theme]


def resolve(code, theme):
    st = STYLES.get(code, STYLES[" "])
    if "mix" in st:
        fg = blend(role_hex(st["mix"][0], theme), role_hex(st["mix"][1], theme), st["mix"][2])
    else:
        fg = role_hex(st.get("fg", "text.primary"), theme)
    bg = None
    if st.get("bg"):
        raw = role_hex(st["bg"], theme)
        bg = blend(raw, role_hex("canvas.base", theme), TOKENS["tints"]["chip"]) if st.get("tint") else raw
    return fg, bg, st.get("w", 400)


class Painter:
    """level: 'true' | '256' | '16' | 'plain'"""

    def __init__(self, level, theme):
        self.level = level
        self.theme = theme

    @staticmethod
    def _nearest256(hexcol):
        r, g, b = hex_rgb(hexcol)
        # the 6x6x6 cube plus the grey ramp; good enough and stable
        def ch(v):
            return max(range(6), key=lambda i: -abs(v / 255 - i / 5))
        cube = 16 + 36 * ch(r) + 6 * ch(g) + ch(b)
        grey = 232 + max(range(24), key=lambda i: -abs(r / 255 - (8 + i * 243 / 23) / 255))
        cube_rgb = ((cube - 16) // 36 * 51, ((cube - 16) // 6) % 6 * 51, (cube - 16) % 6 * 51)
        grey_rgb = (8 + (grey - 232) * 243 // 23,) * 3
        d = lambda c: sum((a - b) ** 2 for a, b in zip(hex_rgb(hexcol), c))
        return cube if d(cube_rgb) <= d(grey_rgb) else grey

    def run(self, code, text):
        if self.level == "plain":
            return text
        fg, bg, w = resolve(code, self.theme)
        if self.level == "true":
            out = f"\x1b[38;2;{hex_rgb(fg)[0]};{hex_rgb(fg)[1]};{hex_rgb(fg)[2]}m"
            if bg:
                out += f"\x1b[48;2;{hex_rgb(bg)[0]};{hex_rgb(bg)[1]};{hex_rgb(bg)[2]}m"
        elif self.level == "256":
            role = STYLES.get(code, STYLES[" "])
            if bg and role.get("tint"):
                # saturated background + inverse ink: the 256-colour chip rule
                out = f"\x1b[48;5;{self._nearest256(role_hex(role['bg'], self.theme))}m\x1b[38;5;{self._nearest256(role_hex('text.inverse', self.theme))}m"
            else:
                out = f"\x1b[38;5;{self._nearest256(fg)}m"
                if bg:
                    out += f"\x1b[48;5;{self._nearest256(bg)}m"
        else:  # 16
            idx16 = {"text.primary": 7, "text.secondary": 7, "text.tertiary": 8, "text.faint": 8,
                     "brand": 4, "brand.bright": 12, "verdict.up": 2, "verdict.degraded": 3,
                     "verdict.down": 1, "verdict.unknown": 8, "provenance": 6, "text.inverse": 0,
                     "chart.1": 12, "chart.2": 6, "chart.3": 8, "chart.4": 3, "chart.5": 1}
            role = STYLES.get(code, STYLES[" "])
            name = role.get("fg", "text.primary")
            n = idx16.get(name, 7)
            if role.get("tint") or role.get("bg") in (None,):
                out = f"\x1b[{30 + n if n < 8 else 90 + n - 8}m"
            else:
                out = f"\x1b[{30 + n if n < 8 else 90 + n - 8}m"
            if role.get("tint"):
                out += "\x1b[7m"  # chips become reverse video at 16 colours
        if w >= 600:
            out += "\x1b[1m"
        return out + text + "\x1b[0m"

    def line(self, runs):
        return "".join(self.run(code, text) for code, text in runs)


def negotiate(args):
    if args.color == "never" or os.environ.get("NO_COLOR") or (args.color == "auto" and not sys.stdout.isatty()):
        return "plain"
    if os.environ.get("COLORTERM", "") in ("truecolor", "24bit"):
        return "true"
    if "256" in os.environ.get("TERM", ""):
        return "256"
    return "16"


def main():
    ap = argparse.ArgumentParser(description="replay the reliastra CLI design in your terminal")
    ap.add_argument("screen", nargs="?", default="06", help="screen id, a prefix of one, or 'all'")
    ap.add_argument("--list", action="store_true", help="list available screens")
    ap.add_argument("--theme", choices=["dark", "light"], default="dark")
    ap.add_argument("--color", choices=["auto", "always", "never"], default="auto")
    ap.add_argument("--play", action="store_true", help="reveal line by line, like a live session")
    args = ap.parse_args()

    files = sorted(SCREENS_DIR.glob("*.json"))
    if args.list:
        for f in files:
            doc = json.loads(f.read_text(encoding="utf-8"))
            print(f"  {f.stem:<34} {doc['cols']:>3} cols  {doc['rows']:>2} rows  exit {doc['exit']}")
        return

    if args.screen == "all":
        chosen = files
    else:
        chosen = [f for f in files if f.stem.startswith(args.screen)] or [f for f in files if args.screen in f.stem]
        if not chosen:
            sys.exit(f"no screen matches {args.screen!r} — try --list")

    level = negotiate(args)
    painter = Painter(level, args.theme)
    if level != "plain":
        sys.stdout.write(f"\x1b]0;reliastra design demo\x1b\\")
    for f in chosen:
        doc = json.loads(f.read_text(encoding="utf-8"))
        if len(chosen) > 1:
            sys.stdout.write(painter.run("f", f"\n── {f.stem} ─────────────────────────────\n"))
        for runs in doc["lines"]:
            sys.stdout.write(painter.line(runs) + "\n")
            sys.stdout.flush()
            if args.play:
                time.sleep(0.045)
        if args.play:
            time.sleep(0.35)
    if level != "plain":
        sys.stdout.write("\x1b[0m")
        if sys.stdout.isatty():
            sys.stdout.write(
                "\n\x1b[38;2;96;165;250m›\x1b[0m \x1b[38;2;165;176;194m"
                "reliastra-demo.py --list · <id> --play · --color never · --theme light\x1b[0m\n"
            )


if __name__ == "__main__":
    main()
