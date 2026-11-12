# `akanjs/ui/System/index.tsx`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const Provider: (props: CSRProviderProps | SSRProviderProps) => import("react").JSX.Element;

export declare const System: {
    Provider: (props: CSRProviderProps | SSRProviderProps) => import("react").JSX.Element;
    App: ({ className, params, path, env, theme, viewport, fonts, children, }: import("./App").AppProviderProps) => import("react").JSX.Element;
    ThemeToggle: ({ themes }: import("./ThemeToggle").ThemeToggleProps) => import("react").JSX.Element | null;
    Root: ({ children, st }: import("./Root").RootProps) => import("react").JSX.Element;
    SelectLanguage: ({ className, languages }: import("./SelectLanguage").SelectLanguageProps) => import("react").JSX.Element;
    Reconnect: () => import("react").JSX.Element | null;
    DevModeToggle: () => import("react").JSX.Element;
};

export interface WebAppManifest {
    name?: string;
    shortName?: string;
    startUrl?: string;
    scope?: string;
    display?: "browser" | "fullscreen" | "minimal-ui" | "standalone" | (string & {});
    displayOverride?: string[];
    orientation?: string;
    themeColor?: string;
    backgroundColor?: string;
    description?: string;
    lang?: string;
    dir?: "auto" | "ltr" | "rtl";
    icons?: WebAppManifestIcon[];
    categories?: string[];
    screenshots?: WebAppManifestIcon[];
    [key: string]: unknown;
}
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AppProviderProps {
    className?: string;
    params: {
        lang: string;
    };
    path?: string;
    env?: object;
    theme?: AkanTheme;
    viewport?: RouteViewport;
    fonts?: ReactFont[];
    children: ReactNode;
}

type CSRProviderProps = ProviderProps & {
    fonts: ReactFont[];
};

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

interface RootProps {
    children: ReactNode;
    st: unknown;
}

interface SelectLanguageProps {
    className?: string;
    languages?: string[];
}

interface ThemeToggleProps {
    themes?: string[];
}
```
