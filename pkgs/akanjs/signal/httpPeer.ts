import type { HttpPeerResolver } from "./signalContext";

export class HttpPeer {
  static resolver: HttpPeerResolver | null = null;

  static of(req: Request): ReturnType<HttpPeerResolver> {
    return HttpPeer.resolver?.(req);
  }
}
