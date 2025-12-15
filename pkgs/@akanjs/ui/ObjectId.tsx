"use client";
import { useState } from "react";
import { AiOutlineCheck, AiOutlineCopy } from "react-icons/ai";

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
      <div className="tooltip tooltip-primary" data-tip={id}>
        <div className="text-xs font-semibold">{shortenedId}</div>
      </div>
      <button className="btn btn-circle btn-xs" onClick={handleCopyClick}>
        {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
      </button>
    </div>
  );
};
