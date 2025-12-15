import { ReactNode } from "react";

import { DragEmpty } from "./DragEmpty";
import { DraggableUnit } from "./DraggableUnit";
import { DroppableColumn } from "./DroppableColumn";
import { Provider, ProviderProps } from "./Provider";

export * from "./util";
interface DndKitProps extends ProviderProps {
  children: ReactNode;
}

export const DndKit = ({ children, ...props }: DndKitProps) => {
  return <Provider {...props}>{children}</Provider>;
};

DndKit.Provider = Provider;
DndKit.DroppableColumn = DroppableColumn;
DndKit.DraggableUnit = DraggableUnit;
DndKit.DragEmpty = DragEmpty;
