import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/ProjectItems.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'<div className="flex items-start justify-between mb-auto">\s*<DropdownMenu>',
    '<div className="flex items-start justify-end mb-auto">\n        <DropdownMenu>',
    content
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done align right')
