"use client";
import { debugFrame, RouteDefinition, type RouteRender, router, Translator, usePathCtx } from "akanjs/client";
import { isThenable, Logger } from "akanjs/common";
import {
  createContext,
  createElement,
  memo,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CsrGuards } from "./CsrGuards";
import { CsrFrameDump } from "./csrFrameDump";
import { CsrPageReadiness } from "./csrPageReadiness";
import { CsrRefresh } from "./csrRefresh";
import { RenderFailure } from "./RenderFailure";
import { useFetch } from "./useFetch";
import { usePageActivity } from "./usePageActivity";

//? An async render's output is kept between renders, so it is handed a stable outlet rather than the layer below:
//? an element baked into kept output would pin the params it was made with.
const layerChildContext = createContext<ReactNode>(null);
const LayerOutlet = () => useContext(layerChildContext);
const layerOutlet = <LayerOutlet />;
//? A render reads params and search, never the output above it, so a fresh layer starts the async ones under it at once.
//? Scoped to the run that started them, so a layer mounted again later never takes a run from an earlier visit.
const prestartContext = createContext<Map<number, RenderedRoute> | null>(null);

interface RenderedRoute {
  render: RouteRender["render"];
  argsKey: string;
  result: ReactNode | Promise<ReactNode>;
  record: ReturnType<typeof CsrFrameDump.track> | null;
  /** A redirect was issued while the render ran, so what it drew is not the page. */
  redirected: boolean;
  /** The location (entry and href) whose guards refused, so the layer drew nothing for it. */
  refusedAt: string | null;
  /** The guard key whose verdict let the layer draw. */
  admittedKey: string | null;
  /** The render rejected while its page stayed: what the layer draws instead, with a retry. */
  failure: { error: unknown } | null;
  /** Asked after the layer's last run was refused, so it draws nothing until its own answer arrives. */
  afterRefusal: boolean;
  refreshEpoch: number;
  /** Started ahead of its layer: its failure is logged only once a layer has taken it. */
  owned: boolean;
  onFailure: (() => void) | null;
  prestartedBelow: Map<number, RenderedRoute> | null;
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
  const routeRender = renders[index];
  const inherited = useContext(prestartContext);
  const isAsyncRender = CsrPageReadiness.isAsync(routeRender);
  const renderedRef = useRef<RenderedRoute | null>(null);
  const [, setFailures] = useState(0);
  const activity = usePageActivity();
  const refresh = useSyncExternalStore(CsrRefresh.subscribe, CsrRefresh.current, CsrRefresh.current);
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
  const locationId = location ? CsrRefresh.idOf(location) : null;
  //? Only the page in front asks. React still renders a parked page, whose effects are stopped, and a page under the
  //? current one (`prev`) is not the one the visitor is on: a guard run for either would move the router off it.
  const mayAsk = activity !== "hidden" && activity !== "prev";
  useEffect(() => (guardKey ? CsrGuards.hold(guardKey) : undefined), [guardKey]);
  //? A verdict lasts while a layer of its location is on screen. One that lapsed while the page was away, or a key that
  //? moved on args this layer does not read, is asked in the background: what the layer drew stays until a refusal,
  //? which moves the router and blanks the layer, or a failure, which shows as a render's would.
  useEffect(() => {
    const rendered = renderedRef.current;
    if (!guarded || !guardKey || !mayAsk || !rendered || CsrGuards.asked(guardKey)) return;
    if (rendered.refusedAt === locationId || rendered.failure) return;
    CsrGuards.of(guarded).then(
      (admitted) => {
        if (admitted || renderedRef.current !== rendered) return;
        renderedRef.current = {
          ...rendered,
          result: null,
          record: null,
          redirected: true,
          refusedAt: locationId,
          admittedKey: null,
        };
        setFailures((count) => count + 1);
      },
      (error: unknown) => {
        Logger.error(
          `the guards of ${path} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
        );
        if (renderedRef.current !== rendered) return;
        rendered.failure = { error };
        setFailures((count) => count + 1);
      },
    );
  }, [guardKey, activity]);
  //? A sync layer draws only props its location's guards let in: new ones at once once they did, so typing into a
  //? URL-bound field never lags behind a check, and the ones it last drew while a new location is checked.
  const isSyncAdmitted = !isAsyncRender && !!guardKey && CsrGuards.admitted(guardKey);
  const drawnPropsRef = useRef<Pick<RenderLayerProps, "params" | "searchParams"> | null>(null);
  if (isSyncAdmitted) drawnPropsRef.current = { params, searchParams };
  if (routeRender && (mayAsk || !guarded) && (isAsyncRender || (guarded && !isSyncAdmitted))) {
    const argsKey = isAsyncRender ? argsKeyOf(routeRender, params, searchParams) : (guardKey ?? "");
    const rendered = renderedRef.current;
    const returned = activity === "current" && !onScreenRef.current;
    if (
      mustRerun(rendered, {
        render: routeRender.render,
        argsKey,
        returned,
        locationId,
        guardKey,
        isAsyncRender,
        refresh,
      })
    ) {
      const input: LayerRunInput = {
        ...{ routeRender, index, params, searchParams, argsKey, isAsyncRender },
        ...{ guarded, guardKey, locationId, renderPath, path, refreshEpoch: refresh.epoch },
      };
      const next = takePrestart(inherited, input) ?? startRun(input, true);
      next.afterRefusal = !!rendered?.refusedAt;
      next.onFailure = () => {
        if (renderedRef.current === next) setFailures((count) => count + 1);
      };
      if (!rendered) next.prestartedBelow = prestartBelow(renders, input, inherited);
      renderedRef.current = next;
    }
  }
  const handedDown = renderedRef.current?.prestartedBelow ?? inherited;
  const children =
    index >= renders.length - 1 ? (
      leaf
    ) : (
      <prestartContext.Provider value={handedDown}>
        <RenderLayer renders={renders} index={index + 1} params={params} searchParams={searchParams} leaf={leaf} />
      </prestartContext.Provider>
    );
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
  const isSyncDrawn = !isAsyncRender && (!guarded || isSyncAdmitted);
  const failure = renderedRef.current?.failure;
  const isRefused = isRefusedAt(renderedRef.current, locationId, fulfilled);
  const drawn = isAsyncRender || isRefused ? null : drawnPropsRef.current;
  const isLoading = !!routeRender && !isSyncDrawn && !failure && !isRefused && !drawn && (!value || !isAsyncRender);
  useLayerReadiness(location?.entryId, isLoading);
  if (!routeRender) return null;
  if (isSyncDrawn) return createElement(routeRender.render as never, { children, params, searchParams } as never);
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
  if (drawn) return createElement(routeRender.render as never, { children, ...drawn } as never);
  if (!value || !isAsyncRender || isRefused)
    return <>{Translator.renderAt(renderPath, () => composeLoadingFallback(renders.slice(index), params))}</>;
  return <layerChildContext.Provider value={children}>{value}</layerChildContext.Provider>;
});

interface LayerRunInput {
  routeRender: RouteRender;
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
  argsKey: string;
  isAsyncRender: boolean;
  guarded: Parameters<typeof CsrGuards.of>[0] | null;
  guardKey: string | null;
  locationId: string | null;
  renderPath: string | undefined;
  path: string;
  refreshEpoch: number;
}

function argsKeyOf(
  routeRender: RouteRender,
  params: Record<string, string>,
  searchParams: Record<string, string | string[]>,
): string {
  return RouteDefinition.renderArgsKey(
    routeRender.render,
    { params, searchParams },
    { isPage: routeRender.kind === "page", paramNames: routeRender.paramNames },
  );
}

function startRun(input: LayerRunInput, owned: boolean): RenderedRoute {
  const { routeRender, index, params, searchParams, isAsyncRender, guarded, guardKey, locationId } = input;
  const redirectsBefore = router.redirectCount();
  const layer = `${routeRender.kind ?? "layout"} ${index} of ${input.path}`;
  let refusedAt: string | null = null;
  let admittedKey: string | null = null;
  const draw = () =>
    isAsyncRender
      ? Translator.renderAt(
          input.renderPath,
          () => routeRender.render({ children: layerOutlet, params, searchParams } as never) ?? null,
        )
      : true;
  const result = traceRender(
    guarded
      ? CsrGuards.of(guarded).then((admitted) => {
          if (admitted) admittedKey = guardKey;
          else refusedAt = locationId;
          return admitted ? draw() : null;
        })
      : draw(),
    layer,
  );
  const run: RenderedRoute = {
    render: routeRender.render,
    argsKey: input.argsKey,
    result,
    record: isThenable(result) ? CsrFrameDump.track(layer, result as Promise<ReactNode>) : null,
    redirected: false,
    refusedAt: null,
    admittedKey: null,
    failure: null,
    afterRefusal: false,
    refreshEpoch: input.refreshEpoch,
    owned,
    onFailure: null,
    prestartedBelow: null,
  };
  if (isThenable(result))
    (result as Promise<ReactNode>).then(
      () => {
        run.refusedAt = refusedAt;
        run.admittedKey = admittedKey;
        run.redirected = !!refusedAt || router.redirectCount() !== redirectsBefore;
      },
      (error: unknown) => {
        //? useFetch drops a rejection, so a render that throws would leave its layer blank with nothing in the console.
        if (run.owned)
          Logger.error(
            `render of ${layer} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
          );
        if (router.redirectCount() !== redirectsBefore) return;
        run.failure = { error };
        run.onFailure?.();
      },
    );
  return run;
}

//? One that settled refused, redirected or failed is left: the layer asks again, as it would have mounted on its own.
function takePrestart(inherited: Map<number, RenderedRoute> | null, input: LayerRunInput): RenderedRoute | null {
  const run = inherited?.get(input.index);
  if (!run) return null;
  inherited?.delete(input.index);
  const isSame =
    run.render === input.routeRender.render && run.argsKey === input.argsKey && run.refreshEpoch === input.refreshEpoch;
  if (!isSame || run.refusedAt || run.redirected || run.failure) return null;
  run.owned = true;
  return run;
}

function prestartBelow(
  renders: RouteRender[],
  input: LayerRunInput,
  inherited: Map<number, RenderedRoute> | null,
): Map<number, RenderedRoute> | null {
  const below = new Map(inherited);
  for (let index = input.index + 1; index < renders.length; index++) {
    const routeRender = renders[index];
    if (!routeRender || !CsrPageReadiness.isAsync(routeRender) || below.has(index)) continue;
    const argsKey = argsKeyOf(routeRender, input.params, input.searchParams);
    below.set(index, startRun({ ...input, routeRender, index, argsKey, isAsyncRender: true }, false));
  }
  return below.size ? below : inherited;
}

//? A refused location draws nothing of what it refused, whatever the layer drew for another, nor while it is asked again.
function isRefusedAt(rendered: RenderedRoute | null, locationId: string | null, fulfilled: boolean): boolean {
  return (!!locationId && rendered?.refusedAt === locationId) || (!!rendered?.afterRefusal && !fulfilled);
}

//? Only a stack entry's page has an entry id: the root layouts, drawn outside any page's wrapper, report for none.
const useLayerReadiness = (entryId: string | undefined, isLoading: boolean) => {
  const layerId = useId();
  useEffect(() => {
    if (entryId) CsrPageReadiness.report(entryId, layerId, isLoading);
  }, [entryId, isLoading]);
  useEffect(() => (entryId ? () => CsrPageReadiness.drop(entryId, layerId) : undefined), [entryId]);
};

interface LayerRun {
  render: RouteRender["render"];
  argsKey: string;
  returned: boolean;
  locationId: string | null;
  guardKey: string | null;
  isAsyncRender: boolean;
  refresh: ReturnType<typeof CsrRefresh.current>;
}
//? Rerun only when the render itself (a hot update) or the args it reads change: any other re-render would refetch.
function mustRerun(rendered: RenderedRoute | null, run: LayerRun): boolean {
  if (!rendered || rendered.render !== run.render || rendered.argsKey !== run.argsKey) return true;
  //? A cached page back on screen reruns a render that redirected: signed out, a layout redirects to the sign-in
  //? page, and kept, it would stay blank after the sign-in brings the person back.
  if (run.returned && rendered.redirected) return true;
  //? A guard may move the router within its own route (a merged id, a defaulted query), which keeps this layer
  //? mounted, perhaps with args no guard reads: the location it refused is gone, so it asks the new one.
  if (rendered.refusedAt && rendered.refusedAt !== run.locationId) return true;
  //? A sync layer let in under this key before and not now: the verdict lapsed while its page was parked.
  if (!run.isAsyncRender && rendered.admittedKey === run.guardKey) return true;
  //? A refresh reruns the location it was asked on and the root layouts every page draws under, never a parked page.
  if (rendered.refreshEpoch === run.refresh.epoch) return false;
  return run.locationId === null || run.refresh.locationId === run.locationId;
}

function traceRender(result: ReactNode | Promise<ReactNode>, layer: string): ReactNode | Promise<ReactNode> {
  if (!isThenable(result)) return result;
  debugFrame("layer.render", { layer });
  (result as Promise<ReactNode>).then(
    () => debugFrame("layer.settle", { layer }),
    (error: unknown) =>
      debugFrame("layer.fail", { layer, message: error instanceof Error ? error.message : String(error) }),
  );
  return result;
}

//? window.location.pathname is percent-encoded while a pushed href may arrive raw.
function entryPathOf(pathname: string | undefined): string | undefined {
  if (!pathname) return pathname;
  return new URL(`http://localhost${pathname}`).pathname;
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
