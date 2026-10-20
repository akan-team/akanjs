"use client";
import { debugFrame, RouteDefinition, type RouteRender, router, Translator, usePathCtx } from "akanjs/client";
import { isThenable, Logger } from "akanjs/common";
import { createContext, createElement, memo, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { CsrGuards } from "./CsrGuards";
import { CsrFrameDump } from "./csrFrameDump";
import { RenderFailure } from "./RenderFailure";
import { useFetch } from "./useFetch";
import { usePageActivity } from "./usePageActivity";

//? An async render's output is kept between renders, so it is handed a stable outlet rather than the layer below:
//? an element baked into kept output would pin the params it was made with.
const layerChildContext = createContext<ReactNode>(null);
const LayerOutlet = () => useContext(layerChildContext);
const layerOutlet = <LayerOutlet />;

interface RenderedRoute {
  render: RouteRender["render"];
  argsKey: string;
  result: ReactNode | Promise<ReactNode>;
  record: ReturnType<typeof CsrFrameDump.track> | null;
  /** A redirect was issued while the render ran, so what it drew is not the page. */
  redirected: boolean;
  /** The guarded location whose guards refused, so the layer drew nothing for it. */
  refusedKey: string | null;
  /** The guarded location whose guards let the layer draw. */
  admittedKey: string | null;
  /** The render rejected while its page stayed: what the layer draws instead, with a retry. */
  failure: { error: unknown } | null;
}

interface RenderLayerProps {
  renders: RouteRender[];
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
  leaf?: ReactNode;
}
export const RenderLayer = memo((props: RenderLayerProps) => {
  const { renders, index, params, searchParams, leaf = null } = props;
  const isLast = index >= renders.length - 1;
  const children = isLast ? (
    leaf
  ) : (
    <RenderLayer renders={renders} index={index + 1} params={params} searchParams={searchParams} leaf={leaf} />
  );
  const routeRender = renders[index];
  const isAsyncRender = isAsyncRouteRender(routeRender);
  const renderedRef = useRef<RenderedRoute | null>(null);
  const [, setFailures] = useState(0);
  const activity = usePageActivity();
  //? Effects stop while the page is hidden, so a cleanup is the one place that sees it leave the screen.
  const onScreenRef = useRef(activity === "current");
  useEffect(() => {
    onScreenRef.current = activity === "current";
    return () => {
      onScreenRef.current = false;
    };
  }, [activity]);
  //? The context's default is an empty object: bootCsr renders root layouts outside any page's wrapper.
  const location = (usePathCtx() as Partial<ReturnType<typeof usePathCtx>>).location;
  const path = location?.pathRoute.path ?? "the root";
  //? A pushed entry renders before the URL moves to it, so its route renders read its own path through usePage().
  const renderPath = entryPathOf(location?.pathname);
  //? A page's layers wait for its route guards; the root layouts, drawn once for every page, do not. A sync layer
  //? waits too: under a root layout's guard, a legacy page is the only layer its location has.
  const guarded = location && CsrGuards.declared(location) ? location : null;
  const guardKey = guarded ? CsrGuards.keyOf(guarded) : null;
  useEffect(() => (guardKey ? CsrGuards.hold(guardKey) : undefined), [guardKey]);
  //? Once let in, a sync layer draws at once with the props it is handed, so typing into a URL-bound field never lags
  //? behind a check; while its location is checked again, it keeps the props it was let in with.
  const isSyncAdmitted = !isAsyncRender && !!guardKey && CsrGuards.admitted(guardKey);
  const admittedPropsRef = useRef({ params, searchParams });
  if (isSyncAdmitted) admittedPropsRef.current = { params, searchParams };
  if ((isAsyncRender || (guarded && !isSyncAdmitted)) && routeRender) {
    const argsKey = isAsyncRender
      ? RouteDefinition.renderArgsKey(
          routeRender.render,
          { params, searchParams },
          { isPage: routeRender.kind === "page", paramNames: routeRender.paramNames },
        )
      : (guardKey ?? "");
    const rendered = renderedRef.current;
    //? A cached page back on screen reruns a render that redirected: signed out, a layout redirects to the sign-in
    //? page, and kept, it would stay blank after the sign-in brings the person back.
    const returned = activity === "current" && !onScreenRef.current;
    //? A guard may move the router within its own route (a merged id, a defaulted query), which keeps this layer
    //? mounted with args it does not read: the location it refused is gone, so it asks the new one.
    const moved = !!rendered?.refusedKey && rendered.refusedKey !== guardKey;
    //? A sync layer whose verdict lapsed while its page was off screen asks again before it draws new props.
    const lapsed = !isAsyncRender && !!guardKey && rendered?.admittedKey === guardKey && !CsrGuards.asked(guardKey);
    //? Rerun only when the render itself (a hot update) or the args it reads change: any other re-render would refetch.
    if (
      !rendered ||
      rendered.render !== routeRender.render ||
      rendered.argsKey !== argsKey ||
      (returned && rendered.redirected) ||
      moved ||
      lapsed
    ) {
      const redirectsBefore = router.redirectCount();
      const layer = `${routeRender.kind ?? "layout"} ${index} of ${path}`;
      let refusedKey: string | null = null;
      let admittedKey: string | null = null;
      const draw = () =>
        isAsyncRender
          ? Translator.renderAt(
              renderPath,
              () => routeRender.render({ children: layerOutlet, params, searchParams } as never) ?? null,
            )
          : true;
      const result = reportFailure(
        guarded
          ? CsrGuards.of(guarded).then((admitted) => {
              if (admitted) admittedKey = guardKey;
              else refusedKey = guardKey;
              return admitted ? draw() : null;
            })
          : draw(),
        layer,
      );
      const next: RenderedRoute = {
        render: routeRender.render,
        argsKey,
        result,
        record: isThenable(result) ? CsrFrameDump.track(layer, result as Promise<ReactNode>) : null,
        redirected: false,
        refusedKey: null,
        admittedKey: null,
        failure: null,
      };
      if (isThenable(result))
        (result as Promise<ReactNode>).then(
          () => {
            next.refusedKey = refusedKey;
            next.admittedKey = admittedKey;
            next.redirected = !!refusedKey || router.redirectCount() !== redirectsBefore;
          },
          (error: unknown) => {
            if (router.redirectCount() !== redirectsBefore || renderedRef.current !== next) return;
            next.failure = { error };
            setFailures((count) => count + 1);
          },
        );
      renderedRef.current = next;
    }
  }
  const { value, fulfilled } = useFetch(renderedRef.current?.result ?? null, { keepPrevious: true });
  const record = renderedRef.current?.record ?? null;
  if (record && fulfilled) record.delivered = true;
  useEffect(() => {
    if (!record) return;
    record.subscribed = true;
    return () => {
      record.subscribed = false;
    };
  }, [record]);
  if (!routeRender) return null;
  if (!isAsyncRender && (!guarded || isSyncAdmitted))
    return createElement(routeRender.render as never, { children, params, searchParams } as never);
  const failure = renderedRef.current?.failure;
  if (failure)
    return (
      <RenderFailure
        error={failure.error}
        onRetry={() => {
          renderedRef.current = null;
          setFailures((count) => count + 1);
        }}
      />
    );
  if (!value) return <>{Translator.renderAt(renderPath, () => composeLoadingFallback(renders.slice(index), params))}</>;
  if (!isAsyncRender)
    return createElement(routeRender.render as never, { children, ...admittedPropsRef.current } as never);
  return <layerChildContext.Provider value={children}>{value}</layerChildContext.Provider>;
});

//? useFetch drops a rejection, so a render that throws would leave its layer blank with nothing in the console.
function reportFailure(result: ReactNode | Promise<ReactNode>, layer: string): ReactNode | Promise<ReactNode> {
  if (!isThenable(result)) return result;
  debugFrame("layer.render", { layer });
  (result as Promise<ReactNode>).then(
    () => debugFrame("layer.settle", { layer }),
    (error: unknown) => {
      debugFrame("layer.fail", { layer, message: error instanceof Error ? error.message : String(error) });
      Logger.error(
        `render of ${layer} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    },
  );
  return result;
}

//? window.location.pathname is percent-encoded while a pushed href may arrive raw.
function entryPathOf(pathname: string | undefined): string | undefined {
  if (!pathname) return pathname;
  return new URL(`http://localhost${pathname}`).pathname;
}

function isAsyncRouteRender(routeRender?: RouteRender): boolean {
  return Boolean(routeRender?.isAsync || routeRender?.render.constructor.name === "AsyncFunction");
}

function composeLoadingFallback(renders: RouteRender[], params: Record<string, string>): ReactNode {
  let element: ReactNode = null;
  for (let i = renders.length - 1; i >= 0; i--) {
    const Loading = renders[i]?.Loading;
    if (!Loading) continue;
    element = Loading({ params, children: element } as never) as ReactNode;
  }
  return element;
}
