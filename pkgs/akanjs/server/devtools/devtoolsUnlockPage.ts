interface UnlockPageProps {
  action: string;
  next: string;
  minutes: number;
  failed: boolean;
}

export class DevtoolsUnlockPage {
  static readonly #headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };

  //? The secret goes in a POST body, never a query string, so no access log or browser history records it.
  static render({ action, next, minutes, failed }: UnlockPageProps): Response {
    const notice = failed
      ? "That secret does not match AKAN_LOG_DEBUG_HEADER."
      : "Outside a local runtime, devtools opens to the AKAN_LOG_DEBUG_HEADER secret.";
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unlock devtools</title></head>
<body>
<main>
<h1>Unlock devtools</h1>
<p>${notice} This browser stays unlocked for ${minutes} minutes over HTTPS or localhost.</p>
<form method="post" action="${Bun.escapeHTML(action)}">
<input type="hidden" name="next" value="${Bun.escapeHTML(next)}">
<label>Secret <input type="password" name="secret" autocomplete="off" required autofocus></label>
<button type="submit">Unlock</button>
</form>
</main>
</body>
</html>`;
    return new Response(html, { status: 401, headers: DevtoolsUnlockPage.#headers });
  }
}
