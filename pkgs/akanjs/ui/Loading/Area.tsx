import { AiOutlineLoading } from "react-icons/ai";

export const Area = () => {
  return (
    <div className="absolute inset-0 flex size-full items-center justify-center bg-border/30">
      <div className="text-center">
        <AiOutlineLoading className="mx-auto animate-spin text-primary/60 text-sm" />
        <div className="z-10 text-sm">Loading</div>
      </div>
    </div>
  );
};
