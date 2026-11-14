import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

//? Still pending when the shell is written, each is a Flight row of its own; one promise settles them in one task.
const Row = async ({ index, until }: { index: number; until: Promise<void> }) => {
  await until;
  return <li>{`row ${index} of the list `.repeat(12)}</li>;
};

const Late = async () => {
  await Bun.sleep(400);
  return <p>late content</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./rows.tsx": async () => ({
    default: page().render(() => {
      const until = Bun.sleep(50);
      return (
        <ul>
          {Array.from({ length: 400 }, (_, index) => (
            <Row key={index} index={index} until={until} />
          ))}
        </ul>
      );
    }),
  }),
  "./slow.tsx": async () => ({
    default: page().render(() => (
      <main>
        <p>shell content</p>
        <Suspense fallback={<i>waiting</i>}>
          <Late />
        </Suspense>
      </main>
    )),
  }),
};
