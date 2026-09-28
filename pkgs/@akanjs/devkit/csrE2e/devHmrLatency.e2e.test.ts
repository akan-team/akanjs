import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HmrTrace } from "akanjs/server";
import { CsrE2eHarness } from "./csrE2eHarness.fixture";

//? A measurement, not a check: it runs with AKAN_HMR_LATENCY=1 and writes its report to local/csr-e2e.
const enabled = CsrE2eHarness.enabled && process.env.AKAN_HMR_LATENCY === "1";
const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const port = Number(process.env.AKAN_HMR_LATENCY_PORT ?? 8492);
const runs = Number(process.env.AKAN_HMR_LATENCY_RUNS ?? 5);
const probeFile = path.join(workspaceRoot, "apps/minimal/ui/StackProbe.tsx");
const pageFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/stack/tab-a.tsx");
const layoutFile = path.join(workspaceRoot, "apps/minimal/page/(home)/e2e/_layout.tsx");
const probe = `document.querySelector('[data-e2e-probe="tab-a"]')`;
const input = `document.querySelector('[data-e2e-probe="tab-a"] input')`;

interface TraceEntry {
  kind: string;
  generation: number;
  trace: HmrTrace | null;
  receivedAt: number;
  appliedAt: number | null;
}

interface LatencyWindow {
  __latencyProbe?: { hit: number };
  __latencySeen?: Record<string, number>;
  __latencyObserver?: MutationObserver;
  __AKAN_HMR_TRACES__?: TraceEntry[];
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; appliedAt?: number; refreshedAt?: number };
}

interface Sample {
  total: number;
  stages: Record<string, number>;
  updates: number;
}

interface Edit {
  file: string;
  transform: (source: string) => string;
  applied: string;
  restored: string;
  write?: (file: string, content: string) => Promise<void>;
  restore?: boolean;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const summarize = (samples: Sample[]) => {
  const stageNames = [...new Set(samples.flatMap((sample) => Object.keys(sample.stages)))];
  return {
    total: { median: median(samples.map((sample) => sample.total)), samples: samples.map((sample) => sample.total) },
    stages: Object.fromEntries(
      stageNames.map((name) => [
        name,
        median(samples.flatMap((sample) => (name in sample.stages ? [sample.stages[name] ?? 0] : []))),
      ]),
    ),
    updates: samples.map((sample) => sample.updates),
  };
};

//? Durations between the marks one update collected, in hop order; a mark a path does not reach is skipped.
const stagesOf = (
  writtenAt: number,
  hit: number,
  entry: TraceEntry | undefined,
  applied: LatencyWindow["__AKAN_CSR_LAST_UPDATE__"],
) => {
  const trace = entry?.trace ?? {};
  const marks: [string, number | null | undefined][] = [
    ["event", trace.eventAt],
    ["flush", trace.flushAt],
    ["batch", trace.batchAt],
    ["spawn", trace.spawnAt],
    ["workerStart", trace.workerStartAt],
    ["worker", trace.workerAt],
    ["patch", trace.patchAt],
    ["sent", trace.sentAt],
    ["broadcast", trace.broadcastAt],
    ["received", entry?.receivedAt],
    ["applied", applied?.appliedAt ?? entry?.appliedAt],
    ["refreshed", applied?.refreshedAt],
    ["dom", hit],
  ];
  const stages: Record<string, number> = {};
  let previous = { name: "write", at: writtenAt };
  for (const [name, at] of marks) {
    if (typeof at !== "number" || at < previous.at) continue;
    stages[`${previous.name}→${name}`] = at - previous.at;
    previous = { name, at };
  }
  return stages;
};

const writeAtomic = async (file: string, content: string) => {
  const temp = `${file}.latency-tmp`;
  await Bun.write(temp, content);
  await rename(temp, file);
};

describe.skipIf(!enabled)("dev HMR latency (minimal)", () => {
  let csr: CsrE2eHarness | null = null;
  const harness = () => {
    if (!csr) throw new Error("[hmr-latency] the harness did not start");
    return csr;
  };
  const loadBefore = os.loadavg();
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    csr = await CsrE2eHarness.start({ app: "minimal", port, workspaceRoot });
  }, 240_000);

