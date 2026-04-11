import { cn } from "@/lib/utils";

export function HtmlPreviewFrame({
  title,
  html,
  className,
  interactive = false,
}: {
  title: string;
  html: string;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox=""
      loading="lazy"
      tabIndex={interactive ? 0 : -1}
      className={cn(
        "block h-full w-full border-0 bg-white",
        interactive ? "pointer-events-auto" : "pointer-events-none",
        className
      )}
    />
  );
}
