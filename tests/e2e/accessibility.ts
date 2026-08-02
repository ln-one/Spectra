import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectNoSeriousAccessibilityViolations(page: Page) {
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  const seriousViolations = violations
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .map(({ help, id, nodes }) => ({
      help,
      id,
      nodes: nodes.map((node) => ({
        failureSummary: node.failureSummary,
        html: node.html,
        target: node.target,
      })),
    }));

  expect(seriousViolations).toEqual([]);
}
