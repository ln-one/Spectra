"use client";

import { useEffect } from "react";
import { useGenerateStore } from "@/stores/generateStore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  StopCircle,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressTrackerProps {
  className?: string;
  onDownload?: (taskId: string, fileType: "pptx" | "docx") => void;
}

export function ProgressTracker({
  className,
  onDownload,
}: ProgressTrackerProps) {
  const {
    currentTask,
    isLoading,
    error,
    pollTaskStatus,
    stopPolling,
    fetchTaskStatus,
  } = useGenerateStore();

  const isGenerating =
    currentTask?.status === "processing" || currentTask?.status === "pending";
  const isCompleted = currentTask?.status === "completed";
  const isFailed = currentTask?.status === "failed";

  useEffect(() => {
    if (currentTask && isGenerating) {
      pollTaskStatus(currentTask.id);
    }
  }, [currentTask?.id]);

  const handleCancel = () => {
    if (currentTask) {
      stopPolling();
    }
  };

  const handleRetry = async () => {
    if (currentTask) {
      await fetchTaskStatus(currentTask.id);
    }
  };

  const handleDownload = async (fileType: "pptx" | "docx") => {
    if (!currentTask || !onDownload) return;
    onDownload(currentTask.id, fileType);
  };

  if (!currentTask && !isLoading) {
    return null;
  }

  const getStatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
    switch (currentTask?.status) {
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    if (isLoading) {
      return "正在创建任务...";
    }
    switch (currentTask?.status) {
      case "pending":
        return "等待处理";
      case "processing":
        return "正在生成";
      case "completed":
        return "生成完成";
      case "failed":
        return currentTask.errorMessage || "生成失败";
      default:
        return "";
    }
  };

  const getStatusDescription = () => {
    switch (currentTask?.status) {
      case "pending":
        return "任务已创建，等待 AI 处理";
      case "processing":
        return "AI 正在生成课件内容，请稍候...";
      case "completed":
        return "课件已生成成功，您可以下载或预览";
      case "failed":
        return "请检查项目内容后重试";
      default:
        return "";
    }
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {getStatusIcon()}
          {getStatusText()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isGenerating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">进度</span>
              <span className="font-medium">{currentTask?.progress || 0}%</span>
            </div>
            <Progress value={currentTask?.progress || 0} className="h-2" />
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {getStatusDescription()}
        </p>

        <div className="flex gap-2">
          {isGenerating && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              取消
            </Button>
          )}

          {isFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isLoading}
              className="flex-1"
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")}
              />
              重试
            </Button>
          )}

          {isCompleted && (
            <>
              {currentTask?.outputUrls?.ppt && (
                <Button
                  size="sm"
                  onClick={() => handleDownload("pptx")}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载 PPT
                </Button>
              )}
              {currentTask?.outputUrls?.word && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload("docx")}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  下载 Word
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProgressTracker;
