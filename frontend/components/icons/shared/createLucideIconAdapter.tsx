import type { LucideIcon } from "lucide-react";
import type { AppIconComponent, AppIconProps } from "./icon-types";

export function createLucideIconAdapter(Icon: LucideIcon): AppIconComponent {
  function LucideIconAdapter(props: AppIconProps) {
    return <Icon {...props} />;
  }

  LucideIconAdapter.displayName = `AppIcon(${Icon.displayName ?? Icon.name ?? "Lucide"})`;

  return LucideIconAdapter;
}
