import { cn } from "akanjs/client";
import { FriendFace } from "./FriendFace";
import { FriendLayer } from "./FriendLayer";

const sparklePath = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";
const trail = [
  "top-[14%] left-[86%] w-[10%] text-moon [--delay:330ms]",
  "top-[-22%] left-[98%] w-[8%] text-cloud [--delay:520ms]",
  "top-[-30%] left-[52%] w-[9%] text-moon [--delay:760ms]",
] as const;
const burst = [
  "top-[8%] left-[96%] w-[11%] text-moon",
  "top-[60%] left-[100%] w-[8%] text-cloud [--delay:60ms]",
  "top-[2%] left-[56%] w-[7%] text-planet [--delay:120ms]",
  "top-[72%] left-[56%] w-[6%] text-moon [--delay:90ms]",
] as const;

interface CometFriendProps {
  priority?: boolean;
}
export const CometFriend = ({ priority }: CometFriendProps) => {
  return (
    <>
      <span className="friend-fx">
        {trail.map((spark) => (
          <svg className={cn("comet-trail friend-detail", spark)} key={spark} viewBox="0 0 24 24">
            <path d={sparklePath} />
          </svg>
        ))}
      </span>
      <span className="friend-act">
        <span className="friend-idle">
          <span className="comet-tail">
            <span className="comet-wag">
              <FriendLayer className="comet-tail-cut" priority={priority} src="/jelly/comet.webp" />
            </span>
          </span>
          <FriendLayer className="comet-head-cut" priority={priority} src="/jelly/comet.webp" />
          <span className="comet-headset">
            <FriendLayer src="/jelly/friends/comet-prop.webp" />
          </span>
          <FriendFace name="comet" />
          <span className="comet-bubble friend-detail">
            <span />
            <span />
            <span />
          </span>
        </span>
      </span>
      <span className="friend-fx">
        {burst.map((spark) => (
          <svg className={cn("comet-burst friend-detail", spark)} key={spark} viewBox="0 0 24 24">
            <path d={sparklePath} />
          </svg>
        ))}
      </span>
    </>
  );
};
