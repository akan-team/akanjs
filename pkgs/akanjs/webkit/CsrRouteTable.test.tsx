import { afterEach, describe, expect, test } from "bun:test";
import type { Device, PathRoute, RouteRender } from "akanjs/client";
import { RouteTreeBuilder } from "../server/routeTreeBuilder";
import { type CsrRouteContext, CsrRouteTable } from "./CsrRouteTable";

const device = { info: { platform: "web" }, topSafeArea: 0, bottomSafeArea: 0 } as unknown as Device;
const layout = (label: string) => async () => ({ default: () => label });
const page = (label: string) => async () => ({ default: () => label });
const overrides = (label: string) => async () => ({ default: Object.assign(() => null, { label }) });
const originalBasePaths = process.env.AKAN_PUBLIC_BASE_PATHS;

//? A layout is named by what its render returns: SSR wraps each module in a lazy render, CSR holds the module's own,
//? and an overrides render is the wrapper's element on the server, the wrapper itself in CSR.
const labelsOf = async (renders: RouteRender[]) =>
  await Promise.all(
    renders.map(async (render) => {
      const result = (await (render.render as (props: unknown) => unknown)({
        params: {},
        searchParams: {},
        children: null,
      })) as string | { type?: { label?: string } } | null;
      if (typeof result === "string") return result;
      return result?.type?.label ?? (render.render as { label?: string }).label ?? String(result);
    }),
  );
const layeringOf = async (routes: PathRoute[]) =>
  Object.fromEntries(
    await Promise.all(
      routes.map(
        async (route) =>
          [
            route.path,
            { root: await labelsOf(route.renderRootLayouts), layouts: await labelsOf(route.renderLayouts) },
          ] as const,
      ),
    ),
  );
const bothSides = async (
  context: CsrRouteContext,
  { basePaths, current }: { basePaths?: string[]; current?: string } = {},
) => {
  process.env.AKAN_PUBLIC_BASE_PATHS = basePaths?.join(",") ?? "";
  const csr = await CsrRouteTable.boot(context, { device, basePaths: basePaths ?? null, currentBasePath: current });
  const csrLayering = await layeringOf(csr.snapshot().pathRoutes);
  const ssrLayering = await layeringOf(
    new RouteTreeBuilder(context as never).build().filter((route) => route.path in csrLayering),
  );
  return { ssr: ssrLayering, csr: csrLayering };
};

afterEach(() => {
  process.env.AKAN_PUBLIC_BASE_PATHS = originalBasePaths;
});

describe("CsrRouteTable lays out a page as the SSR route tree does", () => {
  test("an app whose root layout sits in a route group (page/(app)/_layout.tsx)", async () => {
    const { ssr, csr } = await bothSides({
      "./(app)/__root_layout.tsx": layout("app-root"),
      "./(app)/(public)/_layout.tsx": layout("public"),
      "./(app)/(public)/_index.tsx": page("index"),
      "./(app)/(public)/dashboard.tsx": page("dashboard"),
      "./(app)/(public)/mission/__root_layout.tsx": layout("mission"),
      "./(app)/(public)/mission/_index.tsx": page("mission"),
    });
    expect(csr).toEqual(ssr);
    //? In CSR the root layout's provider renders pages in a frame of its own and hides what it wraps: a layout that
    //? wraps pages (a lock screen, a nav) must be a page layout, and so must a nested root boundary.
    expect(csr["/:lang/dashboard"]).toEqual({ root: ["app-root"], layouts: ["public"] });
    expect(csr["/:lang/mission"]).toEqual({ root: ["app-root"], layouts: ["public", "mission"] });
  });

  test("an overrides manifest above a grouped root layout stays outside it", async () => {
    const { ssr, csr } = await bothSides({
      "./_overrides.tsx": overrides("overrides"),
      "./(app)/__root_layout.tsx": layout("app-root"),
      "./(app)/(public)/_layout.tsx": layout("public"),
      "./(app)/(public)/dashboard.tsx": page("dashboard"),
    });
    expect(csr).toEqual(ssr);
    expect(csr["/:lang/dashboard"]).toEqual({ root: ["overrides", "app-root"], layouts: ["public"] });
  });

  test("an app whose root layout is page/_layout.tsx, with a grouped root boundary under it", async () => {
    const { ssr, csr } = await bothSides({
      "./__root_layout.tsx": layout("root"),
      "./(tab)/__root_layout.tsx": layout("tab"),
      "./(tab)/explore.tsx": page("explore"),
      "./detail/_layout.tsx": layout("detail"),
      "./detail/_index.tsx": page("detail"),
      "./_index.tsx": page("index"),
    });
    expect(csr).toEqual(ssr);
    expect(csr["/:lang/explore"]).toEqual({ root: ["root"], layouts: ["tab"] });
    expect(csr["/:lang/detail"]).toEqual({ root: ["root"], layouts: ["detail"] });
  });

  test("a basePath's own root layout, with the other basePath's pages left out", async () => {
    const { ssr, csr } = await bothSides(
      {
        "./admin/__root_layout.tsx": layout("admin-root"),
        "./admin/users.tsx": page("users"),
        "./admin/settings/_layout.tsx": layout("settings"),
        "./admin/settings/_index.tsx": page("settings"),
        "./shop/__root_layout.tsx": layout("shop-root"),
        "./shop/cart.tsx": page("cart"),
      },
      { basePaths: ["admin", "shop"], current: "admin" },
    );
    expect(csr).toEqual(ssr);
    expect(Object.keys(csr).sort()).toEqual(["/:lang/admin/settings", "/:lang/admin/users"]);
    expect(csr["/:lang/admin/settings"]).toEqual({ root: ["admin-root"], layouts: ["settings"] });
  });

  test("routes a lib syncs in under (libs)/(<lib>) keep the app's root layout", async () => {
    const { ssr, csr } = await bothSides({
      "./__root_layout.tsx": layout("root"),
      "./(libs)/(shared)/login/_index.tsx": page("login"),
      "./(libs)/(shared)/oauth/consent.tsx": page("consent"),
      "./_index.tsx": page("index"),
    });
    expect(csr).toEqual(ssr);
    expect(csr["/:lang/login"]).toEqual({ root: ["root"], layouts: [] });
    expect(csr["/:lang/oauth/consent"]).toEqual({ root: ["root"], layouts: [] });
  });
});
