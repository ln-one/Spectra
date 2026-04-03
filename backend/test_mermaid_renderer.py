"""测试 Mermaid 渲染器"""

from services.mermaid_renderer import preprocess_mermaid_blocks


def test_mermaid_preprocessing():
    """测试 Mermaid 预处理"""

    markdown = """# 测试页面

这是一些文字。

```mermaid
graph TD
    A[开始] --> B[结束]
```

更多文字。

```mermaid
flowchart LR
    X --> Y --> Z
```

结束。
"""

    result = preprocess_mermaid_blocks(markdown)

    print("[Result]")
    print(result)
    print()

    # 验证
    assert "```mermaid" not in result, "Mermaid code blocks should be replaced"
    assert "<svg" in result or "mermaid-rendered" in result, "Should contain SVG or wrapper"
    print("[PASS] Mermaid blocks preprocessed")


if __name__ == "__main__":
    test_mermaid_preprocessing()
    print("\n[OK] Test passed")
