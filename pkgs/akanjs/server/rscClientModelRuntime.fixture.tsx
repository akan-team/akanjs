import { ConstantRegistry, via } from "akanjs/constant";
import { FetchClient } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { Suspense } from "react";
import { registerClientReference, renderToReadableStream } from "react-server-dom-webpack/server.node";

type Handoff = Record<string, unknown>;
const [manifestJson = "{}", modelNames = "", references = "refs"] = process.argv.slice(2);
const [direct = "", promised = "", streamed = ""] = modelNames.split(",");
const models = [direct, promised, streamed];

const reference = <Props,>(key: string) => {
  const [id = "", name = ""] = key.split("#");
  return registerClientReference({}, id, name) as unknown as (props: Props) => null;
};
const View = reference<{ view: Handoff }>("apps/demo/ui/View.tsx#View");
const Units = reference<{ init: Promise<Handoff> }>("apps/demo/ui/Units.tsx#Units");
const New = reference<{ slice: Handoff }>("apps/demo/ui/New.tsx#New");

for (const model of models) {
  const Input = via((field) => ({ name: field(String) }));
  const Obj = via(Input, () => ({}));
  const Light = via(Obj, ["name"] as const, () => ({}));
  const Full = via(Obj, Light, () => ({}));
  ConstantRegistry.buildModel(
    model,
    Input,
    Obj,
    Full,
    Light,
    via(Full, () => ({})),
    {},
  );
}
const signalOf = (prefix: string): SerializedSignal => ({
  prefix,
  slice: { "": { args: [], guards: ["Public"] } },
  getGuards: ["Public"],
  cruGuards: ["Public"],
  endpoint: {},
});
const { fetch } = FetchClient.build({}, Object.fromEntries(models.map((model) => [model, signalOf(model)])), {
  origin: "https://app.example",
});
for (const model of models) {
  fetch.instance.handler[model] = async () => ({ id: `${model}1`, name: "first" });
  fetch.instance.handler[`${model}List`] = async () => [{ id: `${model}1`, name: "first" }];
  fetch.instance.handler[`${model}Insight`] = async () => ({ count: 1 });
}
if (references !== "bare")
  FetchClient.setModelRuntimes(
    Object.fromEntries(
      models.map((model) => [
        model,
        registerClientReference({}, `apps/demo/lib/__client/${model}.ref.ts`, "reference"),
      ]),
    ),
  );

const capitalized = (model: string) => `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
const handoffs = fetch as unknown as Record<string, (...args: unknown[]) => Record<string, Promise<Handoff>>> & {
  slice: Record<string, Handoff>;
};
const copied = references === "copies";
const viewOf = async () => {
  const view = await handoffs[`view${capitalized(direct)}`]?.(`${direct}1`)[`${direct}View`];
  return copied ? { ...view } : view;
};
const initOf = () => {
  const init = handoffs[`init${capitalized(promised)}`]?.()[`${promised}Init`] ?? Promise.resolve({});
  return copied ? init.then((value) => JSON.parse(JSON.stringify(value)) as Handoff) : init;
};
const Late = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const slice = handoffs.slice[streamed] ?? {};
  return <New slice={copied ? structuredClone(slice) : slice} />;
};

const stream = await renderToReadableStream(
  <html lang="en">
    <head />
    <body>
      <main>
        <View view={(await viewOf()) ?? {}} />
        <Units init={initOf()} />
        <Suspense fallback={null}>
          <Late />
        </Suspense>
      </main>
    </body>
  </html>,
  JSON.parse(manifestJson),
);
for await (const chunk of stream) process.stdout.write(chunk);
