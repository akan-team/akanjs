async function readImageBuffer(source: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(source)) return source;
  if (source.startsWith("file://")) return Buffer.from(await Bun.file(source.replace("file://", "")).arrayBuffer());
  if (source.startsWith("/") && !source.startsWith("/api/") && (await Bun.file(source).exists())) {
    return Buffer.from(await Bun.file(source).arrayBuffer());
  }
  if (!source.includes("://") && !source.startsWith("/") && (await Bun.file(source).exists())) {
    return Buffer.from(await Bun.file(source).arrayBuffer());
  }
  const response = await fetch(encodeURI(source), { signal: AbortSignal.timeout(15_000) });
  return Buffer.from(await response.arrayBuffer());
}

export const getImageAbstract = async (
  source: string | Buffer,
): Promise<{ abstractData?: string; imageSize?: [number, number] }> => {
  const abstract: { abstractData?: string; imageSize?: [number, number] } = {};
  try {
    const image = new Bun.Image(await readImageBuffer(source));

    try {
      const { width, height } = await image.metadata();
      if (width && height) abstract.imageSize = [width, height];
    } catch (_) {}

    try {
      abstract.abstractData = await image.placeholder();
    } catch (_) {}
  } catch (_) {}
  return abstract;
};
