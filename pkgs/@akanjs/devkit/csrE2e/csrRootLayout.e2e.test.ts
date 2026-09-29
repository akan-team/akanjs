import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

//* Where a CSR page lands, not only what its console says. CSR's root layout renders the pages in a frame of its own
//* and hides what it wraps, so a layout the route table puts at the root wraps no page: an app with its root layout
//* in a route group once rendered nothing, then rendered its dashboard outside the lock screen that wraps it.
const EXPLORE = "/explore";
const TAB_A = "/e2e/stack/tab-a";
//? The web layout draws no bottom chrome, so the `(tab)` layout shows in the route table, not in the text.
const exploreText = ["Where are you headed today?", "Popular stays right now"];

interface RouteTableWindow {
  __akan?: { inspect(): { executed: string[] }; require(id: string): unknown };
}

//? A page's element is inside its layout's marker, outside the hidden provider container, and on screen.
const placement = async (harness: CsrE2eHarness, page: string) =>
  await harness.evaluate((selector: string) => {
    const element = document.querySelector(selector);
    return {
      rendered: element !== null,
      inLayout: element?.closest('[data-e2e="public-layout"]') != null,
      hidden: element?.closest("#csr-provider-children") != null,
      visible: element?.checkVisibility() ?? false,
    };
  }, `[data-e2e="${page}"]`);

describe.skipIf(!CsrE2eHarness.enabled)("CSR layouts under a root layout (minimal, (tab))", () => {
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
  const layerCounts = async () =>
    await csr.evaluate(() => {
      const akan = (window as unknown as RouteTableWindow).__akan;
      const id = akan?.inspect().executed.find((executed) => executed.endsWith("webkit/CsrRouteTable.ts"));
      const table = id
        ? (akan?.require(id) as {
            CsrRouteTable: {
              active: {
                snapshot(): { pathRoutes: { path: string; renderRootLayouts: unknown[]; renderLayouts: unknown[] }[] };
              };
            };
          })
        : null;
      return Object.fromEntries(
        (table?.CsrRouteTable.active.snapshot().pathRoutes ?? []).map((route) => [
          route.path,
          { root: route.renderRootLayouts.length, layouts: route.renderLayouts.length },
        ]),
      );
    });

  test("a nested root boundary renders with its pages, not at the root", async () => {
    await csr.open(EXPLORE);
    await rendered(exploreText);
    const counts = await layerCounts();
    expect(counts["/:lang/explore"]?.root).toBe(counts["/:lang/e2e/stack/tab-a"]?.root);
    expect(counts["/:lang/explore"]?.layouts).toBe(1);
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

describe.skipIf(!CsrE2eHarness.enabled)("a root layout in a route group (groupedroot, page/(app)/_layout)", () => {
  let harness: CsrE2eHarness;

  beforeAll(async () => {
    harness = await CsrE2eHarness.start({
      app: "groupedroot",
      port: Number(process.env.AKAN_CSR_E2E_GROUPED_ROOT_PORT ?? 8498),
    });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await harness?.close();
  }, 60_000);

  const open = async (path: string, page: string, csr: boolean) => {
    await harness.open(path, { csr });
    await harness.waitFor((selector: string) => document.querySelector(selector) !== null, {
      args: [`[data-e2e="${page}"]`],
      timeout: 30_000,
    });
  };

  test.each([
    ["SSR", false],
    ["CSR", true],
  ] as const)(
    "%s: a page renders inside the (public) layout that wraps it",
    async (_mode, csr) => {
      for (const [path, page] of [
        ["/dashboard", "dashboard"],
        ["/", "index"],
      ] as const) {
        await open(path, page, csr);
        expect(await placement(harness, page)).toEqual({
          rendered: true,
          inLayout: true,
          hidden: false,
          visible: true,
        });
      }
      expect(harness.consoleMessages().filter((message) => /no root layout|error occurred/.test(message))).toEqual([]);
    },
    90_000,
  );
});
