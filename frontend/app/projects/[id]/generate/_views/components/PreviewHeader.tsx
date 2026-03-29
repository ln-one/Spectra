import {
  ArrowLeft,
  Bot,
  Download,
  Loader2,
  PanelRightOpen,
  Play,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PreviewHeaderProps {
  activeSessionId: string | null;
  isSessionGenerating: boolean;
  isEditingTitle: boolean;
  projectTitle: string;
  isExporting: boolean;
  isResuming: boolean;
  canResume: boolean;
  isRightPanelOpen: boolean;
  onSetEditingTitle: (value: boolean) => void;
  onSetProjectTitle: (value: string) => void;
  onGoBack: () => void;
  onExport: () => void;
  onRefresh: () => void;
  onResume: () => void;
  onToggleRightPanel: () => void;
}

export function PreviewHeader({
  activeSessionId,
  isSessionGenerating,
  isEditingTitle,
  projectTitle,
  isExporting,
  isResuming,
  canResume,
  isRightPanelOpen,
  onSetEditingTitle,
  onSetProjectTitle,
  onGoBack,
  onExport,
  onRefresh,
  onResume,
  onToggleRightPanel,
}: PreviewHeaderProps) {
  return (
    <header className="h-16 border-b bg-background px-4 md:px-6 flex items-center justify-between shrink-0">
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
            onChange={(event) => onSetProjectTitle(event.target.value)}
            onBlur={() => onSetEditingTitle(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSetEditingTitle(false);
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
          <span className="text-xs text-muted-foreground hidden lg:inline">
            Session: {activeSessionId.slice(0, 8)}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border bg-muted/50">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isSessionGenerating ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            )}
          />
          {isSessionGenerating ? "Generating" : "Synced"}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
          onClick={onToggleRightPanel}
        >
          <PanelRightOpen className="w-4 h-4 mr-2" />
          {isRightPanelOpen ? "Hide Panel" : "Redo Panel"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
          onClick={onRefresh}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
          onClick={onResume}
          disabled={!canResume || isResuming}
        >
          {isResuming ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {isResuming ? "Resuming" : "Resume"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex rounded-full h-9"
          onClick={onExport}
          disabled={!activeSessionId || isExporting}
        >
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? "Exporting" : "Download"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-9 w-9"
          onClick={onToggleRightPanel}
          aria-label="Toggle redo panel"
        >
          <Bot className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
