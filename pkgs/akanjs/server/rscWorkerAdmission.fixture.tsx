import fs from "node:fs";
import path from "node:path";
import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import { metricRegistry } from "./metrics/metricRegistry";
import type { PagesContext } from "./routeTreeBuilder";

const started = metricRegistry.counter("akan_test_admission_renders_total", "Renders that started, by page.", ["name"]);

const flag = (name: string) => path.join(process.env.AKAN_TEST_ADMISSION_DIR ?? "", name);
const raised = (name: string) => fs.existsSync(flag(name));

const untilRaised = async (name: string) => {
  while (!raised(name)) await Bun.sleep(5);
};

const Pending = async () => {
  await new Promise<never>(() => undefined);
  return null;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./quick/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(({ name }) => {
        started.inc({ name });
        fs.appendFileSync(flag("start-order"), `${name}\n`);
        return <p>{`quick ${name}`}</p>;
      }),
  }),
  "./held/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(async ({ name }) => {
        started.inc({ name });
        await untilRaised(`release-${name}`);
        return <p>{`held ${name}`}</p>;
      }),
  }),
  //? Spins without yielding, so the worker reads nothing the host sends until `go` is raised.
  "./spinning/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(async ({ name }) => {
        started.inc({ name });
        await untilRaised(`spin-${name}`);
        fs.writeFileSync(flag(`spinning-${name}`), "");
        while (!raised(`go-${name}`));
        return <p>{`spun ${name}`}</p>;
      }),
  }),
  "./failing/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(async ({ name }) => {
        started.inc({ name });
        await Bun.sleep(10);
        throw new Error(`failing ${name}`);
      }),
  }),
  "./broken/[name].tsx": async () => {
    throw new Error("broken page module");
  },
  "./stuck/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(({ name }) => {
        started.inc({ name });
        return (
          <main>
            <p>{`stuck ${name}`}</p>
            <Suspense fallback={<i>loading</i>}>
              <Pending />
            </Suspense>
          </main>
        );
      }),
  }),
  "./long/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(({ name }) => {
        started.inc({ name });
        return (
          <ul>
            {Array.from({ length: 4_000 }, (_, index) => (
              <li key={index}>{`row ${index} of the long page `.repeat(8)}</li>
            ))}
          </ul>
        );
      }),
  }),
};
