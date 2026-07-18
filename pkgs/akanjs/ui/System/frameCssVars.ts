import type { CSSProperties } from "react";
import type { PageState } from "akanjs/client";

export type AkanFrameCssVarName =
  | "--akan-top-safe-area"
  | "--akan-bottom-safe-area"
  | "--akan-top-inset"
  | "--akan-bottom-inset"
  | "--akan-page-padding-top"
  | "--akan-page-padding-bottom";

export type AkanFrameCssVars = CSSProperties & Record<AkanFrameCssVarName, string>;

const px = (value: number) => `${Math.max(0, value)}px`;

export function getFrameCssVars(pageState: PageState): AkanFrameCssVars {
  return {
    "--akan-top-safe-area": px(pageState.topSafeArea),
    "--akan-bottom-safe-area": px(pageState.bottomSafeArea),
    "--akan-top-inset": px(pageState.topInset),
    "--akan-bottom-inset": px(pageState.bottomInset),
    "--akan-page-padding-top": px(pageState.topSafeArea + pageState.topInset),
    "--akan-page-padding-bottom": px(pageState.bottomSafeArea + pageState.bottomInset),
  };
}
