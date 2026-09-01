/**
 * 레퍼런스로 보낼 그림 한 장이 넘지 말아야 할 크기. 바이트댄스 Ark 는 data URL 한 장이 256KB 를
 * 넘으면 요청을 거절한다 — 이 프로젝트에서 seedream·gpt-image 로 보낸 레퍼런스가 전부(0.46~1.15MB)
 * 그 선을 넘어 5건 중 5건이 실패했다. 같은 그림으로 gemini 는 112건 성공했으므로 그림이 아니라
 * 크기가 문제였다. 여유를 두어 200KB 로 잡는다.
 */
const REF_MAX_BYTES = 200 * 1024;
/** 레퍼런스는 "무엇을 닮게 할지" 를 알려주는 용도라 원본 해상도가 필요 없다. */
const REF_MAX_EDGE = 1024;
const REF_MIN_QUALITY = 50;

interface ShrunkImage {
  base64: string;
  mimetype: string;
}
/**
 * 레퍼런스 그림을 보내기 좋은 크기로 줄인다. 이미 작으면 그대로 둔다.
 *
 * 긴 변을 먼저 줄이고, 그래도 크면 jpeg 품질을 낮춰 가며 한계 안으로 넣는다. 줄이다 실패하면
 * (형식을 못 읽는 등) 원본을 그대로 돌려준다 — 레퍼런스가 없는 것보다는 큰 채로라도 보내는 편이 낫다.
 */
export const shrinkRefImage = async (buffer: Buffer, mimetype: string): Promise<ShrunkImage> => {
  const original = { base64: buffer.toString("base64"), mimetype };
  if (buffer.byteLength <= REF_MAX_BYTES) return original;
  try {
    const resized = new Bun.Image(buffer, { autoOrient: true }).resize(REF_MAX_EDGE, REF_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    });
    for (const quality of [82, 70, 60, REF_MIN_QUALITY]) {
      const out = await resized.jpeg({ quality }).buffer();
      if (out.byteLength <= REF_MAX_BYTES || quality === REF_MIN_QUALITY)
        return { base64: out.toString("base64"), mimetype: "image/jpeg" };
    }
    return original;
  } catch {
    return original;
  }
};
