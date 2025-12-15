import { Dayjs } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { ReactNode } from "react";

interface ChatBubbleProps {
  className?: string;
  wrapperClassName?: string;
  bodyClassName?: string;
  avatarClassName?: string;
  avatar?: ReactNode;
  hasPrev?: boolean;
  hasNext?: boolean;
  isMe?: boolean;
  name?: string;
  at?: Dayjs | null;
  children: any;
}
export const ChatBubble = ({
  className,
  wrapperClassName,
  bodyClassName,
  avatarClassName,
  avatar,
  hasPrev = false,
  hasNext = false,
  isMe = false,
  name,
  at,
  children,
}: ChatBubbleProps) => {
  const roundingClassName = !isMe
    ? `${hasPrev ? "rounded-tl-sm" : ""} ${hasNext ? "rounded-bl-sm" : ""}`
    : `${hasPrev ? "rounded-tr-sm" : ""} ${hasNext ? "rounded-br-sm" : ""}`;

  return (
    <div className={clsx("flex w-full gap-2", isMe ? "justify-end" : "justify-start", wrapperClassName)}>
      {avatar && !isMe ? avatar : null}
      <div className={bodyClassName}>
        <div className={`flex w-full text-xs ${!isMe ? "justify-start" : "justify-end "}`}>
          {name ? <p className="text-sm">{name}</p> : null}
        </div>
        <div className={clsx("flex items-end gap-1", isMe ? "flex-row-reverse" : "flex-row")}>
          <div className={clsx("bg-base-200 w-full rounded-2xl px-3 py-2", roundingClassName, className)}>
            {children}
          </div>
          {at ? (
            <div className={`mt-1 flex text-xs`}>
              {/* <RecentTime date={at} format="full"  /> */}
              {/* ?맞을진 모르겠으나 일반적으론 시:분만 표기해서 바꿈 RecentTime*/}
              {at.format("HH:mm")}
            </div>
          ) : null}
        </div>
      </div>
      {avatar && isMe ? avatar : null}
    </div>
  );
};
