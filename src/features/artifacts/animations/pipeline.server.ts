import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { animationRenderEnvironment } from "../task-agent/render-config";
import { readTaskAgentSourceArchive } from "../task-agent/source-archive";
import { animationRevisionContentSchema, animationSourceManifestSchema } from "./contract";

type SourceFile = { body: Uint8Array; path: string };

const execFileAsync = promisify(execFile);

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function projectPath(memberPath: string) {
  if (!memberPath.startsWith("out/project/")) return null;
  const relative = memberPath.slice("out/project/".length);
  if (!relative || path.isAbsolute(relative)) return null;
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return null;
  return normalized;
}

export async function inspectAnimationSourceArchive(archive: Uint8Array) {
  const files = await readTaskAgentSourceArchive(archive, { failurePrefix: "animation" });
  const projectFiles = files.filter((file) => projectPath(file.path) !== null);
  if (projectFiles.length === 0) throw new Error("animation_project_missing");
  return { files, projectFiles };
}

async function materializeProject(
  files: readonly SourceFile[],
  directory: string,
  timeoutMs: number,
) {
  for (const file of files) {
    const relative = projectPath(file.path);
    if (!relative) continue;
    const destination = path.resolve(directory, relative);
    if (destination !== directory && !destination.startsWith(`${directory}${path.sep}`)) {
      throw new Error("animation_source_path_escape");
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.body);
  }
  if (
    !existsSync(path.join(directory, "package.json")) ||
    !existsSync(path.join(directory, "package-lock.json"))
  ) {
    throw new Error("animation_lockfile_missing");
  }
  await execFileAsync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: directory,
    env: {
      HOME: directory,
      HTTP_PROXY: process.env.HTTP_PROXY,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      NODE_ENV: "production",
      NO_PROXY: process.env.NO_PROXY,
      PATH: process.env.PATH,
    },
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
    timeout: timeoutMs,
  });
}

