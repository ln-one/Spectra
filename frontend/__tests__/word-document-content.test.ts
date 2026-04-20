import {
  documentToMarkdown,
  markdownToDoc,
} from "@/components/project/features/studio/tools/word/documentContent";

describe("word document content helpers", () => {
  it("parses standard markdown into heading/list/paragraph nodes", () => {
    const doc = markdownToDoc(
      "# 课程标题\n\n## 教学目标\n\n- 目标一\n- 目标二\n\n正文段落"
    );
    const content = Array.isArray(doc.content) ? doc.content : [];
    expect(content.some((item) => item.type === "heading")).toBe(true);
    expect(content.some((item) => item.type === "bulletList")).toBe(true);
    expect(content.some((item) => item.type === "paragraph")).toBe(true);
  });

  it("keeps compact markdown headings recognizable without double-blank splits", () => {
    const doc = markdownToDoc("# 一级标题\n## 二级标题\n正文内容");
    const content = Array.isArray(doc.content) ? doc.content : [];
    const headingCount = content.filter((item) => item.type === "heading").length;
    expect(headingCount).toBe(2);
  });

  it("round-trips mixed zh/en lists and paragraphs", () => {
    const markdown = "# Network Basics\n\n1. OSI 模型\n2. TCP/IP\n\n课程目标：掌握分层思想。";
    const doc = markdownToDoc(markdown);
    const rebuilt = documentToMarkdown(doc);
    expect(rebuilt).toContain("# Network Basics");
    expect(rebuilt).toContain("1. OSI 模型");
    expect(rebuilt).toContain("2. TCP/IP");
    expect(rebuilt).toContain("课程目标：掌握分层思想。");
  });
});
