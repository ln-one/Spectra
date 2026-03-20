"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, Download, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";

interface SessionArtifactsProps {
  groupedArtifacts: Array<[string, ArtifactHistoryItem[]]>;
  toolLabels: Record<string, string>;
  onRefresh: () => void;
  onOpenArtifact: (item: ArtifactHistoryItem) => void;
  onExportArtifact: (artifactId: string) => void;
}

export function SessionArtifacts({
  groupedArtifacts,
  toolLabels,
  onRefresh,
  onOpenArtifact,
  onExportArtifact,
}: SessionArtifactsProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-2 border-t border-zinc-100"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-zinc-500">当前会话成果</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-zinc-500"
          onClick={onRefresh}
        >
          刷新
        </Button>
      </div>
      <div className="space-y-2">
        <AnimatePresence>
          {groupedArtifacts.map(([toolKey, items]) => (
            <motion.div
              key={toolKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-1.5"
            >
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">
                {toolLabels[toolKey] ?? toolKey}
              </p>
              {items.slice(0, 3).map((item, index) => (
                <motion.div
                  key={item.artifactId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors"
                >
                  <button
                    className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0"
                    onClick={() => onOpenArtifact(item)}
                  >
                    {item.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : item.status === "failed" ? (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-zinc-700 truncate">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={() => onExportArtifact(item.artifactId)}
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-500" />
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
