import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# placeholder texts in ProjectListItem
# <p className="text-xs text-zinc-400 font-medium mt-1">
#   {formatDate(project.created_at)} · 12 个来源
# </p>
content = re.sub(
    r'<p className="text-xs text-zinc-400 font-medium mt-1">\s*\{formatDate\(project\.created_at\)\} · 12 个来源\s*</p>',
    '<p className="text-xs text-zinc-400 font-medium mt-1">\n          {formatDate(project.created_at)} · {project.subject || "通用"} · {project.grade_level || "全学段"}\n        </p>',
    content
)

# And in FeaturedProjectCard
# <div className="flex items-center gap-3 text-xs text-white/60">
#   <span>{formatDate(project.created_at)}</span>
#   <span className="w-1 h-1 rounded-full bg-white/30" />
#   <span>7 个来源</span>
# </div>
content = re.sub(
    r'<span>7 个来源</span>',
    '<span>{project.subject || "通用"} · {project.grade_level || "全学段"}</span>',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectItems.tsx part 2')
