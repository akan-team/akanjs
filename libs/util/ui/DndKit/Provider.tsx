"use client";

import type { DndContextProps } from "@dnd-kit/core";
import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createContext, useRef } from "react";
import type { DndContextType } from "./type";

export interface ProviderProps extends DndContextProps {
  className?: string;
}

export const ItemsContext = createContext<DndContextType>({});

export default function Provider({ children, className, ...props }: ProviderProps) {
  const itemsMap = useRef<DndContextType>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <ItemsContext.Provider value={itemsMap.current}>
      <DndContext {...props} autoScroll={{ enabled: false }} sensors={sensors} collisionDetection={closestCorners}>
        <div className={className}>{children}</div>
      </DndContext>
    </ItemsContext.Provider>
  );
}
