import type { RepresentationAdapter } from "../contracts";
import { parseMineruRepresentation } from "../mineru-kernel";

export const mineruContentRepresentationAdapter: RepresentationAdapter = {
  parse: ({ bytes, format }) => parseMineruRepresentation(bytes, format),
};
