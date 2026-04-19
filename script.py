import re
with open('frontend/app/projects/[id]/_views/useProjectDetailController.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'function mapRunStatusLabel.*?return runStatus \|\| \"processing\";\n\}', 'function mapRunStatusLabel(runStatus?: string, runStep?: string): string {\n  if (runStatus === \"completed\" && runStep === \"completed\") return \"已完成\";\n  if (runStatus === \"processing\") {\n    if (runStep === \"outline\" || runStep === \"generate\") return \"课件生成中\";\n    if (runStep === \"preview\") return \"单页可预览\";\n  }\n  if (runStatus === \"failed\") return \"失败\";\n  return runStatus || \"processing\";\n}', content, flags=re.DOTALL)
with open('frontend/app/projects/[id]/_views/useProjectDetailController.ts', 'w', encoding='utf-8') as f:
    f.write(content)
