import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update project kind visuals removal
# Find: const pastelColors = getProjectKindVisuals("w-6 h-6");
#       const color = pastelColors[project.id.length % pastelColors.length];
content = re.sub(
    r'const pastelColors = getProjectKindVisuals\("w-6 h-6"\);\s*const color = pastelColors\[project.id.length % pastelColors.length\];',
    '''const logoColors = [
    "#FF3B30",
    "#FF9500",
    "#FFCC00",
    "#4CD964",
    "#5AC8FA",
    "#007AFF",
    "#5856D6",
    "#AF52DE",
  ];
  const bgColor = logoColors[project.id.length % logoColors.length];''',
    content
)

# 2. Update ProjectCard class and style
content = re.sub(
    r'className="group relative bg-white rounded-\[2rem\] border border-zinc-50 p-6 cursor-pointer hover:border-zinc-100 transition-all min-h-\[220px\] flex flex-col"',
    r'className="group relative rounded-[2rem] border border-transparent p-6 cursor-pointer transition-all min-h-[220px] flex flex-col"\n      style={{ backgroundColor: bgColor }}',
    content
)

# 3. Remove the colored icon container in ProjectCard
content = re.sub(
    r'<div\s+className=\{cn\(\s*"w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",\s*color\.bg\s*\)\s*\}\s*>\s*\{color\.icon\}\s*</div>',
    '',
    content
)

# 4. Update the font sizes and colors in ProjectCard
# title: <h3 className="font-bold text-zinc-900 text-lg mb-1 truncate leading-tight">
content = re.sub(
    r'<h3 className="font-bold text-zinc-900 text-lg mb-1 truncate leading-tight">',
    '<h3 className="font-black text-white text-3xl mb-2 line-clamp-2 leading-tight">',
    content
)
# placeholder texts
# <p className="text-xs text-zinc-400 font-medium">
content = re.sub(
    r'<p className="text-xs text-zinc-400 font-medium">\s*\{formatDate\(project\.created_at\)\} · 12 个来源\s*</p>',
    '<p className="text-sm text-white/80 font-bold">\n          {formatDate(project.created_at)} · {project.subject || "通用"} · {project.grade_level || "全学段"}\n        </p>',
    content
)

# 5. Fix text color for dropdown icon inside ProjectCard
content = re.sub(
    r'className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-zinc-50 transition-all text-zinc-400"',
    'className="p-2 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all text-white/90"',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectItems.tsx')
