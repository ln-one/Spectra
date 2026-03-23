"use client";

import type { StudioPanelProps } from "./panel/types";
import { StudioPanelContainer } from "./panel/StudioPanelContainer";

export function StudioPanel(props: StudioPanelProps) {
  return <StudioPanelContainer {...props} />;
}

export { StudioPanel as StudioExpandedPanel };