async function runAnimationPipelineDirect(input: {
  archive: Uint8Array;
  summary: string;
  title: string;
}) {
  const inspected = await inspectAnimationSourceArchive(input.archive);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "spectra-animation-"));
  const projectDirectory = path.join(temporaryRoot, "project");
  const outputDirectory = path.join(temporaryRoot, "output");
  const render = animationRenderEnvironment();
  const timeouts = animationPipelineTimeouts(render.timeoutMs);
  try {
    await materializeProject(inspected.projectFiles, projectDirectory, timeouts.installTimeoutMs);
    await mkdir(outputDirectory, { recursive: true });
    const entryPoint = ["src/index.ts", "src/index.tsx", "src/index.js", "src/index.jsx"]
      .map((candidate) => path.join(projectDirectory, candidate))
      .find(existsSync);
    if (!entryPoint) throw new Error("animation_entrypoint_missing");

    const [{ bundle }, { getCompositions, renderMedia }] = await Promise.all([
      import("@remotion/bundler"),
      import("@remotion/renderer"),
    ]);
    const serveUrl = await bundle({
      enableCaching: false,
      entryPoint,
      outDir: path.join(outputDirectory, "bundle"),
      webpackOverride: (configuration) => ({
        ...configuration,
        resolve: {
          ...configuration.resolve,
          modules: [
            path.join(projectDirectory, "node_modules"),
            path.join(process.cwd(), "node_modules"),
            "node_modules",
          ],
        },
      }),
    });
    const compositions = await getCompositions(serveUrl, {
      browserExecutable: render.browserExecutable ?? null,
      chromeMode: "chrome-for-testing",
      inputProps: {},
    });
    const composition = compositions[0];
    if (!composition) throw new Error("animation_composition_missing");
    if (compositions.length > 1) throw new Error("animation_composition_ambiguous");

    const mp4Path = path.join(outputDirectory, "animation.mp4");
    await renderMedia({
      browserExecutable: render.browserExecutable ?? null,
      chromeMode: "chrome-for-testing",
      codec: "h264",
      composition,
      concurrency: render.concurrency,
      outputLocation: mp4Path,
      serveUrl,
      timeoutInMilliseconds: render.timeoutMs,
    });
    const mp4 = new Uint8Array(await readFile(mp4Path));
    return {
      content: animationRevisionContentSchema.parse({
        compositionId: composition.id,
        durationInFrames: composition.durationInFrames,
        fps: composition.fps,
        height: composition.height,
        schemaVersion: 1,
        summary: input.summary.trim().slice(0, 4_000),
        title: input.title.trim().slice(0, 200),
        width: composition.width,
      }),
      mp4,
      mp4Sha256: sha256(mp4),
      sourceArchive: input.archive,
      sourceArchiveSha256: sha256(input.archive),
      sourceManifest: animationSourceManifestSchema.parse({
        files: inspected.projectFiles.map((file) => ({
          path: file.path,
          sha256: sha256(file.body),
          sizeBytes: file.body.byteLength,
        })),
        schemaVersion: 1,
      }),
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

type AnimationPipelineResult = Awaited<ReturnType<typeof runAnimationPipelineDirect>>;

export function animationPipelineTimeouts(renderTimeoutMs: number) {
  return {
    childTimeoutMs: renderTimeoutMs * 2 + 60_000,
    installTimeoutMs: renderTimeoutMs,
  };
}

function requiresChild() {
  return process.execArgv.some((argument) => argument.includes("react-server"));
}

function animationChildCommand(
  temporaryRoot: string,
  requestPath: string,
  sandboxExecutable: string | undefined,
) {
  const child = [
    process.execPath,
    "--import",
    "tsx",
    path.join(process.cwd(), "scripts/animation-runtime-child.ts"),
    requestPath,
  ];
  if (!sandboxExecutable) return { args: child.slice(1), executable: child[0] as string };
  return {
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-net",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--ro-bind",
      "/",
      "/",
      "--bind",
      temporaryRoot,
      temporaryRoot,
      "--dev",
      "/dev",
      "--",
      ...child,
    ],
    executable: sandboxExecutable,
  };
}

function childOutputPath(temporaryRoot: string, value: string, extension: string) {
  const resolved = path.resolve(value);
  if (
    !resolved.endsWith(extension) ||
    (resolved !== temporaryRoot && !resolved.startsWith(`${temporaryRoot}${path.sep}`))
  ) {
    throw new Error("animation_child_output_path_invalid");
  }
  return resolved;
}

export async function runAnimationPipeline(input: {
  archive: Uint8Array;
  summary: string;
  title: string;
}): Promise<AnimationPipelineResult> {
  if (!requiresChild()) return runAnimationPipelineDirect(input);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "spectra-animation-child-"));
  const requestPath = path.join(temporaryRoot, "request.json");
  const archivePath = path.join(temporaryRoot, "source.tar.gz");
  const responsePath = path.join(temporaryRoot, "response.json");
  try {
    await Promise.all([
      writeFile(archivePath, input.archive),
      writeFile(
        requestPath,
        JSON.stringify({
          archivePath,
          outputDirectory: temporaryRoot,
          responsePath,
          summary: input.summary,
          title: input.title,
        }),
      ),
    ]);
    const render = animationRenderEnvironment();
    const command = animationChildCommand(temporaryRoot, requestPath, render.sandboxExecutable);
    const timeouts = animationPipelineTimeouts(render.timeoutMs);
    await execFileAsync(command.executable, command.args, {
      cwd: process.cwd(),
      env: {
        ANIMATION_RENDER_CONCURRENCY: String(render.concurrency),
        ANIMATION_RENDER_TIMEOUT_MS: String(render.timeoutMs),
        HOME: temporaryRoot,
        HTTP_PROXY: process.env.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        NODE_ENV: "production",
        NO_PROXY: process.env.NO_PROXY,
        PATH: process.env.PATH,
        REMOTION_BROWSER_EXECUTABLE: render.browserExecutable,
        TMPDIR: temporaryRoot,
      },
      killSignal: "SIGKILL",
      maxBuffer: 4 * 1024 * 1024,
      timeout: timeouts.childTimeoutMs,
    });
    const response = z
      .object({
        content: animationRevisionContentSchema,
        mp4Path: z.string(),
        mp4Sha256: z.string().regex(/^[0-9a-f]{64}$/),
        sourceArchivePath: z.string(),
        sourceManifest: animationSourceManifestSchema,
      })
      .strict()
      .parse(JSON.parse(await readFile(responsePath, "utf8")));
    const [mp4, sourceArchive] = await Promise.all([
      readFile(childOutputPath(temporaryRoot, response.mp4Path, ".mp4")),
      readFile(childOutputPath(temporaryRoot, response.sourceArchivePath, ".tar.gz")),
    ]);
    if (sha256(mp4) !== response.mp4Sha256) {
      throw new Error("animation_child_output_hash_conflict");
    }
    return {
      content: response.content,
      mp4: new Uint8Array(mp4),
      mp4Sha256: response.mp4Sha256,
      sourceArchive: new Uint8Array(sourceArchive),
      sourceArchiveSha256: sha256(sourceArchive),
      sourceManifest: response.sourceManifest,
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

export async function executeAnimationPipelineChild(requestPath: string) {
  const request = z
    .object({
      archivePath: z.string(),
      outputDirectory: z.string(),
      responsePath: z.string(),
      summary: z.string(),
      title: z.string(),
    })
    .strict()
    .parse(JSON.parse(await readFile(requestPath, "utf8")));
  const result = await runAnimationPipelineDirect({
    archive: new Uint8Array(await readFile(request.archivePath)),
    summary: request.summary,
    title: request.title,
  });
  const outputId = randomUUID();
  const mp4Path = path.join(request.outputDirectory, `${outputId}.mp4`);
  const sourceArchivePath = path.join(request.outputDirectory, `${outputId}-source.tar.gz`);
  await Promise.all([
    writeFile(mp4Path, result.mp4),
    writeFile(sourceArchivePath, result.sourceArchive),
  ]);
  await writeFile(
    request.responsePath,
    JSON.stringify({
      content: result.content,
      mp4Path,
      mp4Sha256: result.mp4Sha256,
      sourceArchivePath,
      sourceManifest: result.sourceManifest,
    }),
  );
}
