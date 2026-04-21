import os

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectsPageView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const featuredProjects = projects.slice(0, 4);', 'const featuredProjects = projects.filter(p => p.visibility === \'public\').slice(0, 4);')
content = content.replace('Spectra\n              </span>', 'Spectra\n              </span>\n              <span className="text-sm font-bold text-zinc-500 ml-2 border-l border-zinc-300 pl-2">知识棱镜</span>')
content = content.replace('Spectra\r\n              </span>', 'Spectra\r\n              </span>\r\n              <span className="text-sm font-bold text-zinc-500 ml-2 border-l border-zinc-300 pl-2">知识棱镜</span>')

content = content.replace('我的笔记本', '我的棱镜库')
content = content.replace('精选笔记本', '精选棱镜库')
content = content.replace('创建第一个笔记本', '创建第一个棱镜库')
content = content.replace('最近打开过的笔记本', '最近打开的库')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectsPageView.tsx')
