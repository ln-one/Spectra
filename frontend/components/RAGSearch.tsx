"use client";

import { useState } from "react";
import { ragApi } from "@/lib/api/rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, FileText, Video, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

interface RAGSearchProps {
  projectId: string;
  className?: string;
  onResultClick?: (result: RAGResult) => void;
}

interface SourceReference {
  chunk_id: string;
  source_type: "document" | "video" | "ai_generated";
  filename: string;
  page_number?: number;
  timestamp?: string;
  preview_text?: string;
}

interface RAGResult {
  chunk_id: string;
  content: string;
  score: number;
  source: SourceReference;
  metadata?: Record<string, never>;
}

const fileTypeIcons = {
  document: FileText,
  video: Video,
  ai_generated: FileQuestion,
};

export function RAGSearch({ projectId, className, onResultClick }: RAGSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RAGResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await ragApi.search({
        project_id: projectId,
        query: query.trim(),
        top_k: 10,
      });

      if (response.success && response.data.results) {
        setResults(response.data.results);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("RAG search failed:", err);
      setError("搜索失败，请稍后重试");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return "bg-green-500";
    if (score >= 0.7) return "bg-yellow-500";
    return "bg-gray-400";
  };

  const FileIcon = fileTypeIcons[results[0]?.source.source_type] || FileText;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5" />
          知识库检索
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <Input
            type="text"
            placeholder="输入关键词搜索知识库..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
            className="flex-1"
          />
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "搜索"
            )}
          </Button>
        </form>

        {error && (
          <div className="text-sm text-red-500 mb-2">{error}</div>
        )}

        <ScrollArea className="flex-1 -mx-4 px-4">
          {!hasSearched ? (
            <div className="text-center text-muted-foreground py-8">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">在知识库中搜索相关内容</p>
              <p className="text-xs mt-1">
                支持搜索已上传的文档、视频、课件等内容
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <FileQuestion className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">未找到相关结果</p>
              <p className="text-xs mt-1">尝试使用不同的关键词</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                找到 {results.length} 个相关片段
              </p>
              {results.map((result, index) => (
                <div
                  key={result.chunk_id || index}
                  className={cn(
                    "p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors",
                    onResultClick && "cursor-pointer"
                  )}
                  onClick={() => onResultClick?.(result)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {result.source.filename}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-xs text-white flex-shrink-0",
                        getScoreColor(result.score)
                      )}
                    >
                      {Math.round(result.score * 100)}%
                    </Badge>
                  </div>

                  {result.source.page_number && (
                    <p className="text-xs text-muted-foreground mb-1">
                      第 {result.source.page_number} 页
                    </p>
                  )}

                  {result.source.timestamp && (
                    <p className="text-xs text-muted-foreground mb-1">
                      {result.source.timestamp}
                    </p>
                  )}

                  <p className="text-sm line-clamp-3">{result.content}</p>

                  {result.source.preview_text && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      "{result.source.preview_text}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
