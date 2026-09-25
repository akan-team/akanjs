import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export interface Mounted {
  container: HTMLElement;
  render: (node: ReactNode) => void;
  unmount: () => void;
}

export const mount = (node: ReactNode): Mounted => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    render: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};
