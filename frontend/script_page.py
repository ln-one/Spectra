import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectsPageView.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_statement = 'import { SpectraLogo } from "@/components/icons/SpectraLogo";\n'
if 'SpectraLogo' not in content:
    content = content.replace('import { useProjectsPageState } from "./useProjectsPageState";', 'import { useProjectsPageState } from "./useProjectsPageState";\n' + import_statement)

# Replace the icon
old_icon = '''              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-white" />
              </div>'''
new_icon = '''              <SpectraLogo className="w-10 h-10" />'''
content = content.replace(old_icon, new_icon)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done ProjectsPageView.tsx')
