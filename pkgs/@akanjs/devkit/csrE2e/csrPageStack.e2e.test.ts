import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const TAB_A = "/e2e/stack/tab-a";
const TAB_B = "/e2e/stack/tab-b";
const item = (id: string) => `/e2e/stack/item?id=${id}`;

const routeOf = (pathWithSearch: string) => pathWithSearch.split("?")[0].replace(/^\/[^/]+/, "/:lang");

describe.skipIf(!CsrE2eHarness.enabled)("CSR page stack (minimal, /e2e/stack)", () => {
  let csr: CsrE2eHarness;

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({ app: "minimal" });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await csr?.close();
  }, 60_000);

  const visibleItemIds = async () => await csr.text('[data-e2e-probe="item"] [data-e2e="item-id"]');

  test("an entry of the same route shows its own content, not the previous entry's", async () => {
    await csr.open(TAB_A);
    await csr.navigate(item("1"));
    expect(await visibleItemIds()).toEqual(["1"]);
    await csr.navigate(item("2"));
    expect(await visibleItemIds()).toEqual(["2"]);
  }, 60_000);

  test("the page the session opened on is cached like any other cached page", async () => {
    await csr.open(TAB_A);
    const mountedAs = (await csr.probe("tab-a"))?.mountId;
    await csr.navigate(TAB_B);
    await csr.navigate(item("3"));
    await csr.navigate(TAB_A);
    expect((await csr.probe("tab-a"))?.mountId).toBe(mountedAs);
    expect(await csr.reloaded()).toBe(false);
  }, 60_000);

  test("a cached page that is not visible pauses its effects and resumes them with its state", async () => {
    await csr.open(TAB_B);
    await csr.navigate(TAB_A);
    const mountedAs = (await csr.probe("tab-a"))?.mountId;
    await csr.navigate(TAB_B);
    await csr.navigate(item("4"));
    expect((await csr.containers()).find((container) => container.path.endsWith("/tab-a"))?.hidden).toBe(true);
    expect(await csr.ticksOver("tab-a")).toBe(0);
    await csr.navigate(TAB_A);
    expect((await csr.probe("tab-a"))?.mountId).toBe(mountedAs);
    expect(await csr.ticksOver("tab-a")).toBeGreaterThan(0);
  }, 60_000);

  test("the page a transition-less switch left pauses at once, and runs again when switched back", async () => {
    await csr.open(TAB_A);
    const mountedAs = (await csr.probe("tab-a"))?.mountId;
    await csr.navigate(TAB_B);
    expect(await csr.ticksOver("tab-a")).toBe(0);
    await csr.navigate(TAB_A);
    expect((await csr.probe("tab-a"))?.mountId).toBe(mountedAs);
    expect(await csr.ticksOver("tab-a")).toBeGreaterThan(0);
  }, 60_000);

  test("every page container but the current one is inert and hidden from assistive tech", async () => {
    await csr.open(TAB_A);
    await csr.navigate(TAB_B);
    await csr.navigate(item("5"));
    const current = routeOf(await csr.currentPath());
    const containers = await csr.containers();
    expect(containers.map((container) => container.path)).toContain(current);
    expect(containers.map(({ path, inert, ariaHidden }) => ({ path, inert, ariaHidden }))).toEqual(
      containers.map(({ path }) => ({ path, inert: path !== current, ariaHidden: path !== current })),
    );
  }, 60_000);

  test("back returns to the previous entry without a reload", async () => {
    await csr.open(TAB_A);
    await csr.navigate(item("6"));
    await csr.back();
    expect(routeOf(await csr.currentPath())).toBe("/:lang/e2e/stack/tab-a");
    expect(await csr.text('[data-e2e-probe="tab-a"] [data-e2e="item-id"]')).toHaveLength(1);
    expect(await csr.reloaded()).toBe(false);
  }, 60_000);
});
