"use client";
import { useState } from "react";
import { AiOutlineCheck, AiOutlineCopy } from "react-icons/ai";

import { buttonRecipe } from "./Button";
import { Tooltip } from "./Tooltip";

interface ObjectIdProps {
  id: string;
}

export const ObjectId = ({ id }: ObjectIdProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const shortenedId = `${id.substring(0, 4)}...${id.substring(id.length - 5)}`;
  const handleCopyClick = () => {
    void navigator.clipboard.writeText(id);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={id} variant="primary">
        <div className="font-semibold text-xs">{shortenedId}</div>
      </Tooltip>
      <button
        className={buttonRecipe({ variant: "ghost", size: "icon" }, "size-6 rounded-full")}
        onClick={handleCopyClick}
      >
        {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
      </button>
    </div>
  );
};
