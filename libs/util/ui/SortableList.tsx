"use client";
import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type Modifier,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useId, useRef } from "react";

export interface SortableItem {
  id: string;
  node: ReactNode;
  below?: ReactNode;
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const pressTolerance = 5;

//? closestCenter alone compares the dragged block's center, so a row with an expanded body never passes a short one.
const pointerFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

interface SortableListProps {
  className?: string;
  items: SortableItem[];
  onReorder: (ids: string[]) => void;
}
export const SortableList = ({ className, items, onReorder }: SortableListProps) => {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const isBlockingRef = useRef(false);
  const releaseRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: pressTolerance } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: pressTolerance } }),
  );
  const ids = items.map((item) => item.id);
  //? dnd-kit stops the click that ends a drag at the document, after the anchor's own navigation is already queued.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const block = (event: Event) => {
      if (!isBlockingRef.current || !(event.target instanceof Node) || !container.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", block, true);
    window.addEventListener("contextmenu", block, true);
    return () => {
      window.removeEventListener("click", block, true);
      window.removeEventListener("contextmenu", block, true);
      clearTimeout(releaseRef.current);
    };
  }, []);
  const release = (afterRelease?: () => void) => {
    releaseRef.current = setTimeout(() => {
      isBlockingRef.current = false;
      afterRelease?.();
    }, 50);
  };
  //? A live touch drag has dnd-kit cancel the browser's long-press contextmenu, so a still press opens it here.
  const menuOpenerOf = (event: Event | null) => {
    const touch = typeof TouchEvent !== "undefined" && event instanceof TouchEvent ? event.touches[0] : undefined;
    const target = event?.target;
    if (!touch || !(target instanceof Element)) return;
    const { clientX, clientY } = touch;
    return () =>
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
  };
  const onDragEnd = ({ active, over, delta, activatorEvent }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      release();
      onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
      return;
    }
    release(Math.hypot(delta.x, delta.y) < pressTolerance ? menuOpenerOf(activatorEvent) : undefined);
  };
  return (
    <div ref={containerRef} className={className}>
      <DndContext
        id={id}
        sensors={sensors}
        collisionDetection={pointerFirst}
        modifiers={[verticalOnly]}
        onDragStart={() => {
          clearTimeout(releaseRef.current);
          isBlockingRef.current = true;
        }}
        onDragEnd={onDragEnd}
        onDragCancel={() => release()}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <Sortable key={item.id} item={item} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

interface SortableProps {
  item: SortableItem;
}
const Sortable = ({ item }: SortableProps) => {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 rounded-field bg-card shadow-lg")}
    >
      <div ref={setActivatorNodeRef} {...listeners} className="select-none [-webkit-touch-callout:none]">
        {item.node}
      </div>
      {item.below}
    </div>
  );
};
