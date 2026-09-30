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

  test("a reload keeps the stack: the page under the current one is back, the rest waits, and back walks it", async () => {
    const runtimeItem = (id: string) => `${item(id)}&csr=true&akanMobileTarget=e2e`;
    await csr.open(TAB_A);
    await csr.navigate(runtimeItem("31"));
    await csr.navigate(runtimeItem("32"));
    await csr.reload();
    expect(await itemIdsIn(CURRENT)).toEqual(["32"]);
    expect(await itemIdsIn(UNDER)).toEqual(["31"]);
    expect((await csr.containers()).some((container) => container.path.endsWith("/tab-a"))).toBe(false);
    //? The first back after a reload mounts the entry under the one it reveals, which a boot left dormant.
    await csr.back();
    await csr.waitForText(`${CURRENT} [data-e2e-probe="item"] [data-e2e="item-id"]`, ["31"]);
    await csr.back();
    expect(routeOf(await csr.currentPath())).toBe("/:lang/e2e/stack/tab-a");
    expect((await csr.probe("tab-a"))?.mounted).toBe(true);
    expect(await csr.reloaded()).toBe(false);
  }, 90_000);

  test("a popstate several entries away lands on that entry", async () => {
    await csr.open(TAB_A);
    for (const id of ["41", "42", "43"]) await csr.navigate(item(id));
    await csr.go(-2);
    expect(await itemIdsIn(CURRENT)).toEqual(["41"]);
    expect(await csr.reloaded()).toBe(false);
  }, 60_000);

  test("the page under the current one pauses while the app is in the background", async () => {
    await csr.open(TAB_A);
    await csr.navigate(item("51"));
    expect(await csr.ticksOver("tab-a")).toBeGreaterThan(0);
    await csr.setVisibility("hidden");
    expect(await csr.ticksOver("tab-a")).toBe(0);
    await csr.setVisibility("visible");
    expect(await csr.ticksOver("tab-a")).toBeGreaterThan(0);
  }, 60_000);

  test("a page that redirects after an await lands on the target, inside the target's own async layout", async () => {
    await csr.open(TAB_B);
    await csr.evaluate((next: string) => {
      window.dispatchEvent(new CustomEvent("akan:sync-navigation", { detail: { href: next, kind: "push" } }));
    }, "/e2e/stack/redirect?delay=120");
    await csr.waitFor((pathname: string) => location.pathname.endsWith(pathname), {
      args: ["/e2e/tabbed/home"],
      timeout: 10_000,
    });
    await csr.waitFor(() => document.querySelectorAll('[data-e2e="tabbar"]').length === 1, { timeout: 10_000 });
    await csr.waitFor(
      () =>
        (window as unknown as { __akanE2eProbes?: Record<string, { mounted?: boolean }> }).__akanE2eProbes?.home
          ?.mounted,
      { timeout: 10_000 },
    );
    expect(await csr.probe("home")).toMatchObject({ activity: "current", mounted: true });
    expect(await csr.reloaded()).toBe(false);
  }, 60_000);

  test("an async render that throws is logged with its route instead of leaving a blank page in silence", async () => {
    await csr.open("/e2e/stack/broken");
    await csr.waitFor(() => true);
    await Bun.sleep(500);
    expect(
      csr.consoleMessages().some((line) => /render of page \d+ of \S*\/e2e\/stack\/broken failed/.test(line)),
    ).toBe(true);
  }, 60_000);

  test("the memory frame trace records navigation without writing it to the console", async () => {
    await csr.open(TAB_A);
    await csr.evaluate(() => localStorage.setItem("akan:debug:frame", "memory"));
    try {
      await csr.open(TAB_A);
      await csr.navigate(item("71"));
      const events = await csr.evaluate(() =>
        ((window as { __AKAN_FRAME_TRACE__?: { event: string }[] }).__AKAN_FRAME_TRACE__ ?? []).map(
          (entry) => entry.event,
        ),
      );
      expect(events).toContain("router.push");
      expect(events).toContain("navigation.commit");
      expect(csr.consoleMessages().some((line) => line.includes("[akan:frame:"))).toBe(false);
    } finally {
      await csr.evaluate(() => localStorage.removeItem("akan:debug:frame"));
    }
  }, 60_000);

  test("a cached page whose layout redirected renders that layout again when it is back on screen", async () => {
    await csr.evaluate(() => {
      (globalThis as { __e2eSignedIn?: boolean }).__e2eSignedIn = false;
    });
    await csr.open("/e2e/gate/home");
    await csr.waitFor((pathname: string) => location.pathname.endsWith(pathname), {
      args: [TAB_B],
      timeout: 10_000,
    });
    await csr.evaluate(() => {
      (globalThis as { __e2eSignedIn?: boolean }).__e2eSignedIn = true;
    });
    await csr.navigate("/e2e/gate/home", "replace");
    await csr.waitFor(() => document.querySelectorAll('[data-e2e="gate-tabbar"]').length === 1, { timeout: 10_000 });
    expect(await csr.probe("gate-home")).toMatchObject({ activity: "current", mounted: true });
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
