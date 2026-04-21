import type { CSSProperties, ComponentType } from "react";

export interface AppIconProps {
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export type AppIconComponent = ComponentType<AppIconProps>;
