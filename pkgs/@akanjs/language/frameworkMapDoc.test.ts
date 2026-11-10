import { describe, expect, it } from "bun:test";
import type { FrameworkMap } from "akanjs/common/frameworkMap.ts";
import { FrameworkMapDoc } from "./frameworkMapDoc";

const at = (file: string) => ({ file, line: 1, column: 1 });
const map: FrameworkMap = {
  version: 1,
  packages: [{ name: "akanjs", root: "pkgs/akanjs" }],
  facets: [
    { id: "akanjs/base", name: "base", packageName: "akanjs", layer: 0, files: 1, classes: [] },
    {
      id: "akanjs/server",
      name: "server",
      packageName: "akanjs",
      layer: 1,
      files: 2,
      classes: [{ name: "AkanServer", members: 3, at: at("pkgs/akanjs/server/akanServer.ts") }],
    },
    {
      id: "@akanjs/devkit",
      name: "@akanjs/devkit",
      packageName: "@akanjs/devkit",
      layer: 2,
      files: 1,
      classes: [{ name: "AkanAppHost", members: 1, at: at("pkgs/@akanjs/devkit/akanApp/akanApp.host.ts") }],
    },
  ],
  imports: [
    { from: "@akanjs/devkit", to: "akanjs/server", value: 0, type: 0, dynamic: 2, at: at("x") },
    { from: "akanjs/base", to: "akanjs/server", value: 0, type: 1, dynamic: 0, at: at("x") },
    { from: "akanjs/server", to: "akanjs/base", value: 4, type: 1, dynamic: 0, at: at("x") },
  ],
  channels: [
    {
      name: "AkanIpcMessage",
      label: "gateway ⇄ child",
      at: at("pkgs/akanjs/service/ipcTypes.ts"),
      messages: [
        {
          type: "ready",
          at: at("pkgs/akanjs/service/ipcTypes.ts"),
          senders: [{ owner: "AkanServer", count: 2, at: at("pkgs/akanjs/server/akanServer.ts") }],
          handlers: [],
        },
      ],
    },
  ],
  missing: [],
  cycles: [],
};

describe("FrameworkMapDoc", () => {
  it("renders the layers and the message tables between the markers, linked from the document's folder", () => {
    const generated = FrameworkMapDoc.render(map, "pkgs/akanjs");
    expect(generated.split("\n")[0]).toBe("<!-- akan:framework-map:start -->");
    expect(generated.split("\n").at(-1)).toBe("<!-- akan:framework-map:end -->");
    expect(generated).toContain("| 0 | `base` | — | `server` |");
    expect(generated).toContain("| 1 | `server` | `base` | — |");
    expect(generated).toContain("| 2 | `@akanjs/devkit` | `server` (lazy) | — |");
    expect(generated).toContain("### `AkanIpcMessage`: gateway ⇄ child");
    expect(generated).toContain("Declared in [service/ipcTypes.ts](service/ipcTypes.ts).");
    expect(generated).toContain("| `ready` | `AkanServer` | — |");
    expect(FrameworkMapDoc.render(map, "docs")).toContain("[../pkgs/akanjs/service/ipcTypes.ts]");
    expect(generated).not.toContain("load values from each other");
    expect(FrameworkMapDoc.render({ ...map, cycles: [["akanjs/base", "akanjs/server"]] }, "pkgs/akanjs")).toContain(
      "Facets that load values from each other: `base` ⇄ `server`.",
    );
  });

  it("replaces only the generated part, and appends it to a document without one", () => {
    const generated = FrameworkMapDoc.render(map, "pkgs/akanjs");
    const kept = "# Architecture\n\nHand-kept `AkanServer` text.\n";
    const appended = FrameworkMapDoc.splice(kept, generated);
    expect(appended).toBe(`${kept}\n${generated}\n`);
    expect(FrameworkMapDoc.splice(appended.replace("`ready`", "`stale`"), generated)).toBe(appended);
    expect(FrameworkMapDoc.generatedOf(appended)).toBe(generated);
    expect(FrameworkMapDoc.generatedOf(kept)).toBeNull();
  });

  it("checks the class names the hand-kept part cites, never the generated part", () => {
    const doc = FrameworkMapDoc.splice(
      "Runs `AkanServer`, `AkanAppHost.start()` and `AkanIpcMessage`, then `GoneRouter#handle`; `GET` and `/api` are no classes.",
      FrameworkMapDoc.render({ ...map, channels: [{ ...map.channels[0], name: "GeneratedOnly" }] }, "pkgs/akanjs"),
    );
    expect(FrameworkMapDoc.citedClasses(doc)).toEqual(["AkanAppHost", "AkanIpcMessage", "AkanServer", "GoneRouter"]);
    expect(FrameworkMapDoc.unknownClasses(doc, map)).toEqual(["GoneRouter"]);
  });
});
