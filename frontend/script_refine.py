import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update FeaturedProjectCard
# <span>{project.subject || "通用"} · {project.grade_level || "全学段"}</span>
content = re.sub(
    r'<span className="w-1 h-1 rounded-full bg-white/30" />\s*<span>\{project\.subject \|\| "通用"\} · \{project\.grade_level \|\| "全学段"\}</span>',
    '',
    content
)

# 2. Update ProjectListItem
content = re.sub(
    r'\{formatDate\(project\.created_at\)\} · \{project\.subject \|\| "通用"\} · \{project\.grade_level \|\| "全学段"\}',
    '{formatDate(project.created_at)}',
    content
)

# 3. Completely rewrite ProjectCard
old_project_card = re.search(r'export function ProjectCard\(\{[\s\S]*?\}\) \{\n  const logoColors = \[[\s\S]*?</motion\.div>\n  \);\n\}', content).group(0)

new_project_card = '''export function ProjectCard({
  project,
  onClick,
  onDelete,
  isDeleting = false,
}: ProjectCardProps) {
  const logoGradients = [
    "from-[#FF3B30]/80 to-[#FF9500]/80",
    "from-[#FF9500]/80 to-[#FFCC00]/80",
    "from-[#4CD964]/80 to-[#5AC8FA]/80",
    "from-[#5AC8FA]/80 to-[#007AFF]/80",
    "from-[#007AFF]/80 to-[#5856D6]/80",
    "from-[#5856D6]/80 to-[#AF52DE]/80",
  ];
  const hash = project.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bgGradient = logoGradients[hash % logoGradients.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className={cn(
        "group relative rounded-[2rem] p-6 cursor-pointer transition-all min-h-[200px] flex flex-col justify-between overflow-hidden",
        "bg-gradient-to-br backdrop-blur-xl border border-white/40 shadow-sm",
        bgGradient
      )}
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="bg-black/10 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-full">
          <p className="text-xs text-white/90 font-semibold tracking-wide">
            {formatDate(project.created_at)}
          </p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isDeleting}
              onClick={(event) => event.stopPropagation()}
              className="p-2 -mr-2 -mt-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all text-white"
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

      <div className="relative z-10 mt-6">
        <h3 className="font-black text-white text-2xl line-clamp-3 leading-snug drop-shadow-sm">
          {project.name}
        </h3>
      </div>
    </motion.div>
  );
}'''

content = content.replace(old_project_card, new_project_card)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectItems.tsx part 3')
