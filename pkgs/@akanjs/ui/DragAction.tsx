"use client";
import { clsx } from "@akanjs/client";
import { animated } from "@akanjs/ui";
import { useGesture } from "@use-gesture/react";
import { createContext, ReactNode, useContext, useRef } from "react";
import { SpringValue, useSpring } from "react-spring";

interface DragActionContextType {
  bind: (...args: any[]) => any;
  x: SpringValue<number>;
  y: SpringValue<number>;
  leftOpacity: SpringValue<number>;
  leftWidth: SpringValue<number>;
  rightOpacity: SpringValue<number>;
  rightWidth: SpringValue<number>;
  onClick?: () => void;
}

const DragActionContext = createContext<DragActionContextType>({
  bind: () => ({}),
  x: new SpringValue(0),
  y: new SpringValue(0),
  leftOpacity: new SpringValue(0),
  leftWidth: new SpringValue(0),
  rightOpacity: new SpringValue(0),
  rightWidth: new SpringValue(0),
});

interface DragActionProps {
  className?: string;
  children: any;
  onClick?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}
export const DragAction = ({ className, children, onClick, onLeft, onRight }: DragActionProps) => {
  const action = useRef<"left" | "right" | null>(null);
  const [{ x, y, leftOpacity, leftWidth, rightOpacity, rightWidth }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    leftOpacity: 0,
    leftWidth: 0,
    rightOpacity: 0,
    rightWidth: 0,
  }));
  const ref = useRef<HTMLDivElement>(null);

  const bind = useGesture(
    {
      onClick: () => {
        if (!action.current) onClick?.();
        action.current = null;
      },
      onDrag: ({ down, movement: [mx], event }) => {
        if (!ref.current) return;
        void api.start({
          x: down ? mx : 0,
          leftOpacity: mx > 0 && down ? mx / ref.current.clientWidth : 0,
          leftWidth: mx > 0 && down ? Math.min(mx, ref.current.clientWidth) : 0,
          rightOpacity: mx < 0 && down ? -mx / ref.current.clientWidth : 0,
          rightWidth: mx < 0 && down ? Math.min(-mx, ref.current.clientWidth) : 0,
        });
        action.current = mx > 0 ? "left" : mx < 0 ? "right" : null;
      },
      onDragEnd: ({ movement: [mx] }) => {
        if (!ref.current) return;
        void api.start({ x: 0, leftOpacity: 0, leftWidth: 0, rightOpacity: 0, rightWidth: 0 });
        if (mx > ref.current.clientWidth / 2 && onLeft) onLeft();
        if (mx < -ref.current.clientWidth / 2 && onRight) onRight();
      },
    },
    { drag: { axis: "x" } }
  );
  return (
    <DragActionContext.Provider value={{ bind, x, y, leftOpacity, leftWidth, rightOpacity, rightWidth, onClick }}>
      <div ref={ref} className={clsx("relative overflow-x-hidden", className)}>
        {children}
      </div>
    </DragActionContext.Provider>
  );
};

interface BodyProps {
  children: ReactNode;
}
const Body = ({ children }: BodyProps) => {
  const { bind, x, onClick } = useContext(DragActionContext);
  return (
    <animated.div className="cursor-pointer" {...bind()} style={{ x, touchAction: "pan-y" }}>
      {children}
    </animated.div>
  );
};
DragAction.Body = Body;

interface LeftProps {
  children: ReactNode;
}
const Left = ({ children }: LeftProps) => {
  const { bind, leftOpacity, leftWidth } = useContext(DragActionContext);
  return (
    <animated.div
      {...bind()}
      style={{ touchAction: "pan-y", opacity: leftOpacity, width: leftWidth }}
      className="absolute inset-y-0 left-0 flex items-center justify-center"
    >
      {children}
    </animated.div>
  );
};
DragAction.Left = Left;

interface RightProps {
  children: ReactNode;
}
const Right = ({ children }: RightProps) => {
  const { bind, rightOpacity, rightWidth } = useContext(DragActionContext);
  return (
    <animated.div
      {...bind()}
      style={{ opacity: rightOpacity, width: rightWidth }}
      className="absolute inset-y-0 right-0 flex items-center justify-center"
    >
      {children}
    </animated.div>
  );
};
DragAction.Right = Right;
