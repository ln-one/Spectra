export type StudioStateTone =
  | "sky"
  | "teal"
  | "violet"
  | "rose"
  | "amber"
  | "emerald";

export const STUDIO_STATE_TONES: Record<
  StudioStateTone,
  {
    border: string;
    surfaceFrom: string;
    surfaceTo: string;
    glowTop: string;
    glowBottom: string;
    panelBorder: string;
    panelSurface: string;
    panelShadow: string;
    icon: string;
    title: string;
    description: string;
    pillBorder: string;
    pillSurface: string;
    pillText: string;
  }
> = {
  sky: {
    border: "#bae6fd",
    surfaceFrom: "rgba(239,246,255,0.96)",
    surfaceTo: "rgba(248,250,252,0.94)",
    glowTop: "rgba(96,165,250,0.14)",
    glowBottom: "rgba(14,165,233,0.10)",
    panelBorder: "rgba(186,230,253,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(59,130,246,0.38)",
    icon: "#0ea5e9",
    title: "#082f49",
    description: "rgba(3,105,161,0.9)",
    pillBorder: "#bae6fd",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#0369a1",
  },
  teal: {
    border: "#99f6e4",
    surfaceFrom: "rgba(240,253,250,0.96)",
    surfaceTo: "rgba(236,254,255,0.92)",
    glowTop: "rgba(45,212,191,0.16)",
    glowBottom: "rgba(14,165,233,0.10)",
    panelBorder: "rgba(153,246,228,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(20,184,166,0.45)",
    icon: "#14b8a6",
    title: "#042f2e",
    description: "rgba(15,118,110,0.9)",
    pillBorder: "#99f6e4",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#0f766e",
  },
  violet: {
    border: "#ddd6fe",
    surfaceFrom: "rgba(245,243,255,0.96)",
    surfaceTo: "rgba(250,245,255,0.92)",
    glowTop: "rgba(167,139,250,0.16)",
    glowBottom: "rgba(192,132,252,0.10)",
    panelBorder: "rgba(221,214,254,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(139,92,246,0.42)",
    icon: "#8b5cf6",
    title: "#2e1065",
    description: "rgba(109,40,217,0.9)",
    pillBorder: "#ddd6fe",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#6d28d9",
  },
  rose: {
    border: "#fecdd3",
    surfaceFrom: "rgba(255,241,242,0.96)",
    surfaceTo: "rgba(255,247,250,0.92)",
    glowTop: "rgba(251,113,133,0.16)",
    glowBottom: "rgba(244,114,182,0.10)",
    panelBorder: "rgba(254,205,211,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(244,63,94,0.36)",
    icon: "#f43f5e",
    title: "#4c0519",
    description: "rgba(190,24,93,0.9)",
    pillBorder: "#fecdd3",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#be185d",
  },
  amber: {
    border: "#fde68a",
    surfaceFrom: "rgba(255,251,235,0.97)",
    surfaceTo: "rgba(255,247,237,0.92)",
    glowTop: "rgba(251,191,36,0.16)",
    glowBottom: "rgba(249,115,22,0.10)",
    panelBorder: "rgba(253,230,138,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(245,158,11,0.34)",
    icon: "#f59e0b",
    title: "#451a03",
    description: "rgba(180,83,9,0.9)",
    pillBorder: "#fde68a",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#b45309",
  },
  emerald: {
    border: "#bbf7d0",
    surfaceFrom: "rgba(240,253,244,0.97)",
    surfaceTo: "rgba(236,253,245,0.92)",
    glowTop: "rgba(74,222,128,0.16)",
    glowBottom: "rgba(16,185,129,0.10)",
    panelBorder: "rgba(187,247,208,0.8)",
    panelSurface: "rgba(255,255,255,0.80)",
    panelShadow: "0 18px 50px -24px rgba(34,197,94,0.36)",
    icon: "#22c55e",
    title: "#052e16",
    description: "rgba(21,128,61,0.9)",
    pillBorder: "#bbf7d0",
    pillSurface: "rgba(255,255,255,0.85)",
    pillText: "#15803d",
  },
};
