import { describe, expect, it } from "vitest";
import { publishGraphViewSharedVersion, readGraphViewSharedVersion } from "./shared-protocol";

describe("recovered SharedArrayBuffer position protocol", () => {
  it("returns the pre-publish version and increments the slot after writing", () => {
    const slot = new Uint32Array([7]);

    expect(publishGraphViewSharedVersion(slot)).toBe(7);
    expect(slot[0]).toBe(8);
  });

  it("wraps the unsigned version exactly like the worker", () => {
    const slot = new Uint32Array([0xffffffff]);

    expect(publishGraphViewSharedVersion(slot)).toBe(0xffffffff);
    expect(slot[0]).toBe(0);
  });

  it("uses the published SAB slot instead of the pre-publish message token", () => {
    const buffer = new SharedArrayBuffer(4 * 2 + Uint32Array.BYTES_PER_ELEMENT);
    const slot = new Uint32Array(buffer, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT, 1);
    slot[0] = 12;

    expect(readGraphViewSharedVersion(buffer, -1, 11)).toBe(12);
    expect(readGraphViewSharedVersion(buffer, 12, 11)).toBeNull();
  });

  it("rejects a frame while the producer still exposes the old token", () => {
    const buffer = new SharedArrayBuffer(4 * 2 + Uint32Array.BYTES_PER_ELEMENT);
    const slot = new Uint32Array(buffer, buffer.byteLength - Uint32Array.BYTES_PER_ELEMENT, 1);
    slot[0] = 4;

    expect(readGraphViewSharedVersion(buffer, -1, 4)).toBeNull();
  });
});
