import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { setTestEnv } from "../testHelpers.fixture";

let ClientWrapper: typeof import("./Client").ClientWrapper;
let Translator: typeof import("akanjs/client").Translator;

beforeAll(async () => {
  setTestEnv("clienttest");
  ({ Translator } = await import("akanjs/client"));
  ({ ClientWrapper } = await import("./Client"));
});

describe("ClientWrapper", () => {
  test("leaves the shared translator state alone when it renders on the server", () => {
    const before = { locale: Translator.getActiveLocale(), path: Translator.getActivePath() };

    renderToString(
      <ClientWrapper lang="ko" path="/docs" serverLocale reconnect={false}>
        <p>page</p>
      </ClientWrapper>,
    );

    expect({ locale: Translator.getActiveLocale(), path: Translator.getActivePath() }).toEqual(before);
  });

  test("bundles for the browser without the agent library, which only a CSR page stack gates", async () => {
    const script = `
const built = await Bun.build({ entrypoints: [${JSON.stringify(path.join(import.meta.dir, "Client.tsx"))}], target: "browser", format: "esm", packages: "external", external: ["akanjs/*"] });
const output = (await Promise.all(built.outputs.map((artifact) => artifact.text()))).join("\\n");
console.log(JSON.stringify({ success: built.success, specifiers: [...new Set([...output.matchAll(/(?:from\\s*|import\\(\\s*)["']([^"']+)["']/g)].map((match) => match[1]))] }));
`;
    const proc = Bun.spawn([process.execPath, "--eval", script], { cwd: import.meta.dir, stdout: "pipe" });
    const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const { success, specifiers } = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
    expect(success).toBe(true);
    expect(specifiers).toContain("akanjs/store");
    expect(specifiers).not.toContain("use-agentic");
  });
});
