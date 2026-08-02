import * as nextEnv from "@next/env";
import {
  analyzeMedia,
  createMediaUnderstandingClient,
  type MediaInput,
  MediaUnderstandingError,
} from "@/features/sources/ingestion/media-understanding";

nextEnv.loadEnvConfig(process.cwd());

const samples = {
  image: {
    kind: "image",
    url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241022/emyrja/dog_and_girl.jpeg",
  },
  audio: {
    kind: "audio",
    url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250211/tixcef/cherry.wav",
    format: "wav",
  },
  video: {
    kind: "video",
    url: "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241115/cqqkru/1.mp4",
  },
} satisfies Record<string, MediaInput>;

async function runSample(name: string, input: MediaInput) {
  const startedAt = performance.now();
  const result = await analyzeMedia(input, { client });
  if (!result.summary || (input.kind !== "image" && result.segments.length === 0)) {
    throw new MediaUnderstandingError("media_result_invalid");
  }
  console.log(
    JSON.stringify({
      name,
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      segments: result.segments.length,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    }),
  );
}

const client = createMediaUnderstandingClient();

async function main() {
  const initialRss = process.memoryUsage().rss;
  await runSample("image", samples.image);
  await runSample("audio", samples.audio);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await runSample(`video-${attempt}`, samples.video);
  }

  const controller = new AbortController();
  const cancellation = analyzeMedia(samples.video, { client, signal: controller.signal });
  setTimeout(() => controller.abort(), 25);
  try {
    await cancellation;
    throw new Error("Media cancellation unexpectedly completed");
  } catch (error) {
    if (!(error instanceof MediaUnderstandingError) || error.code !== "media_aborted") throw error;
  }

  const rssDeltaMiB = Math.round((process.memoryUsage().rss - initialRss) / 1024 / 1024);
  if (rssDeltaMiB > 128) throw new Error("Media live smoke exceeded its memory budget");
  console.log(JSON.stringify({ cancellation: "passed", rssDeltaMiB }));
}

void main().catch((error: unknown) => {
  const code = error instanceof MediaUnderstandingError ? error.code : "media_live_smoke_failed";
  console.error(`Media understanding live smoke failed: ${code}`);
  process.exitCode = 1;
});
