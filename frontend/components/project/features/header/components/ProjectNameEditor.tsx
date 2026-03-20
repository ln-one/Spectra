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

export function ProjectNameEditor({ projectName, onSave }: ProjectNameEditorProps) {
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
        className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-sm border border-zinc-200"
      >
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSaveEdit();
            if (event.key === "Escape") handleCancelEdit();
          }}
          className="h-8 w-[220px] text-[15px] font-semibold border-0 focus-visible:ring-0 focus-visible:outline-none px-2"
          placeholder="输入项目名称"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={handleSaveEdit}
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50"
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
      className="group flex items-center gap-2 px-3 py-1.5 -ml-1.5 rounded-xl hover:bg-zinc-100/60 transition-all duration-300"
    >
      <h1 className="text-[30px] leading-[1.05] font-bold text-zinc-800 tracking-tight truncate max-w-[320px]">
        {projectName ?? "加载中..."}
      </h1>
      <div className="flex items-center justify-center px-1.5 py-0.5 rounded-md bg-zinc-100 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
        <span className="text-[18px] font-medium text-zinc-500">编辑</span>
      </div>
    </motion.button>
  );
}
