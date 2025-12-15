import "dayjs/locale/ko";

import { type BaseClientEnv } from "@akanjs/base";
import { type RootLayoutProps } from "@akanjs/client";
import { ReactNode } from "react";

export interface ProviderProps {
  className?: string;
  appName: string;
  params: RootLayoutProps["params"];
  head?: ReactNode;
  env: BaseClientEnv;
  theme?: string;
  prefix?: string;
  children: ReactNode | ReactNode[];
  gaTrackingId?: string;
  layoutStyle?: "mobile" | "web";
  reconnect?: boolean;
  of: (props: any) => ReactNode | null;
}

export const Common = () => {
  return <></>;
};
