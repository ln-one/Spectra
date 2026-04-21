import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Inject the random gradient function
random_func = '''function getRandomLogoGradient(seedStr: string) {
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
  
  const stops = selectedColors.map((color, index) => {
    const percentage = Math.round((index / (colorCount - 1)) * 100);
    return `${hexToRgba(color, 0.85)} ${percentage}%`;
  });
  
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

'''

if 'getRandomLogoGradient' not in content:
    content = content.replace('export function NewProjectCard', random_func + 'export function NewProjectCard')

# Update ProjectCard completely
old_project_card = re.search(r'export function ProjectCard\(\{[\s\S]*?\}\) \{\n  const logoGradients = \[[\s\S]*?</motion\.div>\n  \);\n\}', content).group(0)

new_project_card = '''export function ProjectCard({
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
        "group relative rounded-[2rem] p-6 cursor-pointer transition-all min-h-[200px] flex flex-col justify-between overflow-hidden",
        "backdrop-blur-xl border border-white/40 shadow-sm"
      )}
      style={{ background: bgGradient }}
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="bg-black/10 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-full">
          <p className="text-xs text-white/90 font-semibold tracking-wide">
            {formatDate(project.created_at || project.createdAt || project.updatedAt)}
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

# Let's also fix FeaturedProjectCard and ProjectListItem for project.createdAt if possible
content = content.replace('formatDate(project.created_at)', 'formatDate(project.created_at || (project as any).createdAt || (project as any).updatedAt)')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectItems.tsx part 4')
