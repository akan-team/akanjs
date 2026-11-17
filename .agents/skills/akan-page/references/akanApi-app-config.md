<!-- akan:generated -->

# Akan.js API reference

Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of
them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.

## App config (`akan.config.ts`)

### `AppConfig` · `akanjs`

```ts
type AppConfig = AppConfigInput | ((app: AppConfigContext) => AppConfigInput)
```

### `AppConfigInput` · `akanjs`

```ts
database?: DeepPartial<AkanDatabaseConfig>;
/** Baked into every client bundle, since a prebuilt CSR shell or mobile bundle never asks the server; `new AkanApp({ prefix })` still overrides the server and every server-rendered page. */
api?: DeepPartial<AkanApiConfig>;
routes?: AkanRouteConfig[];
/** Mounts `libs/<lib>/page` under `page/(libs)/(<lib>)` on sync: `true` every lib dependency with a `page` folder, an array exactly those libs, `false` (the default) nothing, removing what a previous sync created. */
syncPageLibs?: boolean | string[];
externalLibs?: string[];
/** Dependencies whose install scripts `bun install --production` runs, in the image and in a desktop app's server. */
trustedDependencies?: string[];
barrelImports?: string[];
optimizeImports?: string[];
/** `"route"` (the default) loads in a server-rendered page's browser code only the stores, endpoint descriptors, constants and dictionary texts of the modules the page uses; `"all"` loads every module's on every page, is deprecated, and is removed in the minor release after the one that made `"route"` the default. */
clientRuntime?: "all" | "route";
images?: DeepPartial<AkanImageConfig>;
i18n?: DeepPartial<AkanI18nConfig>;
publicEnv?: string[];
secrets?: string[];
assets?: DeepPartial<AkanAssetsConfig>;
docker?: DockerOption;
web?: AkanWebOption;
bin?: AkanBinConfig;
native?: AkanNativeAppConfig;
plugins?: AkanPlugin[];
pipeline?: AppPipelineConfig;
```

### `AkanWebOption` · `akanjs`

```ts
type AkanWebOption = boolean | { csr: boolean; }
```

### `AkanI18nConfig`

```ts
defaultLocale: string;
locales: string[];
/** `"always"` (absent means this) serves every page under `/<locale>/…` and redirects an unprefixed path by Accept-Language; `"as-needed"` serves the default locale's pages unprefixed, so a single-locale app has no prefix. */
localePrefix?: "always" | "as-needed";
```
