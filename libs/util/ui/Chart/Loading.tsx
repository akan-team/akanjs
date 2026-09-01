import { AiOutlineLoading } from "react-icons/ai";
export const Loading = () => {
  return (
    <div className="flex h-[760px] w-full animate-pulse items-center justify-center rounded-lg bg-muted">
      <AiOutlineLoading className="size-10 animate-spin" />
    </div>
  );
};
