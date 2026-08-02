import type { CSSProperties } from "react";
import type { SourcePresentation } from "./source-file-presentation";
import { SOURCE_ICON_PALETTE } from "./source-icon-palette";

type SourceIconStyle = CSSProperties & {
  "--source-icon-foreground-light": string;
  "--source-icon-background-light": string;
  "--source-icon-foreground-dark": string;
  "--source-icon-background-dark": string;
};

export function sourceIconStyle(
  tone: Exclude<SourcePresentation, { category: "artifact" }>["iconTone"],
): SourceIconStyle {
  const colors = SOURCE_ICON_PALETTE[tone];
  return {
    "--source-icon-foreground-light": colors.light.foreground,
    "--source-icon-background-light": colors.light.background,
    "--source-icon-foreground-dark": colors.dark.foreground,
    "--source-icon-background-dark": colors.dark.background,
  };
}

export function SourcePresentationIcon({
  className = "h-8 w-8 rounded-lg",
  iconClassName = "h-[19px] w-[19px]",
  presentation,
}: {
  className?: string;
  iconClassName?: string;
  presentation: SourcePresentation;
}) {
  const { Icon } = presentation;
  return (
    <span
      className={`flex shrink-0 items-center justify-center border ${
        presentation.category === "artifact"
          ? "workspace-artifact-source-icon"
          : presentation.category === "workspace" && presentation.iconTone === "workspace"
            ? "workspace-source-file-icon workspace-reference-source-icon"
            : "workspace-source-file-icon"
      } ${className}`}
      data-studio-tone={presentation.category === "artifact" ? presentation.tone : undefined}
      style={
        presentation.category === "artifact" ? undefined : sourceIconStyle(presentation.iconTone)
      }
    >
      <Icon className={iconClassName} strokeWidth={2.2} />
    </span>
  );
}
