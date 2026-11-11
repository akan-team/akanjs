// styleguard-disable inline-color — the standalone status page renders before any theme CSS exists.
import { applySecurityHeaders } from "../assetHeaders";

export class GatewayStatusPage {
  static headers(contentType: string): Headers {
    const headers = new Headers({ "content-type": contentType, "cache-control": "no-store" });
    return applySecurityHeaders(headers, { html: contentType.startsWith("text/html") });
  }

  static html({ heading, detail, note }: { heading: string; detail: string; note: string }) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${GatewayStatusPage.#escapeHtml(heading)}</title>
<style>
  body { margin: 0; padding: 48px 24px; background: #111827; color: #e5e7eb; font-family: ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; color: #f87171; }
  pre { padding: 16px; border-radius: 8px; background: #1f2937; color: #fca5a5; white-space: pre-wrap; word-break: break-word; }
  p { color: #9ca3af; font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>${GatewayStatusPage.#escapeHtml(heading)}</h1>
<pre>${GatewayStatusPage.#escapeHtml(detail)}</pre>
<p>${GatewayStatusPage.#escapeHtml(note)}</p>
</main>
<script>
  const poll = async () => {
    try {
      const res = await fetch(location.href, { cache: "no-store" });
      if (res.ok) { location.reload(); return; }
    } catch {}
    setTimeout(poll, 1000);
  };
  setTimeout(poll, 1000);
</script>
</body>
</html>`;
  }

  static #escapeHtml(text: string) {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (ch) => replacements[ch] ?? ch);
  }
}
