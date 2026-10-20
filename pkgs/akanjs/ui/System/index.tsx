import { getEnv } from "akanjs/base";
import { AppProvider } from "./App";
import { default as CSR, type CSRProviderProps } from "./CSR";
import { Reconnect } from "./Reconnect";
import { Root } from "./Root";
import { SelectLanguage } from "./SelectLanguage";
import { default as SSR, type SSRProviderProps } from "./SSR";
import { DevModeToggle, ThemeToggle } from "./ThemeToggle";

export type { WebAppManifest } from "akanjs/client";

export const Provider = (props: CSRProviderProps | SSRProviderProps) => {
  if (getEnv().renderMode === "csr") return <CSR {...(props as CSRProviderProps)} />;
  else return <SSR {...(props as SSRProviderProps)} />;
};
export const System = {
  Provider,
  /** Around one `.app()`'s element in an MCP host's view; the generated root layout's `McpAppRoot` renders it. */
  App: AppProvider,
  ThemeToggle,
  /** @deprecated Renders `children` and ignores `st`; render the children directly. */
  Root,
  SelectLanguage,
  Reconnect,
  DevModeToggle,
};
