import type { ComponentType, ReactNode } from "react";
// `react.react-server.js` (Bun's `react` under `--conditions react-server`) lacks the hooks and `Suspense`: a named
// import crashes RSC worker evaluation, so they are read off the namespace only when a wrapper using them renders.
import * as React from "react";
import { forwardRef, lazy as reactLazy } from "react";
import { needsBrowser } from "./needsBrowser";

const isServer = typeof window === "undefined";

/** `suspense`: a late chunk suspends only itself, not the route. Opt-in: under streaming the boundary's subtree
 * leaves the shell, which SEO snapshots, prerendering and pre-hydration E2E read. */
type LazyOption = { ssr?: boolean; suspense?: boolean; loading?: () => ReactNode };
type LazyProps = Record<string, unknown>;
type LoadedOf<Loaded> = Loaded extends { default: infer T } ? T : Loaded;
type LazyModule = { default: ComponentType<LazyProps> };

const normalizeLazyModule = <Loaded,>(loaded: Loaded): LazyModule => {
  if (loaded && typeof loaded === "object" && "default" in loaded) return loaded as LazyModule;
  return { default: loaded as ComponentType<LazyProps> };
};

/** `ssr: false` renders `loading` on the server and mounts the component only after hydration. */
export const lazy = <Loaded,>(loader: () => Promise<Loaded>, option?: LazyOption): LoadedOf<Loaded> => {
  const ssrFalse = option?.ssr === false;
  const renderFallback = (): ReactNode => (option?.loading ? option.loading() : null);
  if (isServer && ssrFalse) {
    const Stub = forwardRef<unknown, LazyProps>(() => {
      needsBrowser();
      return <>{renderFallback()}</>;
    });
    Stub.displayName = "LazySsrFalseStub";
    return Stub as unknown as LoadedOf<Loaded>;
  }
  const LazyInner = reactLazy(async () => normalizeLazyModule(await loader()));

  if (!ssrFalse) {
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
    return (
      <React.Suspense fallback={renderFallback()}>
        <LazyInner {...props} ref={ref as never} />
      </React.Suspense>
    );
  });
  Gate.displayName = "LazySsrFalseGate";
  return Gate as unknown as LoadedOf<Loaded>;
};
