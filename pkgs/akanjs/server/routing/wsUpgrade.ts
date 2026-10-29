//? RFC 9110 §15.5.22: a request that never asked to upgrade is the caller's error, and the 426 names what to ask for.
export class WsUpgrade {
  static isRequested(req: Request) {
    return req.headers.get("upgrade")?.toLowerCase() === "websocket";
  }

  static required() {
    return new Response("Upgrade Required", { status: 426, headers: { Upgrade: "websocket", Connection: "Upgrade" } });
  }
}
