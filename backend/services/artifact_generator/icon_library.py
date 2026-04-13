"""Inline SVG icon library for Manim icon objects."""

from __future__ import annotations

ICON_SVGS: dict[str, str] = {
    # Science
    "sun": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="4" stroke-linecap="round"><line x1="32" y1="4" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="60"/><line x1="4" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="60" y2="32"/><line x1="12" y1="12" x2="19" y2="19"/><line x1="45" y1="45" x2="52" y2="52"/><line x1="12" y1="52" x2="19" y2="45"/><line x1="45" y1="19" x2="52" y2="12"/></g></svg>""",
    "leaf": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 40 C16 16, 40 8, 56 8 C56 24,48 48,24 56 C12 52,8 46,8 40Z" fill="#22c55e"/><path d="M20 48 C30 36, 38 28, 50 18" stroke="#166534" stroke-width="3" fill="none"/></svg>""",
    "cell": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#bae6fd"/><circle cx="32" cy="32" r="10" fill="#38bdf8"/><circle cx="40" cy="24" r="3" fill="#0ea5e9"/><circle cx="24" cy="42" r="3" fill="#0ea5e9"/></svg>""",
    "molecule": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><line x1="20" y1="20" x2="44" y2="16" stroke="#334155" stroke-width="3"/><line x1="20" y1="20" x2="18" y2="44" stroke="#334155" stroke-width="3"/><line x1="44" y1="16" x2="46" y2="40" stroke="#334155" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="#0ea5e9"/><circle cx="44" cy="16" r="7" fill="#22c55e"/><circle cx="18" cy="44" r="7" fill="#f97316"/><circle cx="46" cy="40" r="7" fill="#a855f7"/></svg>""",
    "atom": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="4" fill="#ef4444"/><ellipse cx="32" cy="32" rx="20" ry="8" fill="none" stroke="#3b82f6" stroke-width="2"/><ellipse cx="32" cy="32" rx="20" ry="8" transform="rotate(60 32 32)" fill="none" stroke="#3b82f6" stroke-width="2"/><ellipse cx="32" cy="32" rx="20" ry="8" transform="rotate(120 32 32)" fill="none" stroke="#3b82f6" stroke-width="2"/></svg>""",
    # Network
    "server": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="14" rx="3" fill="#64748b"/><rect x="14" y="25" width="36" height="14" rx="3" fill="#64748b"/><rect x="14" y="42" width="36" height="14" rx="3" fill="#64748b"/><circle cx="20" cy="15" r="2" fill="#22c55e"/><circle cx="20" cy="32" r="2" fill="#22c55e"/><circle cx="20" cy="49" r="2" fill="#22c55e"/></svg>""",
    "router": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="10" y="28" width="44" height="16" rx="4" fill="#475569"/><line x1="20" y1="22" x2="20" y2="28" stroke="#475569" stroke-width="3"/><line x1="44" y1="22" x2="44" y2="28" stroke="#475569" stroke-width="3"/><path d="M16 22 Q20 16 24 22" stroke="#38bdf8" stroke-width="2" fill="none"/><path d="M40 22 Q44 16 48 22" stroke="#38bdf8" stroke-width="2" fill="none"/></svg>""",
    "cloud": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M20 50h26a10 10 0 0 0 1-20 14 14 0 0 0-27-4 10 10 0 0 0 0 24z" fill="#93c5fd"/></svg>""",
    "database": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="12" rx="18" ry="7" fill="#60a5fa"/><path d="M14 12v30c0 4 8 7 18 7s18-3 18-7V12" fill="#93c5fd"/><ellipse cx="32" cy="27" rx="18" ry="7" fill="#60a5fa"/><ellipse cx="32" cy="42" rx="18" ry="7" fill="#60a5fa"/></svg>""",
    # Generic
    "arrow": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><line x1="8" y1="32" x2="50" y2="32" stroke="#334155" stroke-width="5" stroke-linecap="round"/><path d="M36 20 L54 32 L36 44 Z" fill="#334155"/></svg>""",
    "check": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#22c55e"/><path d="M20 33 L29 42 L45 24" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>""",
    "cross": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#ef4444"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/></svg>""",
    "star": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 8 L39 24 L56 24 L42 35 L48 52 L32 41 L16 52 L22 35 L8 24 L25 24 Z" fill="#facc15"/></svg>""",
}

ICON_ALIASES: dict[str, str] = {
    "laptop": "server",
    "computer": "server",
    "db": "database",
    "tick": "check",
    "x": "cross",
}


def resolve_icon_name(name: str | None) -> str:
    key = (name or "").strip().lower()
    if key in ICON_SVGS:
        return key
    if key in ICON_ALIASES and ICON_ALIASES[key] in ICON_SVGS:
        return ICON_ALIASES[key]
    return "star"
