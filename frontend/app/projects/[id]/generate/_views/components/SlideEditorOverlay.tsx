import { cn } from "@/lib/utils";

interface SlideEditorOverlayProps {
  slideNo: number;
  width?: number;
  height?: number;
  interactive?: boolean;
}

export function SlideEditorOverlay({
  slideNo,
  width = 1280,
  height = 720,
  interactive = false,
}: SlideEditorOverlayProps) {
  if (!interactive) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 pointer-events-none",
        "flex flex-col items-center justify-center bg-black/5"
      )}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div className="pointer-events-auto rounded bg-white/90 px-3 py-1.5 text-xs font-medium text-black/60 shadow backdrop-blur">
        页面 {slideNo} 前端可交互编辑层已加载 (Level 1)
      </div>
    </div>
  );
}
