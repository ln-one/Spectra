"""测试 strip_outer_code_fence 强化版本"""

import re


def strip_outer_code_fence(content: str) -> str:
    """去掉最外层 Markdown 代码块包装（支持多层嵌套和不完整 fence）。"""
    stripped = content.strip()

    # 循环去除外层 fence，直到没有匹配
    while True:
        # 尝试匹配完整的 fence（有开头和结尾）
        fence_match = re.match(
            r"^\s*```(?:markdown|md|marp)?\s*\n(.*?)\n```\s*$",
            stripped,
            re.DOTALL | re.IGNORECASE,
        )
        if fence_match:
            stripped = fence_match.group(1).strip()
            continue

        # 尝试匹配只有开头的 fence（LLM 可能忘记结尾）
        fence_start_match = re.match(
            r"^\s*```(?:markdown|md|marp)?\s*\n(.*)$",
            stripped,
            re.DOTALL | re.IGNORECASE,
        )
        if fence_start_match:
            stripped = fence_start_match.group(1).strip()
            continue

        break

    return stripped


def test_single_fence():
    """测试单层 fence"""
    content = """```markdown
---
marp: true
---

# Slide 1
```"""
    result = strip_outer_code_fence(content)
    assert result.startswith("---")
    assert "```markdown" not in result
    print("[PASS] Single fence removed")


def test_nested_fence():
    """测试嵌套 fence"""
    content = """```markdown
```markdown
---
marp: true
---

# Slide 1
```
```"""
    result = strip_outer_code_fence(content)
    assert result.startswith("---")
    assert "```markdown" not in result
    print("[PASS] Nested fence removed")


def test_marp_fence():
    """测试 marp 类型 fence"""
    content = """```marp
---
marp: true
---

# Slide 1
```"""
    result = strip_outer_code_fence(content)
    assert result.startswith("---")
    assert "```marp" not in result
    print("[PASS] Marp fence removed")


def test_no_fence():
    """测试无 fence"""
    content = """---
marp: true
---

# Slide 1"""
    result = strip_outer_code_fence(content)
    assert result == content.strip()
    print("[PASS] No fence, unchanged")


def test_internal_fence():
    """测试内部 fence（不应被移除）"""
    content = """---
marp: true
---

# Slide 1

```python
print("hello")
```"""
    result = strip_outer_code_fence(content)
    assert "```python" in result
    print("[PASS] Internal fence preserved")


def test_incomplete_fence():
    """测试不完整 fence（只有开头）"""
    content = """```markdown
---
marp: true
---

# Slide 1"""
    result = strip_outer_code_fence(content)
    assert result.startswith("---")
    assert "```markdown" not in result
    print("[PASS] Incomplete fence removed")


if __name__ == "__main__":
    test_single_fence()
    test_nested_fence()
    test_marp_fence()
    test_no_fence()
    test_internal_fence()
    test_incomplete_fence()
    print("\n[OK] All tests passed")
