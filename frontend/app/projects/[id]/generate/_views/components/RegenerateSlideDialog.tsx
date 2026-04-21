import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { previewApi } from "@/lib/sdk/preview";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface RegenerateSlideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  runId: string;
  artifactId?: string | null;
  expectedRenderVersion?: number | null;
  slideId?: string | null;
  slideNo: number;
  slideTitle?: string;
  onSuccess?: () => void;
}

export function RegenerateSlideDialog({
  open,
  onOpenChange,
  sessionId,
  runId,
  artifactId,
  expectedRenderVersion,
  slideId,
  slideNo,
  slideTitle,
  onSuccess,
}: RegenerateSlideDialogProps) {
  const [instruction, setInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!instruction.trim() || isSubmitting || !sessionId) return;

    try {
      setIsSubmitting(true);
      await previewApi.modifySessionPreview(sessionId, {
        run_id: runId || undefined,
        artifact_id: artifactId || undefined,
        slide_id: slideId || undefined,
        slide_index: slideNo,
        instruction: instruction.trim(),
        base_render_version: expectedRenderVersion ?? undefined,
        scope: "current_slide_only",
        preserve_style: true,
        preserve_layout: true,
        preserve_deck_consistency: true,
      });

      toast({
        title: "重做请求已发送",
        description: `正在为您重新生成第 ${slideNo} 页，请稍候。`,
      });

      setInstruction("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: "请求失败",
        description: error instanceof Error ? error.message : "无法发送重做请求，请重试。",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isSubmitting && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>重做单页 (Slide {slideNo})</DialogTitle>
          <DialogDescription>
            {slideTitle ? `当前页面：${slideTitle}` : "请输入您对该页的修改意见，AI 将为您重新生成此页内容。"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：把内容精简为 3 个要点；或者：加入更多具体的数据分析..."
            className="min-h-[120px] resize-none"
            disabled={isSubmitting}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!sessionId || !instruction.trim() || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            重新生成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
