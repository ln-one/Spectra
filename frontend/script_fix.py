import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix "新建笔记本" -> "新建棱镜库"
content = content.replace('新建笔记本', '新建棱镜库')

# 2. Fix the color index calculation
old_color_logic = '''  const bgColor = logoColors[project.id.length % logoColors.length];'''
new_color_logic = '''  const hash = project.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bgColor = logoColors[hash % logoColors.length];'''
content = content.replace(old_color_logic, new_color_logic)

# 3. Add textures and a top-left letter avatar to the ProjectCard to fix "top half is too empty"
old_card_return = '''    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="group relative rounded-[2rem] border border-transparent p-6 cursor-pointer transition-all min-h-[220px] flex flex-col"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex items-start justify-end mb-auto">'''

new_card_return = '''    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={onClick}
      className="group relative rounded-[2rem] border border-transparent p-6 cursor-pointer transition-all min-h-[220px] flex flex-col overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* Decorative Texture */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-black/5 rounded-full transition-transform duration-500 group-hover:scale-110" />
      
      <div className="relative flex items-start justify-between z-10 mb-auto">
        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/20 text-white font-black text-2xl group-hover:bg-white/30 transition-colors">
          {project.name.charAt(0)}
        </div>'''

content = content.replace(old_card_return, new_card_return)

# 4. Make sure z-index is set for the bottom content
old_bottom_content = '''      <div className="mt-6">
        <h3 className="font-black text-white text-3xl mb-2 line-clamp-2 leading-tight">'''
new_bottom_content = '''      <div className="relative z-10 mt-6">
        <h3 className="font-black text-white text-3xl mb-2 line-clamp-2 leading-tight">'''

content = content.replace(old_bottom_content, new_bottom_content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectItems.tsx')
