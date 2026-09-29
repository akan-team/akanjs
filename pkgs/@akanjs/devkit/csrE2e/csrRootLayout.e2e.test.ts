import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

//* What a CSR page renders, not only what its console says: a root layout in a route group once left every route with
//* none at the root, and the router rendered an empty `#root` with nothing logged. minimal's `(tab)` layout is one.
const EXPLORE = "/explore";
const TAB_A = "/e2e/stack/tab-a";
//? The web layout draws no bottom chrome, so the `(tab)` layout shows in the route table, not in the text.
const exploreText = ["Where are you headed today?", "Popular stays right now"];

interface RouteTableWindow {
  __akan?: { inspect(): { executed: string[] }; require(id: string): unknown };
}

describe.skipIf(!CsrE2eHarness.enabled)("CSR root layouts in a route group (minimal, (tab))", () => {
  let csr: CsrE2eHarness;

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({
      app: "minimal",
      port: Number(process.env.AKAN_CSR_E2E_ROOT_LAYOUT_PORT ?? 8497),
    });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await csr?.close();
  }, 60_000);

  const rendered = async (texts: string[]) =>
    await csr.waitFor(
      (want: string[]) => want.every((text) => (document.getElementById("root")?.innerText ?? "").includes(text)),
      { args: [texts], timeout: 30_000 },
    );
  //? The table the running bundle built, read through the dev registry: what the router renders from.
  const rootLayoutCounts = async () =>
    await csr.evaluate(() => {
      const akan = (window as unknown as RouteTableWindow).__akan;
      const id = akan?.inspect().executed.find((executed) => executed.endsWith("webkit/CsrRouteTable.ts"));
      const table = id
        ? (akan?.require(id) as {
            CsrRouteTable: { active: { snapshot(): { pathRoutes: { path: string; renderRootLayouts: unknown[] }[] } } };
          })
        : null;
      return Object.fromEntries(
        (table?.CsrRouteTable.active.snapshot().pathRoutes ?? []).map((route) => [
          route.path,
          route.renderRootLayouts.length,
        ]),
      );
    });

  test("a page under the group's root layout renders inside it, with the layouts SSR gives it", async () => {
    await csr.open(EXPLORE);
    await rendered(exploreText);
    const counts = await rootLayoutCounts();
    //? minimal's `_overrides.tsx` renders at the root too; the `(tab)` layout is the one render explore adds to it.
    expect(counts["/:lang/e2e/stack/tab-a"]).toBeGreaterThan(0);
    expect(counts["/:lang/explore"]).toBe((counts["/:lang/e2e/stack/tab-a"] ?? 0) + 1);
    expect(csr.consoleMessages().filter((message) => /no root layout|error occurred/.test(message))).toEqual([]);
  }, 60_000);

  test("leaving the group and coming back renders each side", async () => {
    await csr.open(EXPLORE);
    await rendered(exploreText);
    await csr.navigate(TAB_A);
    await csr.waitFor(() => document.querySelector('[data-e2e-probe="tab-a"]') !== null, { timeout: 30_000 });
    await csr.back();
    await rendered(exploreText);
  }, 90_000);
});
