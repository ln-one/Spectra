import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const codeFile = /\.[cm]?[jt]sx?$/;
const biomeFile = /\.(?:[cm]?[jt]sx?|jsonc?|css)$/;
const databaseFile = /^(?:drizzle\/|drizzle[.]config[.]ts$|src\/database\/schema[.]ts$)/;
const typecheckFile =
  /^(?:package(?:-lock)?[.]json$|next[.]config[.]|tsconfig[.]|vitest[.]config[.]|src\/|tests\/|scripts\/)/;

function gitLines(args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

export function changedFiles() {
  return [
    ...new Set([
      ...gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
      ...gitLines(["ls-files", "--others", "--exclude-standard"]),
    ]),
  ].sort();
}

export function changedVerificationPlan(files: readonly string[]) {
  const existing = files.filter(existsSync);
  return {
    architecture: files.some(
      (file) =>
        file === ".dependency-cruiser.cjs" ||
        file === "package.json" ||
        file === "package-lock.json" ||
        file === "tsconfig.json" ||
        (file.startsWith("src/") && codeFile.test(file)),
    ),
    biomeFiles: existing.filter(
      (file) => biomeFile.test(file) || file === ".dependency-cruiser.cjs",
    ),
    database: files.some((file) => databaseFile.test(file)),
    testRelatedFiles: existing.filter(
      (file) =>
        codeFile.test(file) ||
        file.endsWith(".json") ||
        file === "vitest.config.ts" ||
        file === "vitest.setup.ts",
    ),
    typecheck: files.some((file) => typecheckFile.test(file)),
  };
}

function run(command: string, args: string[]) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const files = changedFiles();
  if (files.length === 0) {
    console.log("No changed files to verify.");
    return;
  }

  const plan = changedVerificationPlan(files);
  console.log(`Verifying ${files.length} changed file${files.length === 1 ? "" : "s"}.`);

  if (plan.typecheck) run("npm", ["run", "typecheck"]);
  if (plan.biomeFiles.length > 0) {
    run("npx", ["biome", "check", "--no-errors-on-unmatched", ...plan.biomeFiles]);
  }
  if (plan.architecture) run("npm", ["run", "check:architecture"]);
  if (plan.testRelatedFiles.length > 0) {
    run("npx", ["vitest", "related", "--run", "--passWithNoTests", ...plan.testRelatedFiles]);
  }
  if (plan.database) run("npm", ["run", "db:check"]);

  console.log("\nChanged-file verification passed. Run `npm run verify` before committing.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
