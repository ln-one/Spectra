import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const logDirectory = path.resolve("tmp/observability");
const logPath = path.join(logDirectory, "spectra-dev.log");

await mkdir(logDirectory, { recursive: true });

// Alloy persists file offsets across restarts, so truncating this file can make it
// wait at an obsolete offset and silently miss new application logs.
const logStream = createWriteStream(logPath, { flags: "a", mode: 0o600 });
const child = spawn("npm", ["run", "dev:processes"], {
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.pipe(process.stdout);
child.stdout.pipe(logStream);
child.stderr.pipe(process.stderr);
child.stderr.pipe(logStream);

let forwardingSignal = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    forwardingSignal = true;
    child.kill(signal);
  });
}

let spawnFailed = false;
child.once("error", (error) => {
  spawnFailed = true;
  console.error(`Unable to start development processes: ${error.message}`);
});

child.once("close", (code, signal) => {
  logStream.end();
  if (spawnFailed) {
    process.exitCode = 1;
    return;
  }
  if (forwardingSignal) {
    process.exitCode = 0;
    return;
  }
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
