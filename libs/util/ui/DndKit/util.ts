interface NewIndexProps<T extends { id: string }[]> {
  activeId: string;
  overId: string;
  activeItems: T;
  overItems: T;
  delta: { x: number; y: number };
}

interface MergeOverItemsProps<T extends { id: string }[]> {
  activeId: string;
  overId: string;
  activeItems: T;
  overItems: T;
  delta: { x: number; y: number };
}

export const isMyColumn = (findId: string, items: string[]) => {
  return items.includes(findId);
};

export const newIndex = <T extends { id: string }[]>({
  activeId,
  overId,
  activeItems,
  overItems,
  delta,
}: NewIndexProps<T>) => {
  const activeIndex = activeItems.findIndex((i) => i.id === activeId);
  const overIndex = overItems.findIndex((i) => i.id === overId);

  const putOnBelowLastItem = overIndex === overItems.length - 1 && delta.y > 0;
  const modifier = putOnBelowLastItem ? 1 : 0;
  return overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
};

export const mergeOverItems = <T extends { id: string }[]>({
  activeId,
  overId,
  activeItems,
  overItems,
  delta,
}: MergeOverItemsProps<T>): T => {
  const activeIndex = activeItems.findIndex((i) => i.id === activeId);
  const overIndex = overItems.findIndex((i) => i.id === overId);
  const idx = newIndex({ activeId, overId, activeItems, overItems, delta });
  const newItems = [
    ...overItems.slice(0, idx),
    activeItems[activeIndex],
    ...overItems.slice(idx, overItems.length),
  ] as T;

  return newItems;
};
