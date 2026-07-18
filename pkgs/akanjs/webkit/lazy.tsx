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

type LazyOption = { ssr?: boolean; loading?: () => ReactNode };
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
    const Wrapper = forwardRef<unknown, LazyProps>((props, ref) => <LazyInner {...props} ref={ref as never} />);
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
