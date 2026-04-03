import asyncio 
from services.mermaid_renderer import render_mermaid_to_svg 
code = \"graph LR\n    A[Start] --^> B[End]\" 
svg = asyncio.run(render_mermaid_to_svg(code)) 
print('HAS_SVG', bool(svg)) 
print((svg or '')[:120]) 
