import type { ComponentType, ViewTransitionProps } from "react";
import * as React from "react";

//? React 19.3 added both, and a named import fails the module link on 19.2: there a navigation just swaps the page.
const react = React as {
  ViewTransition?: ComponentType<ViewTransitionProps>;
  addTransitionType?: (type: string) => void;
};

export const ViewTransition = react.ViewTransition;
export const addTransitionType = react.addTransitionType;
