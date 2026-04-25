import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  STUDIO_STATE_TONES,
  type StudioStateTone,
} from "../state-tones";

type WorkbenchCenteredStateVariant = "centered" | "compact";

interface WorkbenchCenteredStateProps {
  tone: StudioStateTone;
  title: string;
  description: string;
  pill?: string | null;
  icon?: LucideIcon;
  loading?: boolean;
  minHeightClassName?: string;
  variant?: WorkbenchCenteredStateVariant;
}

export function WorkbenchCenteredState({
  tone,
  title,
  description,
  pill = null,
  icon: Icon,
  loading = false,
  minHeightClassName = "min-h-[320px]",
  variant = "centered",
}: WorkbenchCenteredStateProps) {
  const styles = STUDIO_STATE_TONES[tone];

  if (variant === "compact") {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-dashed px-4 py-5 text-center"
        style={{
          borderColor: styles.border,
          background: `linear-gradient(180deg, ${styles.surfaceFrom}, ${styles.surfaceTo})`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at top, ${styles.glowTop}, transparent 52%), radial-gradient(circle at bottom, ${styles.glowBottom}, transparent 48%)`,
          }}
        />
        <div className="relative">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border backdrop-blur"
            style={{
              borderColor: styles.panelBorder,
              background: styles.panelSurface,
              boxShadow: styles.panelShadow,
            }}
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: styles.icon }} />
            ) : Icon ? (
              <Icon className="h-6 w-6" style={{ color: styles.icon }} />
            ) : null}
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color: styles.title }}>
            {title}
          </p>
          <p className="mt-1 text-xs leading-6" style={{ color: styles.description }}>
            {description}
          </p>
        </div>
      </div>
    );
  }

    return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-dashed px-4 py-12 text-center"
      style={{
        borderColor: styles.border,
        background: `linear-gradient(180deg, ${styles.surfaceFrom}, ${styles.surfaceTo})`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at top, ${styles.glowTop}, transparent 52%), radial-gradient(circle at bottom, ${styles.glowBottom}, transparent 48%)`,
        }}
      />
      <div
        className={`relative flex h-full ${minHeightClassName} flex-col items-center justify-center`}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border backdrop-blur"
          style={{
            borderColor: styles.panelBorder,
            background: styles.panelSurface,
            boxShadow: styles.panelShadow,
          }}
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: styles.icon }} />
          ) : Icon ? (
            <Icon className="h-8 w-8" style={{ color: styles.icon }} />
          ) : null}
        </div>
        <p className="mt-5 text-base font-semibold" style={{ color: styles.title }}>
          {title}
        </p>
        <p
          className="mt-2 max-w-xl text-sm leading-6"
          style={{ color: styles.description }}
        >
          {description}
        </p>
        {pill ? (
          <div
            className="mt-6 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium shadow-sm"
            style={{
              borderColor: styles.pillBorder,
              background: styles.pillSurface,
              color: styles.pillText,
            }}
          >
            {pill}
          </div>
        ) : null}
      </div>
    </div>
  );
}
