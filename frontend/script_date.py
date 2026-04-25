import os
import re

file_path = 'f:/Code/pycharm/Spectra/frontend/app/projects/_views/project-types.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix formatDate to handle invalid dates
old_format_date = '''export function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();'''
new_format_date = '''export function formatDate(dateString: string) {
  if (!dateString) return "未知时间";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "未知时间";
  const now = new Date();'''

content = content.replace(old_format_date, new_format_date)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done project-types.ts')
