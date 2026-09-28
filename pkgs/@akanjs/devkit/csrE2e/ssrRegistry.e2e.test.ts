import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

const REGISTRY = "/e2e/registry";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const uiFile = (name: string) => path.join(workspaceRoot, "apps/minimal/ui", name);
const probeFile = uiFile("RegistryProbe.tsx");
const labelFile = uiFile("RegistryLabel.tsx");
const lazyFile = uiFile("RegistryLazy_Dynamic.tsx");
const serverPartFile = uiFile("RegistryServerPart.tsx");
const pageFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/registry.tsx");
const storeFile = path.join(workspaceRoot, "apps/minimal/lib/_minimal/minimal.store.ts");
const valueFile = path.join(workspaceRoot, "apps/minimal/common/registryValue.constant.ts");
//? Read only by client code (the probe), so breaking it fails the registry's builds and no server bundle.
const contextFile = uiFile("registryContext.ts");
const registryManifest = path.join(workspaceRoot, "apps/minimal/.akan/artifact/ssr-dev/manifest.json");
const configFile = path.join(workspaceRoot, "apps/minimal/akan.config.ts");
const sharedFile = path.join(workspaceRoot, "apps/minimal/common/registrySharedText.ts");
const signalFile = path.join(workspaceRoot, "apps/minimal/lib/_minimal/minimal.signal.ts");
const serviceFile = path.join(workspaceRoot, "apps/minimal/lib/_minimal/minimal.service.ts");
const bootLogPrefix = "akan-e2e-boots:";
const workerEntry = path.join(workspaceRoot, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts");
const port = Number(process.env.AKAN_CSR_E2E_SSR_REGISTRY_PORT ?? 8494);

//? Build workers of the dev server this suite started (its process group, so another session's leftovers in the same
//? worktree do not count) that outlived the builder that spawned them (reparented to init), sampled until stopped: one
//? left running would keep writing a registry the replacement builder is rebuilding. Seen twice, so a worker caught in
//? the moment between its builder's exit and its own is not counted.
const sampleOrphanWorkers = (group: number | null) => {
  const seen = new Map<string, number>();
  let sampling = true;
  const loop = (async () => {
    while (sampling) {
      const listing = Bun.spawnSync(["ps", "-axo", "pid=,ppid=,pgid=,command="]).stdout.toString();
      for (const line of listing.split("\n")) {
        const [pid, ppid, pgid] = line.trim().split(/\s+/);
        if (ppid !== "1" || !pid || (group !== null && pgid !== String(group))) continue;
        if (line.includes(workerEntry)) seen.set(pid, (seen.get(pid) ?? 0) + 1);
      }
      await Bun.sleep(200);
    }
  })();
  return async () => {
    sampling = false;
    await loop;
    return [...seen].filter(([, count]) => count > 1).map(([pid]) => pid);
  };
};

interface RegistryWindow {
  __akan?: { generation: number; inspect(): { started: boolean; failed: boolean } };
  __akanE2eBroken?: boolean;
  __akanRegistryProbe?: { effects: number; contextId: string };
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[] };
  __AKAN_HMR_TRACES__?: { kind: string; generation: number; trace: { broadcastAt?: number } | null }[];
}

