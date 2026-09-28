import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const probeFile = path.join(workspaceRoot, "apps/minimal/ui/StackProbe.tsx");
const port = Number(process.env.AKAN_CSR_E2E_PATCH_FIRST_PORT ?? 8493);

interface CsrWindow {
  __akan?: { generation: number };
}

//? AKAN_CSR_DEV_APP_WRITE_DELAY_MS holds app.js back after the patch is announced, so a tab can boot inside the gap.
describe.skipIf(!CsrE2eHarness.enabled)("CSR patch before app.js (minimal, app.js written 1.5s late)", () => {
  let csr: CsrE2eHarness | null = null;
  const harness = () => {
    if (!csr) throw new Error("[csr-e2e] the harness did not start");
    return csr;
  };

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({
      app: "minimal",
      port,
      workspaceRoot,
      env: { AKAN_CSR_DEV_APP_WRITE_DELAY_MS: "1500" },
    });
  }, 240_000);

  afterAll(async () => {
    await csr?.close();
  }, 60_000);

  const generation = async () =>
    await harness().evaluate(() => (window as unknown as CsrWindow).__akan?.generation ?? 0);
  const hot = async () =>
    await harness().evaluate(
      () => document.querySelector('[data-e2e-probe="tab-a"]')?.getAttribute("data-e2e-hot") ?? null,
    );

  test("an open tab takes the patch before app.js is rewritten", async () => {
    await harness().open("/e2e/stack/tab-a");
    const before = await generation();
    await harness().editSource(
      probeFile,
      (source) => source.replace("data-e2e-probe={name}>", 'data-e2e-probe={name} data-e2e-hot="early">'),
      async () => {
        const startedAt = Date.now();
        await harness().waitFor(
          () => document.querySelector('[data-e2e-probe="tab-a"]')?.getAttribute("data-e2e-hot") === "early",
          { timeout: 20_000 },
        );
        expect(Date.now() - startedAt).toBeLessThan(1_500);
        expect(await generation()).toBeGreaterThan(before);
      },
    );
    expect(await harness().reloaded()).toBe(false);
  }, 120_000);

  test("a tab booting between the patch and app.js starts at the new generation with no second reload", async () => {
    await harness().open("/e2e/stack/tab-a");
    //? The previous test's restore may still be on its way: wait until the page shows it.
    await harness().waitFor(
      () => document.querySelector('[data-e2e-probe="tab-a"]')?.getAttribute("data-e2e-hot") === null,
      { timeout: 20_000 },
    );
    await harness().editSource(
      probeFile,
      (source) => source.replace("data-e2e-probe={name}>", 'data-e2e-probe={name} data-e2e-hot="booted">'),
      async () => {
        await harness().waitFor(
          () => document.querySelector('[data-e2e-probe="tab-a"]')?.getAttribute("data-e2e-hot") === "booted",
          { timeout: 20_000 },
        );
        const target = await generation();
        //? The first document after the reload: a second reload inside the harness's settle would take the marker.
        const booted = await harness().reload();
        expect(await generation()).toBe(target);
        expect(await hot()).toBe("booted");
        await Bun.sleep(2_000);
        expect(await harness().reloaded()).toBe(false);
        expect(await harness().evaluate(() => performance.timeOrigin)).toBe(booted);
        expect(await generation()).toBe(target);
      },
    );
  }, 120_000);
});
