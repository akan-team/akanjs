// File name extension → MIME type, for FileRefs made by plugins (filesystem, window drops, …).
// The table is contract.json's (the hosts serve assets with the same one).

import { fileMime } from "./kernel.ts";

/** MIME type from the file name's extension; application/octet-stream when unknown. */
export function mimeFor(name: string): string {
  return fileMime(name);
}
