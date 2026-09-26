import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { CsrImage } from "./CsrImage";
import { Image } from "./Image";

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "imagetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "imagetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
});

const renderToText = async (node: ReactNode) => new Response(await renderToReadableStream(node)).text();

describe("Image", () => {
  test("renders a muted box and requests nothing when there is no url", async () => {
    for (const html of [
      await renderToText(<Image alt="avatar" className="size-10" />),
      await renderToText(<Image src="" alt="avatar" />),
      await renderToText(<Image alt="avatar" file={null} />),
      await renderToText(<CsrImage alt="avatar" />),
    ]) {
      expect(html).toContain('src="data:image/gif;base64,');
      expect(html).toContain("bg-muted");
      expect(html).not.toContain("empty.png");
      expect(html).not.toContain("/_akan/image");
    }
  });

  test("still routes a real url through the optimizer", async () => {
    const html = await renderToText(<Image src="/photo.png" alt="photo" width={100} />);

    expect(html).toContain("/_akan/image?url=%2Fphoto.png");
    expect(html).not.toContain("bg-muted");
  });
});
