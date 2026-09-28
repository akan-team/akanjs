import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const TAB_A = "/e2e/stack/tab-a";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const probeFile = path.join(workspaceRoot, "apps/minimal/ui/StackProbe.tsx");
const tabAFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/stack/tab-a.tsx");
const tabBFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/stack/tab-b.tsx");
const itemFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/stack/item.tsx");
const layoutFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/_layout.tsx");
const storeFile = path.join(workspaceRoot, "apps/minimal/lib/_minimal/minimal.store.ts");
const port = Number(process.env.AKAN_CSR_E2E_FAST_REFRESH_PORT ?? 8491);

interface CsrWindow {
  __akan?: { generation: number; inspect(): { modules: number } };
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[] };
}

const markProbe = (source: string) =>
  source.replace("data-e2e-probe={name}>", 'data-e2e-probe={name} data-e2e-hot="1">');
const ownSources = (executed: string[] = []) => executed.filter((id) => !id.includes("/.akan/generated/"));

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
    await csr.evaluate(() => (window as unknown as CsrWindow).__AKAN_CSR_LAST_UPDATE__ ?? null);
  const generation = async () => await csr.evaluate(() => (window as unknown as CsrWindow).__akan?.generation);
  const generationPasses = async (previous: number) =>
    await csr.waitFor((last: number) => ((window as unknown as CsrWindow).__akan?.generation ?? 0) > last, {
      args: [previous],
      timeout: 20_000,
    });
  const inputValue = async () =>
    await csr.evaluate(
      () => (document.querySelector('[data-e2e-probe="tab-a"] input') as HTMLInputElement | null)?.value,
    );
  const tabAItemIdIs = async (itemId: string) =>
    await csr.waitFor(
      (expected: string) =>
        document.querySelector('[data-e2e-probe="tab-a"] [data-e2e="item-id"]')?.textContent === expected,
      { args: [itemId], timeout: 30_000 },
    );

  test("the page boots from the registry dev bundle", async () => {
    await csr.open(TAB_A);
    const booted = await csr.evaluate(() => {
      const runtime = (window as unknown as CsrWindow).__akan;
      return { generation: runtime?.generation, modules: runtime?.inspect().modules ?? 0 };
    });
    expect(booted.generation).toBeGreaterThan(0);
    expect(booted.modules).toBeGreaterThan(100);
  }, 60_000);

  test("a component edit applies in place, keeping hook state and the DOM", async () => {
    await csr.open(TAB_A);
    await csr.type('[data-e2e-probe="tab-a"] input', "typed");
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
    await csr.type('[data-e2e-probe="tab-a"] input', "kept");
    const before = (await generation()) ?? 0;
    const edited = await csr.editSource(
      storeFile,
      (source) => source.replace("  // action\n", "  // action\n  touchForE2e() {\n    this.set({});\n  }\n"),
      async () => {
        await generationPasses(before);
        expect(await csr.reloaded()).toBe(false);
        expect(((await lastUpdate())?.executed ?? []).sort()).toEqual([
          "apps/minimal/lib/_minimal/minimal.store.ts",
          "apps/minimal/lib/st.ts",
        ]);
        expect(await inputValue()).toBe("kept");
        return (await generation()) ?? 0;
      },
    );
    await generationPasses(edited);
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
    await csr.waitFor(() => document.querySelector('[data-e2e-hot="1"]') === null, { timeout: 20_000 });
  }, 90_000);

  test("a page edit swaps the route in place, keeping the page's state", async () => {
    await csr.open(TAB_A);
    await csr.type('[data-e2e-probe="tab-a"] input', "kept");
    const mountId = (await csr.probe("tab-a"))?.mountId;
    await csr.editSource(
      tabAFile,
      (source) => source.replace('name="tab-a"', 'name="tab-a" itemId="edited"'),
      async () => {
        await tabAItemIdIs("edited");
        expect(await csr.reloaded()).toBe(false);
        expect((await csr.probe("tab-a"))?.mountId).toBe(mountId);
        expect(await inputValue()).toBe("kept");
        expect((await lastUpdate())?.executed).toEqual(["apps/minimal/page/(home)/e2e/stack/tab-a.tsx"]);
      },
    );
    await tabAItemIdIs("");
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);

  test("an edit to another page leaves the current page's render alone", async () => {
    await csr.open(TAB_A);
    const before = (await generation()) ?? 0;
    const renders = (await csr.probe("tab-a"))?.renders;
    const edited = await csr.editSource(
      tabBFile,
      (source) => source.replace('name="tab-b"', 'name="tab-b" itemId="edited"'),
      async () => {
        await generationPasses(before);
        await Bun.sleep(300);
        expect((await lastUpdate())?.executed).toEqual(["apps/minimal/page/(home)/e2e/stack/tab-b.tsx"]);
        expect((await csr.probe("tab-a"))?.renders).toBe(renders);
        expect(await csr.reloaded()).toBe(false);
        return (await generation()) ?? 0;
      },
    );
    await generationPasses(edited);
  }, 90_000);

  test("a layout edit swaps the layout in place, keeping the page under it", async () => {
    await csr.open(TAB_A);
    await csr.type('[data-e2e-probe="tab-a"] input', "kept");
    const mountId = (await csr.probe("tab-a"))?.mountId;
    await csr.editSource(
      layoutFile,
      (source) => source.replace("<>{children}</>", '<>{children}<span data-e2e-layout="edited" /></>'),
      async () => {
        await csr.waitFor(() => document.querySelector('[data-e2e-layout="edited"]') !== null, { timeout: 30_000 });
        expect(await csr.reloaded()).toBe(false);
        expect((await csr.probe("tab-a"))?.mountId).toBe(mountId);
        expect(await inputValue()).toBe("kept");
        //? A layout reaches the entry through the root-layout wrapper route discovery generates around it.
        expect(ownSources((await lastUpdate())?.executed)).toEqual(["apps/minimal/page/(home)/e2e/_layout.tsx"]);
      },
    );
    await csr.waitFor(() => document.querySelector('[data-e2e-layout="edited"]') === null, { timeout: 30_000 });
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);

  test("a page edit keeps the stack: the page it covers comes back with its state", async () => {
    await csr.open(TAB_A);
    await csr.type('[data-e2e-probe="tab-a"] input', "under");
    const mountId = (await csr.probe("tab-a"))?.mountId;
    await csr.navigate("/e2e/stack/item?id=1");
    const currentItemId = async () =>
      await csr.text('[id^="pageContainer-"]:not([aria-hidden="true"]) [data-e2e-probe="item"] [data-e2e="item-id"]');
    await csr.editSource(
      itemFile,
      (source) => source.replace('itemId={id ?? ""}', 'itemId={"edited-" + (id ?? "")}'),
      async () => {
        await csr.waitFor(
          () =>
            [...document.querySelectorAll('[data-e2e-probe="item"] [data-e2e="item-id"]')].some(
              (element) => element.textContent === "edited-1",
            ),
          { timeout: 30_000 },
        );
        expect(await currentItemId()).toEqual(["edited-1"]);
        expect((await lastUpdate())?.executed).toEqual(["apps/minimal/page/(home)/e2e/stack/item.tsx"]);
      },
    );
    await csr.waitFor(
      () =>
        [...document.querySelectorAll('[data-e2e-probe="item"] [data-e2e="item-id"]')].some(
          (element) => element.textContent === "1",
        ),
      { timeout: 30_000 },
    );
    await csr.back();
    expect(await inputValue()).toBe("under");
    expect((await csr.probe("tab-a"))?.mountId).toBe(mountId);
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);
});

describe.skipIf(!CsrE2eHarness.enabled)("CSR single-file artifact (minimal, AKAN_DEV_CSR=artifact)", () => {
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
