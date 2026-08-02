function splitPipeLine(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      cell += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : null;
}

function isDelimiterRow(cells: readonly string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function openingFence(line: string) {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match?.[1]) return null;
  if (match[1][0] === "`" && match[2]?.includes("`")) return null;
  return { character: match[1][0] ?? "`", length: match[1].length };
}

function closesFence(line: string, fence: { character: string; length: number }) {
  const trimmed = line.trim();
  return (
    trimmed.length >= fence.length &&
    [...trimmed].every((character) => character === fence.character)
  );
}

function isImplicitTableLine(line: string) {
  if (/^\s*(?:>|[-+*]\s|\d+[.)]\s)/.test(line)) return null;
  return splitPipeLine(line);
}

export function normalizeImplicitMarkdownTables(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let fence: { character: string; length: number } | null = null;
  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    if (fence) {
      output.push(line);
      if (closesFence(line, fence)) fence = null;
      index += 1;
      continue;
    }
    const openedFence = openingFence(line);
    if (openedFence) {
      fence = openedFence;
      output.push(line);
      index += 1;
      continue;
    }
    const run: string[] = [];
    const rows: string[][] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const candidate = lines[cursor] ?? "";
      const cells = candidate.trim() ? isImplicitTableLine(candidate) : null;
      if (!cells) break;
      run.push(candidate);
      rows.push(cells);
      cursor += 1;
    }
    const width = rows[0]?.length ?? 0;
    const isTableRun = rows.length >= 2 && width >= 2 && rows.every((row) => row.length === width);
    if (isTableRun && isDelimiterRow(rows[1] ?? [])) {
      output.push(...run);
      index = cursor;
      continue;
    }
    if (!isTableRun) {
      output.push(line);
      index += 1;
      continue;
    }
    output.push(run[0] ?? line, `| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
    output.push(...run.slice(1));
    index = cursor;
  }
  return output.join("\n");
}
