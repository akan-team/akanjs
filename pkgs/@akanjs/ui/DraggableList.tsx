"use client";
import { clsx } from "@akanjs/client";
import { animated } from "@akanjs/ui";
import { config, useSprings } from "@react-spring/web";
import { useGesture } from "@use-gesture/react";
import clamp from "lodash.clamp";
import swap from "lodash-move";
import { createContext, type ReactElement, type ReactNode, useContext, useRef } from "react";
import { BiTrash } from "react-icons/bi";
import { MdDragIndicator } from "react-icons/md";

interface DragListContextType<V> {
  bind: (...args: any[]) => any;
  onRemove: (value: V) => void;
}
const dragListContext = createContext<DragListContextType<any>>({} as unknown as DragListContextType<any>);
const useDragList = () => useContext(dragListContext);

interface DragListProps<V> {
  className?: string;
  mode?: "horizontal" | "vertical";
  children: ReactElement[];
  onChange: (value: V[], draggedValue: V, info: { originalIdx: number; newIdx: number; idxChanged: boolean }) => void;
  onRemove: (value: V, idx: number) => void;
}
const DragList = <V,>({ className, mode = "vertical", children, onChange, onRemove }: DragListProps<V>) => {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const order = useRef(children.map((_, index) => index));
  const clientLengths = useRef(children.map((_, index) => 0));
  const centerLengths = useRef(children.map((_, index) => 0));
  const accLengths = useRef(children.map((_, index) => 0));
  const [springs, api] = useSprings<{
    movement: number;
    scale: number;
    zIndex: number;
    shadow: number;
  }>(
    children.length,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    fn(
      order.current,
      new Array(children.length).fill(0) as number[],
      new Array(children.length).fill(0) as number[]
    ) as any
  ); // Create springs, each corresponds to an item, controlling its transform, scale, etc.
  const bind = useGesture({
    onDragStart: () => {
      order.current = children.map((_, index) => index);
      clientLengths.current = refs.current.map((ref) =>
        mode === "vertical" ? (ref?.clientHeight ?? 0) : (ref?.clientWidth ?? 0)
      );
      centerLengths.current = clientLengths.current.map(
        (length, idx) => clientLengths.current.slice(0, idx).reduce((acc, cur) => acc + cur, 0) + length / 2
      );
      accLengths.current = clientLengths.current.map((length, idx) =>
        clientLengths.current.slice(0, idx).reduce((acc, cur) => acc + cur, 0)
      );
    },
    onDrag: ({ event, args: [originalIndex], active, movement: [x, y] }) => {
      const originIdx = originalIndex as number;
      const movement = mode === "vertical" ? y : x;
      const dragLength = centerLengths.current[originIdx] + movement;
      const centerIdx = accLengths.current.findIndex(
        (length, idx) => dragLength < accLengths.current[idx + 1] || idx === centerLengths.current.length - 1
      );
      const curRow = clamp(centerIdx, 0, children.length - 1);
      const newOrder = (swap as (...args) => number[])(order.current, originIdx, curRow);
      const newClientHeights = (swap as (...args) => number[])([...clientLengths.current], originIdx, curRow);
      void api.start(fn(newOrder, clientLengths.current, newClientHeights, active, originIdx, movement)); // Feed springs new style data, they'll animate the view without causing a single render
      if (!active) {
        const draggedValue = (children[originIdx].props as { value: V }).value;
        void api.start(fn(order.current, clientLengths.current, newClientHeights, active, originIdx, movement, true));
        onChange(
          children.map((_, index) => (children[newOrder[index]].props as { value: V }).value),
          draggedValue,
          { originalIdx: originIdx, newIdx: curRow, idxChanged: originalIndex !== curRow }
        );
      }
    },
  });

  return (
    <div className={clsx(`flex gap-0`, { "flex-col": mode === "vertical" }, className)}>
      {springs.map(({ zIndex, shadow, movement, scale }, i) => (
        <animated.div
          ref={(el: HTMLDivElement | null) => {
            refs.current[i] = el;
          }}
          key={i}
          style={{
            zIndex,
            boxShadow: shadow.to((s) => `rgba(0, 0, 0, 0.15) 0px ${s}px ${2 * s}px 0px`),
            scale,
            ...(mode === "vertical" ? { y: movement } : { x: movement }),
            // cursor: "grab",
          }}
        >
          <dragListContext.Provider
            value={{
              bind: () => bind(i),
              onRemove: () => {
                onRemove((children[i].props as { value: V }).value, i);
              },
            }}
          >
            {children[i]}
          </dragListContext.Provider>
        </animated.div>
      ))}
    </div>
  );
};

interface Cursor {
  className?: string;
  children: any;
}
DragList.Cursor = ({ className, children }: Cursor) => {
  const { bind } = useDragList();
  return (
    <div
      className={clsx("cursor-grab duration-200 hover:scale-[1.01] hover:opacity-70 hover:shadow-xl", className)}
      {...bind()}
    >
      {children}
    </div>
  );
};

interface ItemProps {
  value: any;
  children: ReactNode;
}
const Item = ({ value, children }: ItemProps) => {
  const { onRemove } = useDragList();
  return (
    <>
      <div className="flex w-full items-center gap-2">
        <DraggableList.Cursor>
          <MdDragIndicator className="text-xl" />
        </DraggableList.Cursor>
        {children}
        <button
          className="btn btn-xs btn-error btn-square btn-outline"
          onClick={() => {
            onRemove(value);
          }}
        >
          <BiTrash />
        </button>
      </div>
    </>
  );
};
DragList.Item = Item;

const fn =
  (
    order: number[],
    heights: number[],
    newHeights: number[],
    active = false,
    originalIndex = 0,
    movement = 0,
    finished = false
  ) =>
  (index: number) => {
    return active && index === originalIndex
      ? {
          movement,
          scale: 1.01,
          zIndex: 1,
          // shadow: 15,
          immediate: (key: string) => key === "zIndex",
          config: (key: string) => (key === "y" ? config.stiff : config.default),
        }
      : {
          movement:
            index === originalIndex
              ? newHeights.slice(0, order.indexOf(index)).reduce((a, b) => a + b, 0) -
                heights.slice(0, index).reduce((a, b) => a + b, 0)
              : order.indexOf(index) === index
                ? 0
                : order.indexOf(index) > index
                  ? heights[originalIndex]
                  : -heights[originalIndex],
          scale: 1,
          zIndex: 0,
          shadow: 0,
          immediate: finished,
        };
  };
export const DraggableList = DragList;
