import { describe, expect, test } from "bun:test";
import type { ClientManifest } from "./artifact";
import { RscRenderManifest } from "./rscRenderManifest";

const manifestOf = (id: string): ClientManifest => ({ "ui/Widget.tsx#Widget": { id, chunks: [], name: "Widget" } });
const render = (fields: { manifestRevision?: number; clientManifest?: ClientManifest }) => ({
  requestId: "r",
  url: "http://localhost/",
  ...fields,
});

describe("RscRenderManifest", () => {
  test("renders a revision it was sent with that revision's manifest, from the message that brought it on", () => {
    const manifests = new RscRenderManifest();
    const first = manifestOf("/a.js");

    expect(manifests.admit(render({ manifestRevision: 1, clientManifest: first }))?.clientManifest).toBe(first);
    expect(manifests.admit(render({ manifestRevision: 1 }))?.clientManifest).toBe(first);
  });

  test("keeps the manifest a render was admitted with when a later render brings the next revision", () => {
    const manifests = new RscRenderManifest();
    const first = manifestOf("/a.js");
    const second = manifestOf("/b.js");
    manifests.admit(render({ manifestRevision: 1, clientManifest: first }));
    const earlier = manifests.admit(render({ manifestRevision: 1 }));

    expect(manifests.admit(render({ manifestRevision: 2, clientManifest: second }))?.clientManifest).toBe(second);
    expect(manifests.admit(render({ manifestRevision: 2 }))?.clientManifest).toBe(second);
    expect(earlier?.clientManifest).toBe(first);
  });

  test("refuses a revision it was not sent: one a new process never received, and one a later revision replaced", () => {
    const fresh = new RscRenderManifest();
    expect(fresh.admit(render({ manifestRevision: 1 }))).toBeNull();

    const manifests = new RscRenderManifest();
    manifests.admit(render({ manifestRevision: 1, clientManifest: manifestOf("/a.js") }));
    manifests.admit(render({ manifestRevision: 2, clientManifest: manifestOf("/b.js") }));
    expect(manifests.admit(render({ manifestRevision: 1 }))).toBeNull();
    expect(manifests.admit(render({ manifestRevision: 3 }))).toBeNull();
  });

  test("leaves a render that names no revision as it came", () => {
    const manifests = new RscRenderManifest();
    manifests.admit(render({ manifestRevision: 1, clientManifest: manifestOf("/a.js") }));
    const own = render({ clientManifest: manifestOf("/own.js") });
    const bare = render({});

    expect(manifests.admit(own)).toBe(own);
    expect(manifests.admit(bare)).toBe(bare);
    expect(manifests.admit(render({ manifestRevision: 1 }))?.clientManifest).toEqual(manifestOf("/a.js"));
  });
});
