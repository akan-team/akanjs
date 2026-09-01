/**
 * `Bun.Image.metadata()` reports only `{ width, height, format }` — there is no frame count — and an
 * animated GIF decodes to its first frame without erroring. So an optimizer that re-encodes whatever
 * decodes would silently drop the animation. These readers answer the question from the container bytes
 * instead, so an animated source can be passed through untouched.
 */

/** Sub-blocks are a `[length][bytes]…[0]` chain, so a frame's payload cannot be skipped by size alone. */
const skipGifSubBlocks = (buffer: Buffer, start: number): number => {
  let offset = start;
  while (offset < buffer.length) {
    const size = buffer[offset];
    offset += 1;
    if (size === undefined || size === 0) return offset;
    offset += size;
  }
  return offset;
};

const colorTableSize = (packed: number): number => ((packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1));

/**
 * Walks the GIF block stream to count image descriptors. Counting raw `0x2C` bytes would overcount —
 * the byte occurs freely inside colour tables and LZW payloads — so every block has to be stepped over.
 */
const hasMultipleGifFrames = (buffer: Buffer): boolean => {
  if (buffer.length < 13) return false;
  let offset = 6;
  offset += 7 + colorTableSize(buffer[offset + 4] ?? 0);
  let frames = 0;
  while (offset < buffer.length) {
    const block = buffer[offset];
    offset += 1;
    if (block === 0x3b) break;
    if (block === 0x21) {
      offset = skipGifSubBlocks(buffer, offset + 1);
      continue;
    }
    if (block !== 0x2c) break;
    frames += 1;
    if (frames > 1) return true;
    offset += 9 + colorTableSize(buffer[offset + 8] ?? 0);
    offset = skipGifSubBlocks(buffer, offset + 1);
  }
  return frames > 1;
};

/** An animated WebP is an extended (`VP8X`) file carrying an `ANIM` chunk; a still one never has it. */
const hasWebpAnimChunk = (buffer: Buffer): boolean => {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    if (id === "ANIM") return true;
    const size = buffer.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  return false;
};

/** APNG marks itself with an `acTL` chunk, which the spec requires before the first `IDAT`. */
const hasPngAnimationControl = (buffer: Buffer): boolean => {
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const id = buffer.toString("ascii", offset + 4, offset + 8);
    if (id === "acTL") return true;
    if (id === "IDAT" || id === "IEND") return false;
    offset += 12 + size;
  }
  return false;
};

export const isAnimatedImage = (buffer: Buffer, contentType: string): boolean => {
  try {
    if (contentType === "image/gif") return hasMultipleGifFrames(buffer);
    if (contentType === "image/webp") return hasWebpAnimChunk(buffer);
    if (contentType === "image/png") return hasPngAnimationControl(buffer);
    return false;
  } catch {
    // A malformed container is not something to answer confidently — treat it as animated so the
    // optimizer passes the original through instead of re-encoding a file it failed to read.
    return true;
  }
};
