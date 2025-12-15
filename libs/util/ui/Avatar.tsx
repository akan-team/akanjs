import { clsx } from "@akanjs/client";
import { Image } from "@akanjs/ui";
import { ReactNode } from "react";
import { AiOutlineUser } from "react-icons/ai";

interface AvatarProps {
  className?: string;
  icon?: ReactNode;
  src?: string;
}

export const Avatar = ({ className = "", icon, src = "" }: AvatarProps) => {
  return (
    <div className={clsx("avatar relative size-6 overflow-hidden rounded-full bg-gray-300", className)}>
      {src ? (
        <Image src={src} className="object-cover" style={{ borderRadius: "50%" }} width={128} height={128} />
      ) : icon ? (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white">
          <div className="">{icon}</div>
        </div>
      ) : (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white">
          <AiOutlineUser />
        </div>
      )}
    </div>
  );
};
