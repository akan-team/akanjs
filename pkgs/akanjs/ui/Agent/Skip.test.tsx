import { describe, expect, test } from "bun:test";
import { renderToReadableStream } from "react-dom/server";
import { Skip } from "./Skip";

describe("Agent.Skip", () => {
  test("marks the region with the label readScreen prints, and renders on the server", async () => {
    const html = await new Response(
      await renderToReadableStream(
        <Skip className="mt-4" label="site footer">
          <p>terms body</p>
        </Skip>,
      ),
    ).text();
    expect(html).toContain('data-agent-skip="site footer"');
    expect(html).toContain("<p>terms body</p>");
    expect(html).toContain('class="mt-4"');
  });
});
