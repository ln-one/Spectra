declare module "gifenc" {
  export interface GIFWriteFrameOptions {
    palette: number[] | Uint8Array | Uint16Array;
    delay?: number;
    repeat?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array | number[],
      width: number,
      height: number,
      options: GIFWriteFrameOptions
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8ClampedArray,
    maxColors: number,
    options?: { format?: string }
  ): Uint16Array;
  export function applyPalette(
    rgba: Uint8ClampedArray,
    palette: Uint8Array | Uint16Array | number[],
    format?: string
  ): Uint8Array;
}
