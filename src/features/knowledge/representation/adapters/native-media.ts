import type { RepresentationAdapter } from "../contracts";
import { parseNativeOrMediaRepresentation } from "../native-media-kernel";

export const nativeAndMediaRepresentationAdapter: RepresentationAdapter = {
  parse: ({ bytes }) => parseNativeOrMediaRepresentation(bytes),
};