describe.skipIf(!CsrE2eHarness.enabled)("SSR dev registry (minimal)", () => {
  let ssr: CsrE2eHarness;

  beforeAll(async () => {
    ssr = await CsrE2eHarness.start({ app: "minimal", port, env: { AKAN_DEV_SSR_ARM_DELAY_MS: "3000" } });
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
  const markProbe = (source: string, value = "1") =>
    source.replace('data-e2e="registry-probe">', `data-e2e="registry-probe" data-e2e-hot="${value}">`);
  const probeHot = (value: string) =>
    ssr.waitFor(
      (expected: string) =>
        document.querySelector('[data-e2e="registry-probe"]')?.getAttribute("data-e2e-hot") === expected,
      { args: [value], timeout: 20_000 },
    );
  const fetchPage = async (pathname = REGISTRY) =>
    await fetch(new URL(`/en${pathname}`, ssr.origin)).then((res) => res.text());
  const waitForServerLog = async (mark: { out: number; err: number }, pattern: RegExp, timeout = 90_000) => {
    const deadline = Date.now() + timeout;
    while (!pattern.test(await ssr.serverLogSince(mark))) {
      if (Date.now() > deadline) throw new Error(`[ssr-registry-e2e] the dev server never logged ${pattern}`);
      await Bun.sleep(250);
    }
  };

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

  test("a client entry that also exports a non-component patches in place, keeping state", async () => {
    await open();
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
    await ssr.editSource(
      probeFile,
      (source) => `${markProbe(source)}\nexport const registryProbeVersion = 1;\n`,
      async () => {
        await probeMarked(true);
        expect((await snapshot()).count).toBe("1");
      },
    );
    const restoredAt = Date.now();
    await probeMarked(false);
    //? Dropping an export changes what the server holds, so an RSC refresh follows; leaving mid-fetch hard-navigates.
    await ssr.waitFor(
      (since: number) =>
        (
          (window as unknown as { __AKAN_HMR_TRACES__?: { kind: string; receivedAt: number }[] }).__AKAN_HMR_TRACES__ ??
          []
        ).some((entry) => entry.kind === "rsc-refresh" && entry.receivedAt >= since),
      { args: [restoredAt], timeout: 20_000 },
    );
    expect(await ssr.reloaded()).toBe(false);
  }, 90_000);

  test("a page loaded right after a save renders the saved client code, so hydration matches", async () => {
    await open();
    await ssr.editSource(probeFile, markProbe, async () => {
      //? The patch reaches the tab after the backend took the save's invalidation, which dropped the stale entries.
      await probeMarked(true);
      const html = await fetchPage();
      expect(html).toContain('data-e2e-hot="1"');
      await ssr.open(REGISTRY, { csr: false });
      await probeMarked(true);
    });
    await probeMarked(false);
  }, 90_000);

  test("a save landing while the page's route builds is in the page that build answers", async () => {
    await open();
    const original = await Bun.file(probeFile).text();
    try {
      //? A client entry's save drops the route and refreshes no tab, so the request below builds the route again.
      await Bun.write(probeFile, markProbe(original, "1"));
      await probeHot("1");
      const mark = await ssr.serverLogMark();
      const html = fetchPage();
      await Bun.sleep(40);
      await Bun.write(probeFile, markProbe(original, "2"));
      expect(await html).toContain('data-e2e-hot="2"');
      expect(await ssr.serverLogSince(mark)).toMatch(/stale build ignored routeId=\/:lang\/e2e\/registry/);
    } finally {
      await Bun.write(probeFile, original);
    }
    await probeMarked(false);
  }, 90_000);

  test("saves to another page's component while a route builds leave that build standing", async () => {
    await open();
    const original = await Bun.file(probeFile).text();
    const mark = await ssr.serverLogMark();
    let answered = false;
    const html = fetchPage("/lab/buttons").finally(() => {
      answered = true;
    });
    try {
      for (let save = 1; !answered && save <= 20; save += 1) {
        await Bun.write(probeFile, markProbe(original, String(save)));
        await Bun.sleep(300);
      }
      expect(await html).not.toContain("React Client Manifest");
    } finally {
      await Bun.write(probeFile, original);
    }
    const log = await ssr.serverLogSince(mark);
    expect(log.match(/build done routeId=\/:lang\/lab\/buttons/g) ?? []).toHaveLength(1);
    expect(log).not.toMatch(/stale build ignored routeId=\/:lang\/lab\/buttons/);
    await probeMarked(false);
  }, 90_000);

  test("a page opened after several patches hydrates from the registry that holds them", async () => {
    await open();
    for (let round = 0; round < 3; round += 1) {
      await ssr.editSource(probeFile, markProbe, async () => {
        await probeMarked(true);
      });
      await probeMarked(false);
    }
    await open();
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
  }, 120_000);

  test("a server component whose missing import is created afterwards shows it without a reload", async () => {
    await open();
    const extraFile = uiFile("registryExtra.ts");
    try {
      await ssr.editSource(
        serverPartFile,
        (source) =>
          `import { registryExtraText } from "./registryExtra";\n${source.replace("part-0", "{registryExtraText}")}`,
        async () => {
          await ssr.waitFor(() => document.querySelector(".__akan_hmr_overlay[data-status=error]") !== null, {
            timeout: 20_000,
          });
          await Bun.write(extraFile, 'export const registryExtraText = "extra-1";\n');
          await textIs('[data-e2e="server-part"]', "extra-1");
        },
      );
    } finally {
      await rm(extraFile, { force: true });
    }
    await textIs('[data-e2e="server-part"]', "part-0");
    expect(await ssr.reloaded()).toBe(false);
  }, 120_000);

  test("a client component added in the session renders through the registry once the server names it", async () => {
    await open();
    const newFile = uiFile("RegistryNew.tsx");
    try {
      await Bun.write(
        newFile,
        [
          '"use client";',
          'import { useState } from "react";',
          "",
          "interface RegistryNewProps {",
          "  className?: string;",
          "}",
          "export const RegistryNew = ({ className }: RegistryNewProps) => {",
          '  const [value] = useState("new-0");',
          "  return (",
          '    <output className={className} data-e2e="registry-new">',
          "      {value}",
          "    </output>",
          "  );",
          "};",
          "",
        ].join("\n"),
      );
      await ssr.editSource(
        pageFile,
        (source) =>
          source
            .replace("RegistryServerPart }", "RegistryServerPart, RegistryNew }")
            .replace("<RegistryLazy />", "<RegistryLazy />\n      <RegistryNew />"),
        async () => {
          await textIs('[data-e2e="registry-new"]', "new-0");
        },
      );
    } finally {
      await rm(newFile, { force: true });
    }
    expect(await ssr.reloaded()).toBe(false);
  }, 120_000);

  const pageRecovered = async () =>
    await ssr.waitFor(
      () => {
        const state = (window as unknown as RegistryWindow).__akan?.inspect();
        return !!state?.started && !state.failed && document.querySelector('[data-e2e="lazy"]') !== null;
      },
      { timeout: 30_000 },
    );

  test("a store error only the browser hits leaves the page to reload onto the save that fixes it", async () => {
    await open();
    await ssr.editSource(
      storeFile,
      (source) => `${source}\nif (typeof window !== "undefined") throw new Error("e2e store failure");\n`,
      async () => {
        //? The patch re-runs the store and reloads; the reloaded page's registry fails to start on it.
        await ssr.waitFor(() => (window as unknown as RegistryWindow).__akan?.inspect().failed === true, {
          timeout: 30_000,
        });
        await ssr.evaluate(() => {
          (window as unknown as RegistryWindow).__akanE2eBroken = true;
        });
      },
    );
    await pageRecovered();
    expect(await ssr.evaluate(() => (window as unknown as RegistryWindow).__akanE2eBroken ?? false)).toBe(false);
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
  }, 120_000);

  test("a server error page reloads once the save that fixes it lands", async () => {
    await open();
    await ssr.editSource(
      storeFile,
      (source) => `${source}\nthrow new Error("e2e store failure");\n`,
      async () => {
        await ssr.waitFor(() => document.title.startsWith("500"), { timeout: 20_000 });
      },
    );
    await pageRecovered();
  }, 120_000);

  test("a constant both copies render reloads the tab once, onto the server output it changed", async () => {
    await open();
    const bootLog = async () =>
      await ssr.evaluate(
        (prefix: string) => (window.name.startsWith(prefix) ? JSON.parse(window.name.slice(prefix.length)) : null),
        bootLogPrefix,
      );
    await ssr.evaluate((prefix: string) => {
      window.name = `${prefix}${JSON.stringify({ boots: 0, values: [] })}`;
    }, bootLogPrefix);
    try {
      await ssr.editSource(
        valueFile,
        (source) => source.replace("value-0", "value-1"),
        async () => {
          for (const where of ["server", "client"])
            await ssr.waitFor(
              (target: string) =>
                document.querySelector(`[data-e2e="label-${target}"]`)?.getAttribute("data-e2e-value") === "value-1",
              { args: [where], timeout: 30_000 },
            );
          expect(await fetchPage()).toContain('data-e2e-value="value-1"');
          //? A reload sent before the save's pages build would boot on value-0 and need the refresh after it.
          await Bun.sleep(3_000);
          expect(await bootLog()).toEqual({ boots: 1, values: ["value-1"] });
        },
      );
    } finally {
      await ssr.evaluate(() => {
        window.name = "";
      });
    }
    for (const where of ["server", "client"])
      await ssr.waitFor(
        (target: string) =>
          document.querySelector(`[data-e2e="label-${target}"]`)?.getAttribute("data-e2e-value") === "value-0",
        { args: [where], timeout: 30_000 },
      );
    await pageRecovered();
  }, 150_000);

  test("a common/ helper both copies render patches the client and refreshes the server across a backend restart", async () => {
    await open();
    await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
    await textIs('[data-e2e="count"]', "1");
    await ssr.editSource(
      sharedFile,
      (source) => source.replace("shared-0", "shared-1"),
      async () => {
        await textIs('[data-e2e="shared-client"]', "shared-1");
        await textIs('[data-e2e="shared-server"]', "shared-1");
      },
    );
    await textIs('[data-e2e="shared-client"]', "shared-0");
    await textIs('[data-e2e="shared-server"]', "shared-0");
    expect(await ssr.evaluate(() => document.querySelector('[data-e2e="count"]')?.textContent)).toBe("1");
    expect(await ssr.reloaded()).toBe(false);
  }, 150_000);

  const fetchHas = async (endpoint: string) =>
    await ssr
      .evaluate((name: string) => {
        const runtime = (globalThis as unknown as Record<symbol, { runtime?: { fetch?: Record<string, unknown> } }>)[
          Symbol.for("akanjs.client.runtime")
        ];
        return typeof runtime?.runtime?.fetch?.[name] === "function";
      }, endpoint)
      .catch(() => false);
  //? A new tab, reopened until one passes: after a metadata save's restart the dev server serves the registry before
  //? until its builder rebuilds it, and a restarting backend refuses connections for a moment.
  const reopenUntil = async (check: () => Promise<boolean>, timeout = 120_000) => {
    const deadline = Date.now() + timeout;
    while (!(await ssr.open(REGISTRY, { csr: false }).then(check, () => false))) {
      if (Date.now() > deadline) throw new Error("[ssr-registry-e2e] no page opened within the wait passed the check");
      await Bun.sleep(1_000);
    }
  };

  const addEndpoint = (source: string) =>
    source.replace(
      "  benchPing: query(",
      '  e2eRegistryPing: query(String, { guards: [Public], mcp: false }).exec(() => "pong"),\n  benchPing: query(',
    );

  test("a signal save restarts the builder, and the open tab and a new one both get the new endpoint", async () => {
    await open();
    const orphans = sampleOrphanWorkers(ssr.serverGroup);
    //? The component save first keeps the slow lane busy, so the restart lands while a batch is in flight.
    await ssr.editSource(probeFile, markProbe, async () => {
      await Bun.sleep(200);
      await ssr.editSource(signalFile, addEndpoint, async () => {
        //? Not reopened: the rebuilt registry's reload, or hello's epoch once the backend is back, moves it on.
        await ssr.waitFor(
          () =>
            typeof (globalThis as unknown as Record<symbol, { runtime?: { fetch?: Record<string, unknown> } }>)[
              Symbol.for("akanjs.client.runtime")
            ]?.runtime?.fetch?.e2eRegistryPing === "function",
          { timeout: 120_000 },
        );
        await reopenUntil(async () => await fetchHas("e2eRegistryPing"));
      });
    });
    await reopenUntil(async () => !(await fetchHas("e2eRegistryPing")) && (await fetchHas("benchPing")));
    expect(await orphans()).toEqual([]);
  }, 300_000);

  test("a whole build that fails on a broken client module keeps the registry, and the fix brings the endpoint", async () => {
    await open();
    const { epoch } = (await Bun.file(registryManifest).json()) as { epoch: number };
    await ssr.editSource(
      contextFile,
      (source) => `${source}\nexport const registryBroken = ;\n`,
      async () => {
        await ssr.waitFor(() => document.querySelector(".__akan_hmr_overlay[data-status=error]") !== null, {
          timeout: 20_000,
        });
        const mark = await ssr.serverLogMark();
        await ssr.editSource(signalFile, addEndpoint, async () => {
          //? The replacement builder's whole build fails on the broken module, and says so before anything is written.
          await waitForServerLog(mark, /ssr-registry boot build failed/);
          expect(((await Bun.file(registryManifest).json()) as { epoch: number }).epoch).toBe(epoch);
          await Bun.write(
            contextFile,
            (await Bun.file(contextFile).text()).replace("\nexport const registryBroken = ;\n", ""),
          );
          await reopenUntil(async () => await fetchHas("e2eRegistryPing"));
        });
      },
    );
    await reopenUntil(async () => !(await fetchHas("e2eRegistryPing")) && (await fetchHas("benchPing")));
  }, 300_000);

  test("a server-only save after server and client edits keeps rendering the server edit", async () => {
    await open();
    await ssr.editSource(
      serverPartFile,
      (source) => source.replace("part-0", "part-view"),
      async () => {
        await textIs('[data-e2e="server-part"]', "part-view");
        await ssr.editSource(probeFile, markProbe, async () => {
          await probeMarked(true);
          const mark = await ssr.serverLogMark();
          //? A service restarts the backend alone: its RSC worker boots the boot build's bundle, and only the build
          //? replayed to it (the probe's, which changed nothing the server renders) says which bundle is current.
          await ssr.editSource(
            serviceFile,
            (source) => `${source}\n`,
            async () => {
              await waitForServerLog(mark, /\[backend-reload\] restarting backend[\s\S]*backend ready pid=\d+/);
              const deadline = Date.now() + 20_000;
              while (!(await fetchPage().catch(() => "")).includes("part-view")) {
                if (Date.now() > deadline) throw new Error("[ssr-registry-e2e] the restarted backend lost the edit");
                await Bun.sleep(250);
              }
              await textIs('[data-e2e="server-part"]', "part-view");
            },
          );
        });
      },
    );
    await textIs('[data-e2e="server-part"]', "part-0");
    await probeMarked(false);
  }, 180_000);

  test("a client module moved into a folder keeps a new tab hydrating, and so does moving it back", async () => {
    await open();
    const original = await Bun.file(labelFile).text();
    const movedFile = uiFile("RegistryLabel/index.tsx");
    //? A tab that stopped hydrating shows the label but never counts: a new document is tried until one does. Within
    //? the save's own patch and pages build, not whenever a later build happens to heal the registry.
    const hydratesWith = async (label: string) =>
      await reopenUntil(async () => {
        const hydrated = async () => {
          await textIs('[data-e2e="label-client"]', label);
          await ssr.evaluate(() => document.querySelector<HTMLButtonElement>('[data-e2e="bump"]')?.click());
          await textIs('[data-e2e="count"]', "1");
        };
        return await hydrated().then(
          () => true,
          () => false,
        );
      }, 15_000);
    try {
      await rm(labelFile);
      await Bun.write(
        movedFile,
        original.replace("label-0", "label-moved").replace('from "../common/', 'from "../../common/'),
      );
      await hydratesWith("label-moved");
    } finally {
      await rm(path.dirname(movedFile), { recursive: true, force: true });
      await Bun.write(labelFile, original);
    }
    await hydratesWith("label-0");
  }, 180_000);

  test("a tab that reconnects to a restarted dev host before its registry exists reloads onto the new one", async () => {
    await open();
    //? A config save restarts the dev host, which clears `.akan`: the next registry starts over from generation 1,
    //? and the boot build is held back (AKAN_DEV_SSR_ARM_DELAY_MS) so the tab's hello comes before it.
    await ssr.editSource(
      configFile,
      (source) => `${source}\n`,
      async () => {
        const deadline = Date.now() + 90_000;
        while (!(await ssr.reloaded())) {
          if (Date.now() > deadline) throw new Error("[ssr-registry-e2e] the tab never reloaded after the restart");
          await Bun.sleep(250);
        }
        await ssr.waitFor(
          () => {
            const w = window as unknown as RegistryWindow & { __AKAN_RSC_REFRESH__?: unknown };
            const state = w.__akan?.inspect();
            return typeof w.__AKAN_RSC_REFRESH__ === "function" && !!state?.started && !state.failed;
          },
          { timeout: 90_000 },
        );
        await ssr.editSource(probeFile, markProbe, async () => {
          await probeMarked(true);
        });
      },
    );
    await reopenUntil(async () => await fetchHas("benchPing"));
  }, 300_000);

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
