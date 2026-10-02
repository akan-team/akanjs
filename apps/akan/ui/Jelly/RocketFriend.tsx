import { cn } from "akanjs/client";
import { FriendFace } from "./FriendFace";
import { FriendLayer } from "./FriendLayer";

const padPuffs = [
  "left-[30%] [--puff-x:-9cqw]",
  "left-[51%] [--puff-x:0cqw] [--delay:60ms]",
  "left-[72%] [--puff-x:9cqw]",
] as const;
const nozzlePuffs = [
  "left-[46%] [--puff-x:-4cqw]",
  "left-[53%] [--puff-x:3cqw] [--delay:-180ms]",
  "left-[50%] [--puff-x:-1cqw] [--delay:-360ms]",
] as const;
const speedLines = [
  "rocket-line friend-detail left-[40%]",
  "rocket-line friend-detail left-[51%] [--delay:40ms]",
  "rocket-line friend-detail left-[62%] [--delay:80ms]",
] as const;

interface RocketFriendProps {
  priority?: boolean;
}
export const RocketFriend = ({ priority }: RocketFriendProps) => {
  return (
    <>
      <span className="friend-fx">
        {padPuffs.map((puff) => (
          <span className={cn("rocket-pad friend-detail", puff)} key={puff} />
        ))}
      </span>
      <span className="friend-act">
        <span className="friend-idle">
          <span className="rocket-glow" />
          {speedLines.map((line) => (
            <span className={line} key={line} />
          ))}
          <FriendLayer priority={priority} src="/jelly/rocket.webp" />
          {nozzlePuffs.map((puff) => (
            <span className={cn("rocket-puff friend-detail", puff)} key={puff} />
          ))}
          <FriendFace name="rocket" />
          <span className="rocket-goggles">
            <FriendLayer src="/jelly/friends/rocket-prop.webp" />
          </span>
        </span>
      </span>
    </>
  );
};
