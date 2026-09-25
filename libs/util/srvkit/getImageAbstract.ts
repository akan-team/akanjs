type SharpFactory = typeof import("sharp");

let sharpLoad: Promise<SharpFactory> | null = null;

function loadSharp(): Promise<SharpFactory> {
  sharpLoad ??= import("sharp").then((mod) => {
    const loaded = mod as unknown as { default?: SharpFactory } & SharpFactory;
    return loaded.default ?? loaded;
  });
  return sharpLoad;
}

export const getImageAbstract = async (
  url: string,
): Promise<{ abstractData?: string; imageSize?: [number, number] }> => {
  const abstract: { abstractData?: string; imageSize?: [number, number] } = {};
  try {
    const response = await fetch(encodeURI(url));
    const buffer = Buffer.from(await response.arrayBuffer());
    const sharp = await loadSharp();
    const image = sharp(buffer);

    try {
      const { width, height } = await image.metadata();
      if (width && height) abstract.imageSize = [width, height];
    } catch (_) {}

    try {
      const { data, info } = await image
        .resize(10, 10, { fit: "inside" })
        .blur(1)
        .toBuffer({ resolveWithObject: true });
      abstract.abstractData = `data:image/${info.format};base64,${data.toString("base64")}`;
    } catch (_) {}
  } catch (_) {}
  return abstract;
};
