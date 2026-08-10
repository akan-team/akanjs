import type { ComponentType, ReactNode } from "react";
// `useState` / `useEffect` are NOT exported from `react.react-server.js`
// (the build Bun resolves `react` to under `--conditions react-server`).
// Named-importing them here would crash RSC worker evaluation with
// "Export named 'useEffect' not found". They're only ever called on the
// browser anyway (the `ssr: false` gate below is the only path that calls
// them, and it short-circuits on the server), so we dereference them
// through a namespace import — the namespace itself is always importable,
// and the lookup only happens when the gated Wrapper actually renders.
import * as React from "react";
import { forwardRef, lazy as reactLazy } from "react";

const isServer = typeof window === "undefined";

/**
 * `suspense` puts a Suspense boundary around the lazy component, so a chunk that resolves *after* the
 * page is painted — a modal body, a dropdown menu — suspends only itself. Without one the suspension
 * travels up to the nearest boundary, which is the route (`server/routeElementComposer.tsx`), and the
 * whole page repaints as its loading fallback on the first open.
 *
 * It is opt-in rather than the default because a boundary also changes server rendering: under the
 * default `renderMode: "stream"` the boundary's subtree leaves the shell as `loading` and arrives later
 * in the stream. That is fine for an interaction shell and wrong for a page body, which SEO snapshots,
 * prerendering and pre-hydration E2E read out of the shell.
 */
type LazyOption = { ssr?: boolean; suspense?: boolean; loading?: () => ReactNode };
type LazyProps = Record<string, unknown>;
type LoadedOf<Loaded> = Loaded extends { default: infer T } ? T : Loaded;
type LazyModule = { default: ComponentType<LazyProps> };

const normalizeLazyModule = <Loaded,>(loaded: Loaded): LazyModule => {
  if (loaded && typeof loaded === "object" && "default" in loaded) return loaded as LazyModule;
  return { default: loaded as ComponentType<LazyProps> };
};

/** React lazy wrapper with Akan's `ssr: false` server stub and client mount gate. */
export const lazy = <Loaded,>(loader: () => Promise<Loaded>, option?: LazyOption): LoadedOf<Loaded> => {
  const ssrFalse = option?.ssr === false;
  const renderFallback = (): ReactNode => (option?.loading ? option.loading() : null);
  if (isServer && ssrFalse) {
    const Stub = forwardRef<unknown, LazyProps>(() => <>{renderFallback()}</>);
    Stub.displayName = "LazySsrFalseStub";
    return Stub as unknown as LoadedOf<Loaded>;
  }
  const LazyInner = reactLazy(async () => normalizeLazyModule(await loader()));

  if (!ssrFalse) {
    // `React.Suspense` for the same reason the namespace import exists at all: the lookup happens only
    // when a flagged component renders, so a constrained `react` (the react-server build, a test double)
    // never has to carry the export for an unflagged call site.
    const Wrapper = forwardRef<unknown, LazyProps>((props, ref) =>
      option?.suspense ? (
        <React.Suspense fallback={renderFallback()}>
          <LazyInner {...props} ref={ref as never} />
        </React.Suspense>
      ) : (
        <LazyInner {...props} ref={ref as never} />
      ),
    );
    Wrapper.displayName = "LazyWrapper";
    return Wrapper as unknown as LoadedOf<Loaded>;
  }

  const Gate = forwardRef<unknown, LazyProps>((props, ref) => {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    if (!mounted) return <>{renderFallback()}</>;
    return <LazyInner {...props} ref={ref as never} />;
  });
  Gate.displayName = "LazySsrFalseGate";
  return Gate as unknown as LoadedOf<Loaded>;
};
