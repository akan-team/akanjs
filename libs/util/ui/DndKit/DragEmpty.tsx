"use client";

import { useSortable } from "@dnd-kit/sortable";
import { usePage } from "@libs/util/client";
import { BiFolderOpen } from "react-icons/bi";

interface DragEmptyProps {
  columnId: string;
}

export default function DragEmpty({ columnId }: DragEmptyProps) {
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
      <div className="flex size-full flex-col items-center justify-center gap-2 text-2xl text-primary/50">
        {/* <Empty /> */}
        <BiFolderOpen />
        <div>{l("base.noData")}</div>
      </div>
    </div>
  );
}
