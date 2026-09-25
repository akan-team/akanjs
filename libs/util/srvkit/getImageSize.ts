type SharpFactory = typeof import("sharp");

let sharpLoad: Promise<SharpFactory> | null = null;

function loadSharp(): Promise<SharpFactory> {
  sharpLoad ??= import("sharp").then((mod) => {
    const loaded = mod as unknown as { default?: SharpFactory } & SharpFactory;
    return loaded.default ?? loaded;
  });
  return sharpLoad;
}

export const getImageSize = async (filePathOrBuffer: string | Buffer): Promise<[number, number]> => {
  try {
    const input =
      typeof filePathOrBuffer === "string" ? await Bun.file(filePathOrBuffer).arrayBuffer() : filePathOrBuffer;
    const sharp = await loadSharp();
    const { width, height } = await sharp(input).metadata();
    return [width ?? 0, height ?? 0];
  } catch {
    return [0, 0];
  }
};
