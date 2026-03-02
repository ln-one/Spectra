"use client";

import { useState } from "react";
import { ragApi } from "@/lib/api/rag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Video,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SourceReference {
  chunk_id: string;
  source_type: "video" | "document" | "ai_generated";
  filename: string;
  page_number?: number;
  timestamp?: string;
  preview_text?: string;
}

interface SourceTrackerProps {
  sources?: SourceReference[];
  className?: string;
  variant?: "compact" | "expanded";
  onSourceClick?: (source: SourceReference) => void;
  onAdopt?: (source: SourceReference) => void;
  onDismiss?: (source: SourceReference) => void;
}

const sourceTypeConfig = {
  video: {
    icon: Video,
    label: "视频",
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  document: {
    icon: FileText,
    label: "文档",
    color: "text-orange-500",
    bgColor: "bg-orange-50",
  },
  ai_generated: {
    icon: FileQuestion,
    label: "AI 生成",
    color: "text-purple-500",
    bgColor: "bg-purple-50",
  },
};

function SourceCard({
  source,
  onClick,
  onAdopt,
  onDismiss,
  showActions = false,
}: {
  source: SourceReference;
  onClick?: () => void;
  onAdopt?: () => void;
  onDismiss?: () => void;
  showActions?: boolean;
}) {
  const config = sourceTypeConfig[source.source_type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        onClick && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className={cn("p-1.5 rounded-md", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{source.filename}</p>
            <Badge variant="secondary" className="text-xs flex-shrink-0">
              {config.label}
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {source.page_number && <span>第 {source.page_number} 页</span>}
            {source.page_number && source.timestamp && <span>·</span>}
            {source.timestamp && <span>{source.timestamp}</span>}
          </div>

          {source.preview_text && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">
              "{source.preview_text}"
            </p>
          )}
        </div>

        {onClick && (
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {showActions && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          {onAdopt && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8"
              onClick={(e) => {
                e.stopPropagation();
                onAdopt();
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              采纳
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              <X className="h-3 w-3 mr-1" />
              忽略
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SourceDetailPanel({
  source,
  onClose,
}: {
  source: SourceReference;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [detail, setDetail] = useState<{
    content: string;
    context?: { previous_chunk?: string; next_chunk?: string };
  } | null>(null);

  const loadDetail = async () => {
    setIsLoading(true);
    try {
      const response = await ragApi.getSourceDetail(source.chunk_id);
      if (response.success && response.data) {
        setDetail({
          content: response.data.content || "",
          context: response.data.context,
        });
      }
    } catch (error) {
      console.error("Failed to load source detail:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">来源详情</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto">
          <SourceCard source={source} />

          {!detail && !isLoading && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={loadDetail}
            >
              加载完整内容
            </Button>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {detail && (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">内容</h4>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {detail.content}
                </div>
              </div>

              {detail.context && (
                <>
                  {detail.context.previous_chunk && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">前文</h4>
                      <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                        {detail.context.previous_chunk}
                      </div>
                    </div>
                  )}

                  {detail.context.next_chunk && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">后续</h4>
                      <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                        {detail.context.next_chunk}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SourceTracker({
  sources = [],
  className,
  variant = "expanded",
  onSourceClick,
  onAdopt,
  onDismiss,
}: SourceTrackerProps) {
  const [selectedSource, setSelectedSource] = useState<SourceReference | null>(
    null
  );
  const [expanded, setExpanded] = useState(variant === "expanded");

  if (sources.length === 0) {
    return null;
  }

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)}>
        {sources.map((source, index) => (
          <SourceCard
            key={source.chunk_id || index}
            source={source}
            onClick={() => onSourceClick?.(source)}
            showActions={!!onAdopt || !!onDismiss}
            onAdopt={onAdopt ? () => onAdopt(source) : undefined}
            onDismiss={onDismiss ? () => onDismiss(source) : undefined}
          />
        ))}

        {selectedSource && (
          <SourceDetailPanel
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">内容来源 ({sources.length})</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-6 px-2"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              收起
            </>
          ) : (
            <>
              <ChevronRight className="h-4 w-4 mr-1" />
              展开
            </>
          )}
        </Button>
      </div>

      {expanded && (
        <ScrollArea className="h-[200px] pr-2">
          <div className="space-y-2">
            {sources.map((source, index) => (
              <SourceCard
                key={source.chunk_id || index}
                source={source}
                onClick={() => {
                  if (onSourceClick) {
                    onSourceClick(source);
                  } else {
                    setSelectedSource(source);
                  }
                }}
                showActions={!!onAdopt || !!onDismiss}
                onAdopt={onAdopt ? () => onAdopt(source) : undefined}
                onDismiss={onDismiss ? () => onDismiss(source) : undefined}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {selectedSource && !onSourceClick && (
        <SourceDetailPanel
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
}

interface SourceTrackerPanelProps {
  sources?: SourceReference[];
  className?: string;
  onSourceClick?: (source: SourceReference) => void;
}

export function SourceTrackerPanel({
  sources = [],
  className,
  onSourceClick,
}: SourceTrackerPanelProps) {
  const [activeTab, setActiveTab] = useState<"list" | "detail">("list");
  const [selectedSource, setSelectedSource] = useState<SourceReference | null>(
    null
  );

  return (
    <div className={className}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "list" | "detail")}
      >
        <TabsList className="w-full">
          <TabsTrigger value="list" className="flex-1">
            来源列表
          </TabsTrigger>
          <TabsTrigger
            value="detail"
            className="flex-1"
            disabled={!selectedSource}
          >
            详情
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3">
          <ScrollArea className="h-[calc(100vh-300px)]">
            {sources.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <FileQuestion className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">当前幻灯片无来源信息</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((source, index) => (
                  <div
                    key={source.chunk_id || index}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedSource?.chunk_id === source.chunk_id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => {
                      setSelectedSource(source);
                      onSourceClick?.(source);
                    }}
                  >
                    <SourceCard source={source} />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="detail" className="mt-3">
          {selectedSource ? (
            <SourceDetailPanel
              source={selectedSource}
              onClose={() => {
                setSelectedSource(null);
                setActiveTab("list");
              }}
            />
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">请先选择来源</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
