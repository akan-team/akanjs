import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const REGISTRY = "/e2e/registry";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const uiFile = (name: string) => path.join(workspaceRoot, "apps/minimal/ui", name);
const probeFile = uiFile("RegistryProbe.tsx");
const labelFile = uiFile("RegistryLabel.tsx");
const lazyFile = uiFile("RegistryLazy_Dynamic.tsx");
const port = Number(process.env.AKAN_CSR_E2E_SSR_REGISTRY_PORT ?? 8494);

interface RegistryWindow {
  __akan?: { generation: number };
  __akanRegistryProbe?: { effects: number; contextId: string };
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[] };
  __AKAN_HMR_TRACES__?: { kind: string; generation: number; trace: { broadcastAt?: number } | null }[];
}

describe.skipIf(!CsrE2eHarness.enabled)("SSR dev registry (minimal)", () => {
  let ssr: CsrE2eHarness;

  beforeAll(async () => {
    ssr = await CsrE2eHarness.start({ app: "minimal", port });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await ssr?.close();
  }, 60_000);

  const open = async () => {
    await ssr.open(REGISTRY, { csr: false });
    await ssr.waitFor(
      () =>
        document.querySelector('[data-e2e="lazy"]') !== null &&
        ((window as unknown as RegistryWindow).__akan?.generation ?? 0) > 0,
      { timeout: 20_000 },
    );
  };
  const snapshot = async () =>
    await ssr.evaluate(() => {
      const w = window as unknown as RegistryWindow;
      return {
        count: document.querySelector('[data-e2e="count"]')?.textContent ?? null,
        effects: w.__akanRegistryProbe?.effects ?? 0,
        contextId: w.__akanRegistryProbe?.contextId ?? "",
        executed: w.__AKAN_CSR_LAST_UPDATE__?.executed ?? [],
      };
    });
  const textIs = async (selector: string, expected: string) =>
    await ssr.waitFor((target: string, text: string) => document.querySelector(target)?.textContent === text, {
      args: [selector, expected],
      timeout: 20_000,
    });
  const probeMarked = (marked: boolean) =>
    ssr.waitFor(
      (expected: boolean) =>
        (document.querySelector('[data-e2e="registry-probe"]')?.getAttribute("data-e2e-hot") === "1") === expected,
      { args: [marked], timeout: 20_000 },
    );
  const markProbe = (source: string) =>
    source.replace('data-e2e="registry-probe">', 'data-e2e="registry-probe" data-e2e-hot="1">');

  test("the page hydrates from the registry, with the bootstrap run ahead of its modules", async () => {
    await open();
    expect(
      await ssr.evaluate(() => String((window as { __webpack_require__?: unknown }).__webpack_require__)),
    ).toContain("idPrefix");
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
  }, 60_000);

  test("a component edit patches in place, keeping state and every other module instance", async () => {
    await open();
    await ssr.evaluate(() => {
      const bump = document.querySelector<HTMLButtonElement>('[data-e2e="bump"]');
      bump?.click();
      bump?.click();
    });
    await textIs('[data-e2e="count"]', "2");
    const before = await snapshot();
    await ssr.editSource(probeFile, markProbe, async () => {
      await probeMarked(true);
      const after = await snapshot();
      expect(after.count).toBe("2");
      expect(after.contextId).toBe(before.contextId);
      expect(after.executed).toEqual(["apps/minimal/ui/RegistryProbe.tsx"]);
    });
    await probeMarked(false);
    expect(await ssr.reloaded()).toBe(false);
  }, 90_000);

  test("undoing an edit shows the original again", async () => {
    await open();
    const original = await Bun.file(probeFile).text();
    await Bun.write(probeFile, markProbe(original));
    try {
      await probeMarked(true);
    } finally {
      await Bun.write(probeFile, original);
    }
    await probeMarked(false);
    expect(await ssr.reloaded()).toBe(false);
  }, 90_000);

  test("a lazy() target patches in place, and re-runs no effect of a module it does not own", async () => {
    await open();
    const { effects } = await snapshot();
    await ssr.editSource(
      lazyFile,
      (source) => source.replace("lazy-0", "lazy-1"),
      async () => {
        await textIs('[data-e2e="lazy"]', "lazy-1");
        expect((await snapshot()).effects).toBe(effects);
      },
    );
    await textIs('[data-e2e="lazy"]', "lazy-0");
    expect(await ssr.reloaded()).toBe(false);
  }, 90_000);

  test("a component the server renders too updates both copies, its patch going out with the RSC refresh", async () => {
    await open();
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
    await ssr.editSource(
      labelFile,
      (source) => source.replace("label-0", "label-1"),
      async () => {
        await textIs('[data-e2e="label-client"]', "label-1");
        await textIs('[data-e2e="label-server"]', "label-1");
        const traces = await ssr.evaluate(() => (window as unknown as RegistryWindow).__AKAN_HMR_TRACES__ ?? []);
        const patch = traces.filter((entry) => entry.kind === "ssr").at(-1);
        const refresh = traces.filter((entry) => entry.kind === "rsc-refresh").at(-1);
        expect(patch?.trace?.broadcastAt).toBeDefined();
        expect(Math.abs((patch?.trace?.broadcastAt ?? 0) - (refresh?.trace?.broadcastAt ?? 0))).toBeLessThan(100);
      },
    );
    await textIs('[data-e2e="label-server"]', "label-0");
    await textIs('[data-e2e="label-client"]', "label-0");
    expect(await ssr.evaluate(() => document.querySelector('[data-e2e="count"]')?.textContent)).toBe("1");
    expect(await ssr.reloaded()).toBe(false);
  }, 90_000);

  test("a build error shows the overlay, and the fix patches the page without a reload", async () => {
    await open();
    await ssr.editSource(
      probeFile,
      (source) => source.replace("return (", "return (<"),
      async () => {
        await ssr.waitFor(() => document.querySelector(".__akan_hmr_overlay[data-status=error]") !== null, {
          timeout: 20_000,
        });
      },
    );
    await ssr.waitFor(() => document.querySelector(".__akan_hmr_overlay[data-status=error]") === null, {
      timeout: 20_000,
    });
    await ssr.editSource(probeFile, markProbe, async () => {
      await probeMarked(true);
    });
    await probeMarked(false);
    expect(await ssr.reloaded()).toBe(false);
  }, 120_000);
});
