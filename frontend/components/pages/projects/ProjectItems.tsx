import { motion } from "framer-motion";
import {
  Clock,
  ChevronRight,
  FolderOpen,
  MoreVertical,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, Project, statusConfig } from "./project-types";

export function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const status = statusConfig[project.status] || statusConfig.draft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="group relative bg-white rounded-2xl border border-zinc-100 p-5 cursor-pointer hover:shadow-lg hover:border-zinc-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center group-hover:from-zinc-100 group-hover:to-zinc-150 transition-colors">
          <FolderOpen className="w-6 h-6 text-zinc-400 group-hover:text-zinc-500 transition-colors" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-zinc-100 transition-all"
            >
              <MoreVertical className="w-4 h-4 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="gap-2">
              <Settings className="w-4 h-4" />
              设置
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600">
              <Trash2 className="w-4 h-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="font-semibold text-zinc-900 mb-1 truncate">{project.name}</h3>

      {project.subject && (
        <p className="text-sm text-zinc-500 mb-3">
          {project.grade_level && `${project.grade_level} · `}
          {project.subject}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-50">
        <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", status.color)}>
          {status.label}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          {formatDate(project.created_at)}
        </div>
      </div>

      <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-5 h-5 text-zinc-300" />
      </div>
    </motion.div>
  );
}

export function ProjectListItem({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const status = statusConfig[project.status] || statusConfig.draft;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      onClick={onClick}
      className="group flex items-center gap-4 p-4 bg-white rounded-xl border border-zinc-100 cursor-pointer hover:border-zinc-200 hover:shadow-sm transition-all duration-200"
    >
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center shrink-0">
        <FolderOpen className="w-5 h-5 text-zinc-400" />
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-zinc-900 truncate">{project.name}</h3>
        {project.subject && (
          <p className="text-sm text-zinc-500">
            {project.grade_level && `${project.grade_level} · `}
            {project.subject}
          </p>
        )}
      </div>

      <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full shrink-0", status.color)}>
        {status.label}
      </span>

      <div className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
        <Clock className="w-3.5 h-3.5" />
        {formatDate(project.created_at)}
      </div>

      <ChevronRight className="w-5 h-5 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </motion.div>
  );
}
