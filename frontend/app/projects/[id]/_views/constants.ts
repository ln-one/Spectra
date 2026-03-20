export const springConfig = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 1,
} as const;

export const PAGE_GAP = 24;
export const PANEL_GAP = 12;
export const HEADER_TO_PANEL_GAP = 0;
export const PANEL_TOP_INSET = 0;
export const MIN_RESIZABLE_PANEL_WIDTH = 85;
export const MIN_EXPANDED_RIGHT_PANEL_WIDTH = 260;
export const COLLAPSED_EXPANDED_SOURCES_HEIGHT_PX = 126;
export const COLLAPSED_SOURCES_WIDTH_PX = 85;
export const COLLAPSED_SOURCES_TRIGGER_WIDTH_PX = 180;
export const EXPANDED_SOURCES_COMFORT_WIDTH_PX = 280;
export const SOURCES_TITLE_SAFE_MIN_WIDTH_PX = 214;

export function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
