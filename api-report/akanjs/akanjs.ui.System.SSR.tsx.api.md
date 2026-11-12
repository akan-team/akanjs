# `akanjs/ui/System/SSR.tsx`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const SSR: {
    (): null;
    Provider: ({ className, appName, params, head, env, children, theme, viewport, prefix, fonts, layoutStyle, reconnect, wsConnect, allDictionary, of, }: SSRProviderProps) => import("react").JSX.Element;
    Wrapper: ({ children, head, fonts, className, lang, path, prefix, layoutStyle, pageState, }: SSRWrapperProps) => import("react").JSX.Element;
};

export type SSRProviderProps = ProviderProps & {
    fonts?: ReactFont[];
};

export default const SSRProvider: ({ className, appName, params, head, env, children, theme, viewport, prefix, fonts, layoutStyle, reconnect, wsConnect, allDictionary, of, }: SSRProviderProps) => import("react").JSX.Element;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface ProviderProps {
    className?: string;
    appName: string;
    params: RootLayoutProps["params"];
    head?: ReactNode;
    manifest?: WebAppManifest;
    env?: object;
    theme?: AkanTheme;
    viewport?: RouteViewport;
    prefix?: string;
    children: ReactNode | ReactNode[];
    layoutStyle?: "mobile" | "web";
    reconnect?: boolean;
    wsConnect?: boolean;
    allDictionary?: Record<string, Record<string, Record<string, unknown>>>;
    of: (props: unknown) => ReactNode | null;
}

interface SSRWrapperProps {
    className?: string;
    appName: string;
    lang: "en" | "ko" | (string & {});
    path: string;
    head?: ReactNode;
    fonts?: ReactFont[];
    children: ReactNode;
    prefix?: string;
    layoutStyle?: "mobile" | "web";
    pageState?: PageState;
}
```
