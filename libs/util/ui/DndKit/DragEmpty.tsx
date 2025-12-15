"use client";

import { useSortable } from "@dnd-kit/sortable";
import { usePage } from "@util/client";
import { BiFolderOpen } from "react-icons/bi";

interface DragEmptyProps {
  columnId: string;
}

export const DragEmpty = ({ columnId }: DragEmptyProps) => {
  const { l } = usePage();
  const { attributes, listeners, setNodeRef, transform, isOver, isDragging } = useSortable({
    id: `${columnId}-empty`,
    disabled: true, // 드래그 비활성화
  });
  const onClick = () => {
    // const message = "뭘 봐";
    // msg.info(message);
  };
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="h-[200px] w-full cursor-default" onClick={onClick}>
      <div className="text-primary/50 flex size-full flex-col items-center justify-center gap-2 text-2xl">
        {/* <Empty /> */}
        <BiFolderOpen />
        <div>{l("base.noData")}</div>
      </div>
    </div>
  );
};
