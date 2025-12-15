import { BaseInsight } from "@akanjs/base";
import type { FetchInitForm } from "@akanjs/signal";
import { type ClassValue, clsx as clsxLib } from "clsx";
import type { ReactElement, ReactNode } from "react";

export const clsx = (...args: ClassValue[]) => clsxLib(...args);
export const loadFonts = (fonts: { name: string; nextFont: any; paths: { src: string; weight: number }[] }[]) => {
  return fonts.map(({ name, nextFont, paths }) => (nextFont as unknown as ReactFont | undefined) ?? { name, paths });
};

export interface ModelsProps<M extends { id: string }> {
  className?: string;
  sliceName?: string;
  query?: { [key: string]: any };
  init?: FetchInitForm<any, M, any>;
  onClickItem?: (model: M) => any;
}

export type ModelProps<T extends string, L extends { id: string }> = { [key in T]: L } & {
  className?: string;
  sliceName?: T;
  onClick?: (model: L) => any;
  actions?: DataAction[];
  columns?: DataColumn<L>[];
  href?: string;
};

export interface ModelDashboardProps<Summary> {
  className?: string;
  summary: Summary;
  queryMap?: { [key: string]: any };
  columns?: (keyof Summary)[];
  hidePresents?: boolean;
  sliceName?: string;
}

export interface ModelInsightProps<Insight = BaseInsight> {
  className?: string;
  insight: Insight;
  sliceName?: string;
}

export interface ModelEditProps {
  sliceName?: string;
}

export interface ModelViewProps {
  id?: string;
  sliceName?: string;
}
export type DataAction = "edit" | "view" | "remove" | null | undefined | ReactElement;
export interface DataTool {
  render: () => ReactNode;
}

export type DataColumn<L> =
  | string
  | {
      key: keyof L;
      title?: string;
      value?: (value: any, model: L) => string | number | boolean | undefined | null | object;
      responsive?: boolean;
      render?: (value: any, model: L) => ReactNode;
      only?: "user" | "admin";
    };

export interface DataMenuItem {
  key: string;
  icon: ReactNode;
  label?: string;
  render: () => ReactNode;
}
export interface DataMenu {
  [key: string]: DataMenuItem;
}

export interface UserMenuItem {
  title: string | ReactNode;
  icon?: ReactNode;
  path: string;
  query?: any;
  children?: UserMenuItem[];
  onClick?: () => void;
}

export interface MenuItem {
  icon?: ReactNode;
  title: string | ReactNode;
  href: string;
  hide?: "mobile" | "pc";
  children?: MenuItem[];
  onClick?: () => void;
}

export interface ReactFont {
  name: string;
  paths: {
    src: string;
    weight: number;
  }[];
}

export interface RootLayoutProps {
  children: ReactNode;
  params: Promise<{
    lang: "en" | "ko" | (string & {});
  }>;
}
