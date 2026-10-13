import path from "node:path";
import { createRequestStore } from "../fetch/requestStorage";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import type { SsrManifest } from "./ssrTypes";

const probeId = "/request-probe.js";
const probePath = path.join(import.meta.dir, "ssrRequestProbe.fixture.tsx");
const ssrManifest: SsrManifest = {
  moduleLoading: null,
  moduleMap: {
    [probeId]: { RequestProbe: { id: probePath, chunks: [probePath, probePath], name: "RequestProbe", async: true } },
  },
};
const encoder = new TextEncoder();
const shellRows = [
  `1:"$Sreact.suspense"`,
  `0:["$","html",null,{"children":["$","body",null,{"children":["$","$1",null,{"fallback":["$","i",null,{"children":"wait"}],"children":"$L2"}]}]}]`,
];
const lateRows = (label: string) => [
  `3:I["${probeId}",[],"RequestProbe",1]`,
  `2:[["$","$L3","streamed",{"label":"${label}"}],["$","$L3","suspended",{"label":"${label}-use","suspendMs":30}]]`,
];

//? Fed from a timer outside every request scope, as the host forwards the worker's chunks from its IPC handler.
const flight = (label: string, lateRowMs: number) =>
  new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${shellRows.join("\n")}\n`));
      await Bun.sleep(lateRowMs);
      controller.enqueue(encoder.encode(`${lateRows(label).join("\n")}\n`));
      controller.close();
    },
  });

const renderProbes = async (label: string, lateRowMs: number) => {
  const request = new Request(`http://localhost/en/${label}`, { headers: { cookie: `who=${label}` } });
  const html = await new SsrFromRscRenderer().render({
    request,
    requestStore: createRequestStore(request),
    rscStream: flight(label, lateRowMs),
    ssrManifest,
    bootstrapModules: [],
  });
  const text = await new Response(html).text();
  return [...text.matchAll(/<b>([^<]*)<\/b>/g)].map(([, probe]) => probe).sort((a, b) => a.localeCompare(b));
};

export const renderOverlappingVisitors = async () => {
  const alice = renderProbes("alice", 100);
  await Bun.sleep(20);
  const bob = renderProbes("bob", 300);
  const [aliceProbes, bobProbes] = await Promise.all([alice, bob]);
  return { alice: aliceProbes, bob: bobProbes };
};

if (import.meta.main) {
  console.info(JSON.stringify(await renderOverlappingVisitors()));
  process.exit(0);
}
