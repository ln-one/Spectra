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

function getRandomLogoGradient(seedStr: string) {
  const logoColors = [
    "#FF3B30",
    "#FF9500",
    "#FFCC00",
    "#4CD964",
    "#5AC8FA",
    "#007AFF",
    "#5856D6",
    "#AF52DE",
  ];
  
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const random = () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };
  
  const colorCount = random() > 0.5 ? 3 : 2;
  const selectedColors: string[] = [];
  const availableColors = [...logoColors];
  
  for (let i = 0; i < colorCount; i++) {
    const idx = Math.floor(random() * availableColors.length);
    selectedColors.push(availableColors[idx]);
    availableColors.splice(idx, 1);
  }
  
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const bgBase = "#ffffff";
  if (colorCount === 2) {
    return `
      radial-gradient(circle at 0% 0%, ${hexToRgba(selectedColors[0], 0.4)} 0%, transparent 80%),
      radial-gradient(circle at 100% 100%, ${hexToRgba(selectedColors[1], 0.4)} 0%, transparent 80%),
      ${bgBase}
    `;
  } else {
    return `
      radial-gradient(circle at 0% 0%, ${hexToRgba(selectedColors[0], 0.4)} 0%, transparent 70%),
      radial-gradient(circle at 100% 100%, ${hexToRgba(selectedColors[1], 0.4)} 0%, transparent 70%),
      radial-gradient(circle at 100% 0%, ${hexToRgba(selectedColors[2], 0.4)} 0%, transparent 70%),
      ${bgBase}
    `;
  }
}

export function NewProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="flex flex-col items-center justify-center p-8 bg-white rounded-[2rem] border-2 border-dashed border-zinc-100 cursor-pointer hover:border-blue-200 transition-all min-h-[160px]"
    >
      <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4 text-blue-500 shadow-sm">
        <Plus className="w-8 h-8" />
      </div>
      <span className="text-sm font-semibold text-zinc-600">新建棱镜库</span>
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
  const bgGradient = getRandomLogoGradient(project.id);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className={cn(
        "relative aspect-[16/10] rounded-[2rem] overflow-hidden cursor-pointer shadow-xl group",
        "border border-white/20"
      )}
      style={{ background: bgGradient }}
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
          <span>{formatDate(project.created_at || (project as any).createdAt || (project as any).updatedAt)}</span>
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
  const bgGradient = getRandomLogoGradient(project.id);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className={cn(
        "group relative rounded-[2rem] p-6 cursor-pointer transition-all min-h-[180px] flex flex-col justify-between overflow-hidden",
        "border border-zinc-100/50 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
      )}
      style={{ background: bgGradient }}
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="bg-white/60 backdrop-blur-md border border-white/40 px-3 py-1.5 rounded-full shadow-sm">
          <p className="text-xs text-zinc-600 font-semibold tracking-wide">
            {formatDate(project.created_at || (project as any).createdAt || (project as any).updatedAt)}
          </p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isDeleting}
              onClick={(event) => event.stopPropagation()}
              className="p-2 -mr-2 -mt-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-all text-zinc-400"
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

      <div className="relative z-10 mt-4">
        <h3 className="font-bold text-zinc-900 text-xl line-clamp-2 leading-tight">
          {project.name}
        </h3>
        {(project as any).description && (
          <p className="text-sm text-zinc-500 mt-2 line-clamp-2 leading-relaxed">
            {(project as any).description}
          </p>
        )}
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
          {formatDate(project.created_at || (project as any).createdAt || (project as any).updatedAt)}
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
