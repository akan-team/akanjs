import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const TAB_A = "/e2e/stack/tab-a";
const TAB_B = "/e2e/stack/tab-b";
const item = (id: string) => `/e2e/stack/item?id=${id}`;

const routeOf = (pathWithSearch: string) => pathWithSearch.split("?")[0].replace(/^\/[^/]+/, "/:lang");
const CURRENT = '[id^="pageContainer-"]:not([aria-hidden="true"])';
const UNDER = '[id^="pageContainer-"][aria-hidden="true"]';

describe.skipIf(!CsrE2eHarness.enabled)("CSR page stack (minimal, /e2e/stack)", () => {
  let csr: CsrE2eHarness;

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({ app: "minimal" });
  }, 240_000);

  afterAll(async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: unassigned when beforeAll threw before the harness started
    await csr?.close();
  }, 60_000);

  const itemIdsIn = async (scope: string, options?: { mounted?: boolean }) =>
    await csr.text(`${scope} [data-e2e-probe="item"] [data-e2e="item-id"]`, options);
  const currentInput = `${CURRENT} [data-e2e-probe="item"] [data-e2e="input"]`;

  test("an entry of the same route is its own page, and the one it covers waits under it with its state", async () => {
    await csr.open(TAB_A);
    await csr.navigate(item("1"));
    await csr.type(currentInput, "first");
    await csr.navigate(item("2"));
    expect(await itemIdsIn(CURRENT)).toEqual(["2"]);
    expect(await itemIdsIn(UNDER)).toEqual(["1"]);
    expect(await csr.values(currentInput)).toEqual([""]);
    await csr.back();
    expect(await itemIdsIn(CURRENT)).toEqual(["1"]);
    expect(await csr.values(currentInput)).toEqual(["first"]);
    expect(await csr.reloaded()).toBe(false);
  }, 60_000);

  test("the stack keeps three hidden entries under the previous one, releases older ones, and reveals each on back", async () => {
    await csr.open(TAB_A);
    for (const id of ["11", "12", "13"]) await csr.navigate(item(id));
    await csr.type(currentInput, "thirteen");
    for (const id of ["14", "15", "16"]) await csr.navigate(item(id));
    expect((await itemIdsIn('[id^="pageContainer-"]', { mounted: true })).sort()).toEqual([
      "12",
      "13",
      "14",
      "15",
      "16",
    ]);
    for (const expected of ["15", "14", "13"]) {
      await csr.back();
      expect(await itemIdsIn(CURRENT)).toEqual([expected]);
    }
    expect(await csr.values(currentInput)).toEqual(["thirteen"]);
    await csr.back();
    await csr.back();
    expect(await itemIdsIn(CURRENT)).toEqual(["11"]);
    expect(await csr.values(currentInput)).toEqual([""]);
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);

  test("a replace within one route updates the page in place", async () => {
    await csr.open(item("21"));
    await csr.type(currentInput, "kept");
    await csr.navigate(item("22"), "replace");
    expect(await itemIdsIn(CURRENT)).toEqual(["22"]);
    expect(await csr.values(currentInput)).toEqual(["kept"]);
    expect((await csr.containers()).filter((container) => container.path.endsWith("/item"))).toHaveLength(1);
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
    expect(containers.filter((container) => !container.inert).map((container) => container.path)).toEqual([current]);
    expect(containers.every((container) => container.inert === container.ariaHidden)).toBe(true);
  }, 60_000);

  test("only the current page offers the agent its tools, not the page kept under it for a swipe back", async () => {
    await csr.open(TAB_A);
    expect(await csr.agentTools()).toContain("bumpTabA");
    await csr.navigate(item("7"));
    const tools = await csr.agentTools();
    expect(tools).toContain("bumpItem");
    expect(tools).not.toContain("bumpTabA");
    expect(await csr.ticksOver("tab-a")).toBeGreaterThan(0);
    await csr.back();
    const back = await csr.agentTools();
    expect(back).toContain("bumpTabA");
    expect(back).not.toContain("bumpItem");
  }, 60_000);

  test("a page is focused while current and settled; the page under it stays live but unfocused", async () => {
    await csr.open(TAB_A);
    expect((await csr.probe("tab-a"))?.focused).toBe(true);
    const focusCount = (await csr.probe("tab-a"))?.focusCount ?? 0;
    await csr.navigate(item("8"));
    expect(await csr.probe("tab-a")).toMatchObject({ activity: "prev", focused: false, mounted: true });
    expect(await csr.probe("item")).toMatchObject({ activity: "current", focused: true });
    await csr.back();
    expect(await csr.probe("tab-a")).toMatchObject({ activity: "current", focused: true, focusCount: focusCount + 1 });
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
