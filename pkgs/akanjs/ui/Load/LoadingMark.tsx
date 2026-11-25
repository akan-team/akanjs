import type { ReactNode } from "react";

//? The in-page agent's navigate waits until no load on screen is pending before it reports the page it arrived on: a
//? section that streams in later mounts the tools the model is then told about. A `<template>` draws nothing and is
//? allowed in any parent, a table or a list included.
export const LoadingMark = ({ children }: { children?: ReactNode }) => (
  <>
    {children}
    <template data-akan-loading="" />
  </>
);
