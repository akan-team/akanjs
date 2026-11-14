import type { ClientManifest } from "./artifact";
import type { RscRenderRequest } from "./rscRenderControl";

export class RscRenderManifest {
  #held: { revision: number; manifest: ClientManifest } | null = null;

  //? Null for a revision this process was not sent: rendered against another, the page names chunks it never loads.
  admit<T extends RscRenderRequest>(msg: T): T | null {
    if (msg.manifestRevision === undefined) return msg;
    if (msg.clientManifest) this.#held = { revision: msg.manifestRevision, manifest: msg.clientManifest };
    if (this.#held?.revision !== msg.manifestRevision) return null;
    return { ...msg, clientManifest: this.#held.manifest };
  }
}
