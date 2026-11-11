import { type ReactNode, Suspense } from "react";
import { registerClientReference } from "react-server-dom-webpack/server.node";
import { page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

const clientReference = <Props,>(id: string, name: string) =>
  registerClientReference(
    (_: Props): ReactNode => {
      throw new Error(`${name} is a client component`);
    },
    id,
    name,
  );
const LevelBoundary = clientReference<{ children?: ReactNode }>("rootlevel/levelBoundary", "RouteLevelBoundary");
const RouterBridge = clientReference<object>("rootlevel/client", "RouterBridge");
const UsesId = clientReference<object>("rootlevel/client", "UsesId");

type UserLayout = (props: { children?: ReactNode }) => ReactNode | Promise<ReactNode>;

//? The generated System root layout's shape: System.Provider renders the router's bridge beside the app's layout.
const generatedRoot =
  (UserLayout: UserLayout, { bounded = true, loading = false }: { bounded?: boolean; loading?: boolean } = {}) =>
  async () => ({
    default: ({ children }: { children?: ReactNode }) => {
      const layout = <UserLayout>{children}</UserLayout>;
      return (
        <div id="provider">
          {bounded ? <LevelBoundary>{layout}</LevelBoundary> : layout}
          <RouterBridge />
        </div>
      );
    },
    LevelBoundary,
    ...(loading ? { Loading: () => <i>root loading</i> } : {}),
  });

const withIds: UserLayout = ({ children }) => (
  <section id="user">
    <UsesId />
    {children}
  </section>
);
const LateWidget = async () => {
  await Bun.sleep(40);
  throw new Error("root widget broke");
};
const plainPage = (id: string) => async () => ({ default: page().render(() => <p id={id}>page</p>) });

export const pages: PagesContext = {
  "./(bounded)/__root_layout.tsx": generatedRoot(withIds),
  "./(bounded)/ids.tsx": plainPage("ids"),
  "./(bare)/__root_layout.tsx": generatedRoot(withIds, { bounded: false }),
  "./(bare)/bareids.tsx": plainPage("ids"),
  "./(late)/__root_layout.tsx": generatedRoot(
    async () => {
      await Bun.sleep(30);
      throw new Error("root layout broke");
    },
    { loading: true },
  ),
  "./(late)/rootlate.tsx": plainPage("late"),
  "./(widget)/__root_layout.tsx": generatedRoot(({ children }) => (
    <section id="user">
      <Suspense fallback={<i>widget loading</i>}>
        <LateWidget />
      </Suspense>
      {children}
    </section>
  )),
  "./(widget)/rootwidget.tsx": plainPage("widget"),
  "./(moved)/__root_layout.tsx": generatedRoot(
    async () => {
      await Bun.sleep(30);
      return router.redirect("/elsewhere");
    },
    { loading: true },
  ),
  "./(moved)/rootmoved.tsx": plainPage("moved"),
  "./(gone)/__root_layout.tsx": generatedRoot(
    async () => {
      await Bun.sleep(30);
      return router.notFound();
    },
    { loading: true },
  ),
  "./(gone)/rootgone.tsx": plainPage("gone"),
  "./(early)/__root_layout.tsx": generatedRoot(() => router.redirect("/elsewhere")),
  "./(early)/rootearly.tsx": plainPage("early"),
};
