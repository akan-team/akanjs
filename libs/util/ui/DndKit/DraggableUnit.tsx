"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { MouseEvent, ReactNode, useRef, useState } from "react";

export interface DraggableUnitProps {
  id: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void | Promise<void>;
}

export const DraggableUnit = ({ id, onClick, children, className }: DraggableUnitProps) => {
  const { attributes, listeners, setNodeRef, transform, isOver, isDragging } = useSortable({
    id,
  });
  const [isDrag, setIsDrag] = useState(false);
  const startTimeRef = useRef(0);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: MouseEvent<HTMLDivElement, MouseEvent>) => {
    startTimeRef.current = Date.now();
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDrag(false);
  };

  // 마우스 업 이벤트 핸들러
  const handleMouseUp = (e: MouseEvent<HTMLDivElement, MouseEvent>) => {
    const dragTime = Date.now() - startTimeRef.current;
    const dragDistance = Math.sqrt(
      Math.pow(e.clientX - startPosRef.current.x, 2) + Math.pow(e.clientY - startPosRef.current.y, 2)
    );

    // 짧은 시간 내에 적은 거리를 움직였다면 클릭으로 간주
    if (dragTime < 200 && dragDistance < 5 && !isDrag) {
      // onClick();
      void onClick?.();
    }
  };

  // 마우스 이동 핸들러
  const handleMouseMove = (e: MouseEvent<HTMLDivElement, MouseEvent>) => {
    const dragDistance = Math.sqrt(
      Math.pow(e.clientX - startPosRef.current.x, 2) + Math.pow(e.clientY - startPosRef.current.y, 2)
    );

    // 일정 거리 이상 움직였다면 드래깅으로 간주
    if (dragDistance > 5) {
      setIsDrag(true);
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        onMouseDown={(e) => {
          handleMouseDown(e as unknown as MouseEvent<HTMLDivElement, MouseEvent>);
        }}
        onMouseUp={(e) => {
          handleMouseUp(e as unknown as MouseEvent<HTMLDivElement, MouseEvent>);
        }}
        onMouseMove={(e) => {
          handleMouseMove(e as unknown as MouseEvent<HTMLDivElement, MouseEvent>);
        }}
        {...attributes}
        {...listeners}
        className={clsx("min-w-full", className, {})}
        style={{
          transform: CSS.Transform.toString(transform),
        }}
      >
        <div id={id}>{children}</div>
      </div>
      {/* <TicketModal sliceName={sliceName} modalOpen={modalOpen} setModalOpen={setModalOpen} /> */}
    </>
  );
};
