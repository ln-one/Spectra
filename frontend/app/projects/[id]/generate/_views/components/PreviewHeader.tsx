import { ArrowLeft, Download, Edit3, Play, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PreviewHeaderProps {
  activeSessionId: string | null;
  isSessionGenerating: boolean;
  isEditingTitle: boolean;
  projectTitle: string;
  isExporting: boolean;
  onSetEditingTitle: (value: boolean) => void;
  onSetProjectTitle: (value: string) => void;
  onGoBack: () => void;
  onExport: () => void;
}

export function PreviewHeader({
  activeSessionId,
  isSessionGenerating,
  isEditingTitle,
  projectTitle,
  isExporting,
  onSetEditingTitle,
  onSetProjectTitle,
  onGoBack,
  onExport,
}: PreviewHeaderProps) {
  return (
    <header className="h-14 border-b bg-background/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={onGoBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {isEditingTitle ? (
          <Input
            value={projectTitle}
            onChange={(e) => onSetProjectTitle(e.target.value)}
            onBlur={() => onSetEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSetEditingTitle(false);
            }}
            className="h-8 w-56"
            autoFocus
          />
        ) : (
          <button
            className="text-sm font-medium hover:text-primary transition-colors truncate"
            onClick={() => onSetEditingTitle(true)}
          >
            {projectTitle}
          </button>
        )}

        {activeSessionId ? (
          <span className="text-xs text-muted-foreground hidden md:inline">
            会话: {activeSessionId.slice(0, 8)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border bg-muted/40">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isSessionGenerating
                ? "bg-amber-500 animate-pulse"
                : "bg-emerald-500"
            )}
          />
          {isSessionGenerating ? "生成中" : "已同步"}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
        >
          <Edit3 className="w-4 h-4 mr-2" />
          编辑
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
          onClick={onExport}
          disabled={!activeSessionId || isExporting}
        >
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? "导出中" : "导出"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
        >
          <Share2 className="w-4 h-4 mr-2" />
          分享
        </Button>
        <Button
          size="sm"
          className="rounded-full h-9 bg-foreground text-background hover:bg-foreground/90"
        >
          <Play className="w-4 h-4 mr-2 fill-current" />
          演示
        </Button>
      </div>
    </header>
  );
}
