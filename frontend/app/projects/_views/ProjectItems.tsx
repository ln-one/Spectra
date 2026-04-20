import { motion } from "framer-motion";
import {
  ChevronRight,
  MoreVertical,
  Settings,
  Trash2,
  Plus,
} from "lucide-react";
import { ProjectFeaturedMark } from "@/components/icons/project/ProjectFeaturedMark";
import { getProjectKindVisuals } from "@/components/icons/project/ProjectKindIcons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, Project } from "./project-types";

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete: () => void | Promise<void>;
  isDeleting?: boolean;
}

export function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] border-2 border-dashed border-zinc-100 cursor-pointer hover:border-blue-200 transition-all min-h-[220px]"
    >
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4 text-blue-500 shadow-sm">
        <Plus className="w-8 h-8" />
      </div>
      <span className="text-sm font-semibold text-zinc-600">新建笔记本</span>
    </motion.div>
  );
}

export function FeaturedProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  // Use a pseudo-random gradient based on project ID
  const gradients = [
    "from-purple-600 to-indigo-700",
    "from-blue-600 to-cyan-700",
    "from-emerald-600 to-teal-700",
    "from-orange-600 to-rose-700",
  ];
  const gradient = gradients[project.id.length % gradients.length];

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className={cn(
        "relative aspect-[16/10] rounded-[2rem] overflow-hidden cursor-pointer shadow-xl group",
        "bg-gradient-to-br",
        gradient
      )}
    >
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
      <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
            <ProjectFeaturedMark className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
            Featured
          </span>
        </div>
        <h3 className="text-lg font-bold text-white leading-tight mb-1 line-clamp-2">
          {project.name}
        </h3>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span>{formatDate(project.created_at)}</span>
          <span className="w-1 h-1 rounded-full bg-white/30" />
          <span>7 个来源</span>
        </div>
      </div>
      <div className="absolute top-4 right-4">
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
          {getProjectKindVisuals("w-4 h-4")[0].icon}
        </div>
      </div>
    </motion.div>
  );
}

export function ProjectCard({
  project,
  onClick,
  onDelete,
  isDeleting = false,
}: ProjectCardProps) {
  const pastelColors = getProjectKindVisuals("w-6 h-6");
  const color = pastelColors[project.id.length % pastelColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="group relative bg-white rounded-[2rem] border border-zinc-50 p-6 cursor-pointer hover:border-zinc-100 transition-all min-h-[220px] flex flex-col"
    >
      <div className="flex items-start justify-between mb-auto">
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
            color.bg
          )}
        >
          {color.icon}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isDeleting}
              onClick={(event) => event.stopPropagation()}
              className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-zinc-50 transition-all text-zinc-400"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 rounded-2xl p-2 shadow-2xl border-zinc-100"
          >
            <DropdownMenuItem className="gap-2 rounded-xl py-2.5">
              <Settings className="w-4 h-4" />
              项目设置
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-red-600 focus:text-red-600 rounded-xl py-2.5"
              disabled={isDeleting}
              onSelect={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void onDelete();
              }}
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "正在删除..." : "移除项目"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-6">
        <h3 className="font-bold text-zinc-900 text-lg mb-1 truncate leading-tight">
          {project.name}
        </h3>
        <p className="text-xs text-zinc-400 font-medium">
          {formatDate(project.created_at)} · 12 个来源
        </p>
      </div>
    </motion.div>
  );
}

export function ProjectSkeleton() {
  return (
    <div className="w-full space-y-12">
      <div className="space-y-6">
        <div className="h-8 w-40 bg-zinc-100 rounded-full animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-[16/10] rounded-[2rem] bg-zinc-100 animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-8 w-48 bg-zinc-100 rounded-full animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="h-[220px] rounded-[2rem] bg-zinc-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProjectListItem({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const pastelColors = getProjectKindVisuals("w-5 h-5");
  const color = pastelColors[project.id.length % pastelColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.8)" }}
      onClick={onClick}
      className="group flex items-center gap-5 p-5 bg-white rounded-[1.5rem] border border-zinc-50 cursor-pointer hover:border-zinc-100 hover:shadow-md transition-all duration-200"
    >
      <div
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          color.bg
        )}
      >
        {color.icon}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-zinc-900 truncate leading-tight">
          {project.name}
        </h3>
        <p className="text-xs text-zinc-400 font-medium mt-1">
          {formatDate(project.created_at)} · 12 个来源
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <div className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
            Last Modified
          </div>
          <div className="text-xs font-semibold text-zinc-500">
            {formatDate(project.created_at)}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all shrink-0" />
      </div>
    </motion.div>
  );
}
