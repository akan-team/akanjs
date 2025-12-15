import { baseClientEnv } from "@akanjs/base";

import { type CSRProviderProps, default as CSR } from "./CSR";
import { DevModeToggle } from "./DevModeToggle";
import { Reconnect } from "./Reconnect";
import { Root } from "./Root";
import { SelectLanguage } from "./SelectLanguage";
import { default as SSR, type SSRProviderProps } from "./SSR";
import { ThemeToggle } from "./ThemeToggle";

export const Provider = (props: CSRProviderProps | SSRProviderProps) => {
  if (baseClientEnv.renderMode === "csr") return <CSR {...(props as CSRProviderProps)} />;
  else return <SSR {...(props as SSRProviderProps)} />;
};
export const System = {
  Provider,
  ThemeToggle,
  Root,
  SelectLanguage,
  Reconnect,
  DevModeToggle,
};
