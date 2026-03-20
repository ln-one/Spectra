"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProjectNameEditorProps {
  projectName?: string;
  onSave: (name: string) => void;
}

export function ProjectNameEditor({
  projectName,
  onSave,
}: ProjectNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(projectName ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const nextName = editValue.trim();
    if (nextName && nextName !== projectName) {
      onSave(nextName);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue("");
  };

  if (isEditing) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, x: -10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        className="flex items-center gap-1.5 rounded-xl border border-[var(--project-border)] bg-[var(--project-surface-elevated)] p-1 shadow-sm"
      >
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSaveEdit();
            if (event.key === "Escape") handleCancelEdit();
          }}
          className="h-8 w-[220px] border-0 px-2 text-[15px] font-semibold text-[var(--project-text-primary)] focus-visible:outline-none focus-visible:ring-0"
          placeholder="输入项目名称"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          onClick={handleSaveEdit}
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg text-[var(--project-text-muted)] hover:bg-[var(--project-surface-muted)] hover:text-[var(--project-text-primary)]"
          onClick={handleCancelEdit}
        >
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.button
      onClick={handleStartEdit}
      title="点击编辑项目名称"
      whileTap={{ scale: 0.98 }}
      className="group -ml-1.5 flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all duration-300 hover:bg-[var(--project-surface)]"
    >
      <h1 className="max-w-[320px] truncate text-[30px] font-bold leading-[1.05] tracking-tight text-[var(--project-heading,#27272a)]">
        {projectName ?? "加载中..."}
      </h1>
      <div className="-translate-x-2 flex items-center justify-center rounded-md bg-[var(--project-surface-muted)] px-1.5 py-0.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
        <span className="text-[18px] font-medium text-[var(--project-text-muted)]">
          编辑
        </span>
      </div>
    </motion.button>
  );
}