  afterAll(async () => {
    await csr?.close();
    const summary = {
      at: new Date().toISOString(),
      bun: Bun.version,
      platform: `${process.platform}-${process.arch}`,
      cpus: os.cpus().length,
      loadavg: { before: loadBefore, after: os.loadavg() },
      debounceMs: process.env.AKAN_DEV_WATCH_DEBOUNCE_MS ?? "80 (default)",
      backend: process.env.AKAN_CSR_E2E_BACKEND ?? (process.platform === "darwin" ? "webkit" : "chrome"),
      runs,
      ...report,
    };
    const dir = path.join(workspaceRoot, "local", "csr-e2e");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `hmr-latency-${Date.now()}.json`);
    await Bun.write(file, `${JSON.stringify(summary, null, 2)}\n`);
    console.info(`[hmr-latency] report: ${file}`);
    console.info(JSON.stringify(summary));
  }, 60_000);

  const armProbe = async (expression: string) =>
    await harness().evaluate((source: string) => {
      const predicate = new Function(`return (${source});`) as () => boolean;
      const state: { hit: number } = { hit: 0 };
      (window as unknown as LatencyWindow).__latencyProbe = state;
      const check = () => {
        if (!state.hit && predicate()) state.hit = Date.now();
      };
      const observer = new MutationObserver(check);
      observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      const tick = () => {
        check();
        if (state.hit) observer.disconnect();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return true;
    }, expression);

  const waitForHit = async () =>
    await harness().waitFor(() => ((window as unknown as LatencyWindow).__latencyProbe?.hit ?? 0) > 0, {
      timeout: 30_000,
    });

  const timeEdit = async (
    {
      file,
      transform,
      applied,
      restored,
      write = async (target, content) => {
        await Bun.write(target, content);
      },
      restore = true,
    }: Edit,
    kinds: string[],
  ) => {
    const original = await Bun.file(file).text();
    await armProbe(applied);
    const writtenAt = Date.now();
    await write(file, transform(original));
    await waitForHit();
    const page = await harness().evaluate(() => {
      const w = window as unknown as LatencyWindow;
      return { hit: w.__latencyProbe?.hit ?? 0, traces: w.__AKAN_HMR_TRACES__ ?? [], last: w.__AKAN_CSR_LAST_UPDATE__ };
    });
    const updates = page.traces.filter((entry) => kinds.includes(entry.kind) && entry.receivedAt >= writtenAt);
    const entry = updates.filter((candidate) => candidate.receivedAt <= page.hit).at(-1);
    const applies = entry && page.last?.generation === entry.generation ? page.last : undefined;
    if (restore) {
      await armProbe(restored);
      await Bun.write(file, original);
      await waitForHit();
    }
    await Bun.sleep(1_500);
    return {
      total: page.hit - writtenAt,
      stages: stagesOf(writtenAt, page.hit, entry, applies),
      updates: updates.length,
    } satisfies Sample;
  };

  const componentEdit = (value: string): Edit => ({
    file: probeFile,
    transform: (source) => source.replace("data-e2e-probe={name}>", `data-e2e-probe={name} data-e2e-hot="${value}">`),
    applied: `${probe}?.getAttribute("data-e2e-hot") === "${value}"`,
    restored: `${probe}?.getAttribute("data-e2e-hot") === null`,
  });

  const pageEdit = (value: string): Edit => ({
    file: pageFile,
    transform: (source) => source.replace('name="tab-a"', `name="tab-a" itemId="${value}"`),
    applied: `${probe}?.querySelector('[data-e2e="item-id"]')?.textContent === "${value}"`,
    restored: `${probe}?.querySelector('[data-e2e="item-id"]')?.textContent === ""`,
  });

  //? SSR first: the first CSR page arms per-save CSR builds, which would then run ahead of pages in every batch.
  //? Component edits never return to a version the page already loaded: a client-refresh re-imports content-hashed
  //? chunk URLs, and a URL the browser imported before resolves to the module it already ran, so an undo is a no-op.
  test("SSR tab: component and page edits", async () => {
    const ssrKinds = ["client-refresh", "rsc-refresh"];
    await harness().open("/e2e/stack/tab-a", { csr: false });
    await Bun.sleep(1_000);
    const component: Sample[] = [];
    const page: Sample[] = [];
    const pristine = await Bun.file(probeFile).text();
    for (let i = 0; i < runs; i += 1) {
      const edit = componentEdit(`s${i}`);
      component.push(await timeEdit({ ...edit, transform: () => edit.transform(pristine), restore: false }, ssrKinds));
    }
    await Bun.write(probeFile, pristine);
    await armProbe(`${probe}?.getAttribute("data-e2e-hot") === null`);
    const undoApplied = await harness()
      .waitFor(() => ((window as unknown as LatencyWindow).__latencyProbe?.hit ?? 0) > 0, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    for (let i = 0; i < runs; i += 1) page.push(await timeEdit(pageEdit(`s${i}`), ssrKinds));
    report.ssr = {
      component: summarize(component),
      page: summarize(page),
      undoApplied,
      reloaded: await harness().reloaded(),
    };
    expect(await harness().reloaded()).toBe(false);
  }, 600_000);

  test("CSR tab: component, page, layout and Tailwind class edits", async () => {
    await harness().open("/e2e/stack/tab-a");
    await Bun.sleep(1_000);
    const samples: { component: Sample[]; page: Sample[]; layout: Sample[]; tailwind: Sample[] } = {
      component: [],
      page: [],
      layout: [],
      tailwind: [],
    };
    for (let i = 0; i < runs; i += 1) {
      samples.component.push(await timeEdit(componentEdit(`v${i}`), ["csr"]));
      samples.page.push(await timeEdit(pageEdit(`v${i}`), ["csr"]));
      samples.layout.push(
        await timeEdit(
          {
            file: layoutFile,
            transform: (source) => source.replace("<>{children}</>", `<>{children}<span data-e2e-layout="v${i}" /></>`),
            applied: `document.querySelector('[data-e2e-layout="v${i}"]') !== null`,
            restored: `document.querySelector('[data-e2e-layout]') === null`,
          },
          ["csr"],
        ),
      );
      //? An arbitrary value no other file uses: the rule exists only after the css build, the class alone changes nothing.
      const padding = 11 + i;
      samples.tailwind.push(
        await timeEdit(
          {
            file: probeFile,
            transform: (source) => source.replace("bg-background p-2", `bg-background p-[${padding}px]`),
            applied: `${input} && getComputedStyle(${input}).paddingTop === "${padding}px"`,
            restored: `${input} && getComputedStyle(${input}).paddingTop !== "${padding}px"`,
          },
          ["csr"],
        ),
      );
    }
    report.csr = Object.fromEntries(Object.entries(samples).map(([name, list]) => [name, summarize(list)]));
    expect(await harness().reloaded()).toBe(false);
  }, 600_000);

  test("CSR tab: ten saves 300ms apart", async () => {
    const original = await Bun.file(probeFile).text();
    await harness().evaluate(() => {
      const w = window as unknown as LatencyWindow;
      const seen: Record<string, number> = {};
      w.__latencySeen = seen;
      const check = () => {
        const value = document.querySelector('[data-e2e-probe="tab-a"]')?.getAttribute("data-e2e-hot");
        if (value && !(value in seen)) seen[value] = Date.now();
      };
      w.__latencyObserver = new MutationObserver(check);
      w.__latencyObserver.observe(document, { subtree: true, attributes: true, childList: true });
    });
    const writtenAt: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      writtenAt.push(Date.now());
      await Bun.write(probeFile, componentEdit(`c${i}`).transform(original));
      await Bun.sleep(300);
    }
    await harness().waitFor(() => (window as unknown as LatencyWindow).__latencySeen?.c9 !== undefined, {
      timeout: 60_000,
    });
    const seen = await harness().evaluate(() => {
      const w = window as unknown as LatencyWindow;
      w.__latencyObserver?.disconnect();
      return w.__latencySeen ?? {};
    });
    await Bun.write(probeFile, original);
    await Bun.sleep(2_000);
    //? A value the page never showed was overtaken; its save counts until the first later value appeared.
    const latencies = writtenAt.map((at, i) => {
      const later = Object.entries(seen)
        .filter(([value]) => Number(value.slice(1)) >= i)
        .map(([, hitAt]) => hitAt);
      return Math.min(...later) - at;
    });
    report.consecutive = {
      latencies,
      median: median(latencies),
      shown: Object.keys(seen).sort(),
      settledAfterLastSave: (seen.c9 ?? 0) - (writtenAt.at(-1) ?? 0),
    };
    expect(await harness().reloaded()).toBe(false);
  }, 300_000);

  test("CSR tab: an editor's atomic save and a formatter's second write", async () => {
    const atomic: Sample[] = [];
    const doubled: Sample[] = [];
    for (let i = 0; i < runs; i += 1) {
      atomic.push(await timeEdit({ ...componentEdit(`a${i}`), write: writeAtomic }, ["csr"]));
      doubled.push(
        await timeEdit(
          {
            ...componentEdit(`d${i}b`),
            write: async (file, content) => {
              await Bun.write(file, content.replace(`d${i}b`, `d${i}a`));
              await Bun.sleep(30);
              await Bun.write(file, content);
            },
          },
          ["csr"],
        ),
      );
    }
    report.editorWrites = { atomic: summarize(atomic), formatterSecondWrite: summarize(doubled) };
    expect(await harness().reloaded()).toBe(false);
  }, 600_000);
});
