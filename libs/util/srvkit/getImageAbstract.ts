import { UntrustedFetch } from "./untrustedFetch";

const imageMaxBytes = 50 * 1024 * 1024;

const readImageBuffer = async (source: string | Buffer): Promise<Buffer> => {
  if (Buffer.isBuffer(source)) return source;
  if (source.startsWith("file://")) return Buffer.from(await Bun.file(source.replace("file://", "")).arrayBuffer());
  if (source.startsWith("/") && !source.startsWith("/api/") && (await Bun.file(source).exists())) {
    return Buffer.from(await Bun.file(source).arrayBuffer());
  }
  if (!source.includes("://") && !source.startsWith("/") && (await Bun.file(source).exists())) {
    return Buffer.from(await Bun.file(source).arrayBuffer());
  }
  const { body } = await UntrustedFetch.fetch(source, { timeout: 15_000, deadline: 15_000, maxBytes: imageMaxBytes });
  return Buffer.from(await new Response(body).arrayBuffer());
};

//? Best effort: an unreadable or undecodable image yields whatever part could be read instead of an error.
export const getImageAbstract = async (
  source: string | Buffer,
): Promise<{ abstractData?: string; imageSize?: [number, number] }> => {
  const image = await readImageBuffer(source)
    .then((buffer) => new Bun.Image(buffer))
    .catch(() => null);
  if (!image) return {};
  const metadata = await image.metadata().catch(() => null);
  const abstractData = await image.placeholder().catch(() => undefined);
  return {
    ...(metadata?.width && metadata.height ? { imageSize: [metadata.width, metadata.height] as [number, number] } : {}),
    ...(abstractData ? { abstractData } : {}),
  };
};
