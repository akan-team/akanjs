import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

let holdNextRender = true;

const LateContent = async () => {
  if (holdNextRender) {
    holdNextRender = false;
    await new Promise<never>(() => undefined);
  }
  return <p>late content</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./plain.tsx": async () => ({ default: page().render(() => <p>plain content</p>) }),
  "./suspending.tsx": async () => ({
    default: page().render(() => (
      <Suspense fallback={<i>streaming</i>}>
        <LateContent />
      </Suspense>
    )),
  }),
};
