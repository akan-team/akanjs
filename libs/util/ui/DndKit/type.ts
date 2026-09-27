export type DndContextItemType<T> = T extends (infer U)[] ? U : never;

export interface DndContextType {
  [key: string]: {
    id: string;
    items: { id: string }[];
  };
}

export interface ItemsContextType<
  T extends {
    id: string;
  }[],
> {
  [key: string]: {
    id: string;
    items: T;
  };
}
