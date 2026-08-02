import { describe, expect, test } from "vitest";
import { quizMarkdownToSafeHtml } from "./quiz-markdown";

describe("Quiz Markdown HTML", () => {
  test("renders GFM and inline and block math with KaTeX", () => {
    const html = quizMarkdownToSafeHtml(
      String.raw`Use $P(c\mid x)$.

$$
P(c\mid x)=\frac{P(c)P(x\mid c)}{P(x)}
$$

| term | meaning |
| --- | --- |
| prior | P(c) |`,
    );

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain("<table>");
  });

  test("drops raw HTML and unsafe event handlers", () => {
    const html = quizMarkdownToSafeHtml(
      '<script>alert("x")</script>\n\n<img src="x" onerror="alert(1)">\n\n**safe**',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<strong>safe</strong>");
  });

  test("keeps malformed math visible instead of producing an empty option", () => {
    const html = quizMarkdownToSafeHtml(String.raw`Broken $\frac{$`);

    expect(html).toContain("katex-error");
    expect(html).toContain("frac");
    expect(html).not.toBe("");
  });
});
