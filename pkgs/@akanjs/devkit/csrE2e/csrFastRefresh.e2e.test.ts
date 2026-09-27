import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const TAB_A = "/e2e/stack/tab-a";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const probeFile = path.join(workspaceRoot, "apps/minimal/ui/StackProbe.tsx");
const tabAFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/stack/tab-a.tsx");
const storeFile = path.join(workspaceRoot, "apps/minimal/lib/_minimal/minimal.store.ts");
const port = Number(process.env.AKAN_CSR_E2E_FAST_REFRESH_PORT ?? 8491);

interface CsrWindow {
  __akan?: { generation: number; inspect(): { modules: number } };
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[] };
}

const markProbe = (source: string) =>
  source.replace("data-e2e-probe={name}>", 'data-e2e-probe={name} data-e2e-hot="1">');

describe.skipIf(!CsrE2eHarness.enabled)("CSR Fast Refresh (minimal, AKAN_DEV_CSR=registry)", () => {
  let csr: CsrE2eHarness;

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({ app: "minimal", port, env: { AKAN_DEV_CSR: "registry" } });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await csr?.close();
  }, 60_000);

  const lastUpdate = async () =>
    await csr.page.evaluate(() => (window as unknown as CsrWindow).__AKAN_CSR_LAST_UPDATE__ ?? null);
  const generation = async () => await csr.page.evaluate(() => (window as unknown as CsrWindow).__akan?.generation);
  const inputValue = async () =>
    await csr.page.evaluate(
      () => (document.querySelector('[data-e2e-probe="tab-a"] input') as HTMLInputElement | null)?.value,
    );

  test("the page boots from the registry dev bundle", async () => {
    await csr.open(TAB_A);
    const booted = await csr.page.evaluate(() => {
      const runtime = (window as unknown as CsrWindow).__akan;
      return { generation: runtime?.generation, modules: runtime?.inspect().modules ?? 0 };
    });
    expect(booted.generation).toBeGreaterThan(0);
    expect(booted.modules).toBeGreaterThan(100);
  }, 60_000);

  test("a component edit applies in place, keeping hook state and the DOM", async () => {
    await csr.open(TAB_A);
    await csr.page.type('[data-e2e-probe="tab-a"] input', "typed");
    const mountId = (await csr.probe("tab-a"))?.mountId;
    await csr.editSource(probeFile, markProbe, async () => {
      await csr.waitFor(() => document.querySelector('[data-e2e-hot="1"]') !== null, { timeout: 20_000 });
      expect(await csr.reloaded()).toBe(false);
      expect((await csr.probe("tab-a"))?.mountId).toBe(mountId);
      expect(await inputValue()).toBe("typed");
      expect((await lastUpdate())?.executed).toEqual(["apps/minimal/ui/StackProbe.tsx"]);
    });
    await csr.waitFor(() => document.querySelector('[data-e2e-hot="1"]') === null, { timeout: 20_000 });
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);

  test("a store edit re-runs the store root and nothing above it", async () => {
    await csr.open(TAB_A);
    await csr.page.type('[data-e2e-probe="tab-a"] input', "kept");
    const before = (await generation()) ?? 0;
    await csr.editSource(
      storeFile,
      (source) => source.replace("  // action\n", "  // action\n  touchForE2e() {\n    this.set({});\n  }\n"),
      async () => {
        await csr.waitFor((previous: number) => (window as unknown as CsrWindow).__akan?.generation !== previous, {
          args: [before],
          timeout: 20_000,
        });
        expect(await csr.reloaded()).toBe(false);
        expect(((await lastUpdate())?.executed ?? []).sort()).toEqual([
          "apps/minimal/lib/_minimal/minimal.store.ts",
          "apps/minimal/lib/st.ts",
        ]);
        expect(await inputValue()).toBe("kept");
      },
    );
  }, 90_000);

  test("a build error shows the overlay without reloading, and the fix applies in place", async () => {
    await csr.open(TAB_A);
    await csr.editSource(
      probeFile,
      (source) => source.replace("  return (\n", "  return ((\n"),
      async () => {
        await csr.waitFor(() => document.querySelector('.__akan_hmr_overlay[data-status="error"]') !== null, {
          timeout: 20_000,
        });
        expect(await csr.reloaded()).toBe(false);
      },
    );
    await csr.editSource(probeFile, markProbe, async () => {
      await csr.waitFor(() => document.querySelector('[data-e2e-hot="1"]') !== null, { timeout: 20_000 });
      expect(await csr.reloaded()).toBe(false);
    });
  }, 90_000);

  //? Until route HMR lands a page module has no boundary above it but the entry, so the runtime reloads.
  test("a page edit reloads", async () => {
    await csr.open(TAB_A);
    await csr.editSource(
      tabAFile,
      (source) => source.replace('name="tab-a"', 'name="tab-a" itemId="edited"'),
      async () => {
        await csr.waitFor(
          () => document.querySelector('[data-e2e-probe="tab-a"] [data-e2e="item-id"]')?.textContent === "edited",
          { timeout: 30_000 },
        );
        expect(await csr.reloaded()).toBe(true);
      },
    );
  }, 90_000);
});

describe.skipIf(!CsrE2eHarness.enabled)("CSR single-file artifact (minimal, AKAN_DEV_CSR unset)", () => {
  let csr: CsrE2eHarness;

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({ app: "minimal", port, env: { AKAN_DEV_CSR: "artifact" } });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await csr?.close();
  }, 60_000);

  test("a component edit reloads the tab onto the rebuilt artifact", async () => {
    await csr.open(TAB_A);
    await csr.editSource(probeFile, markProbe, async () => {
      await csr.waitFor(() => document.querySelector('[data-e2e-hot="1"]') !== null, { timeout: 30_000 });
      expect(await csr.reloaded()).toBe(true);
    });
  }, 90_000);
});
