import { expect, test } from "vitest";
import { parseAnimationByteRange } from "@/features/artifacts/animations/service";
import { animationMediaResponse } from "./media";

const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

test("serves complete animation media with byte range support advertised", async () => {
  const response = animationMediaResponse({
    body,
    contentType: "video/mp4",
    sizeBytes: body.byteLength,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(response.headers.get("content-length")).toBe("10");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
});

test("serves explicit and suffix ranges with correct Content-Range", async () => {
  const explicitRange = parseAnimationByteRange("bytes=2-5", body.byteLength);
  if (!explicitRange) throw new Error("explicit_range_missing");
  const explicit = animationMediaResponse({
    body: body.slice(explicitRange.start, explicitRange.end + 1),
    contentType: "video/mp4",
    range: explicitRange,
    sizeBytes: body.byteLength,
  });
  expect(explicit.status).toBe(206);
  expect(explicit.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(new Uint8Array(await explicit.arrayBuffer())).toEqual(new Uint8Array([2, 3, 4, 5]));

  const suffixRange = parseAnimationByteRange("bytes=-3", body.byteLength);
  if (!suffixRange) throw new Error("suffix_range_missing");
  const suffix = animationMediaResponse({
    body: body.slice(suffixRange.start, suffixRange.end + 1),
    contentType: "video/mp4",
    range: suffixRange,
    sizeBytes: body.byteLength,
  });
  expect(suffix.status).toBe(206);
  expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10");
  expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
});

test("rejects invalid and unsatisfiable ranges", () => {
  expect(parseAnimationByteRange("bytes=10-12", body.byteLength)).toBeNull();
  expect(parseAnimationByteRange("bytes=-0", body.byteLength)).toBeNull();
  expect(parseAnimationByteRange("bytes=1-2,4-5", body.byteLength)).toBeNull();
});

test("caps each storage read to eight MiB", () => {
  expect(parseAnimationByteRange("bytes=0-", 500 * 1024 * 1024)).toEqual({
    end: 8 * 1024 * 1024 - 1,
    start: 0,
  });
});
