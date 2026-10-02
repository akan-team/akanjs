import { cn } from "akanjs/client";
import { CloudFriend } from "./CloudFriend";
import { CometFriend } from "./CometFriend";
import { FriendHost } from "./FriendHost";
import { MoonFriend } from "./MoonFriend";
import { PlanetFriend } from "./PlanetFriend";
import { RocketFriend } from "./RocketFriend";

const friendArt = {
  planet: PlanetFriend,
  rocket: RocketFriend,
  moon: MoonFriend,
  cloud: CloudFriend,
  comet: CometFriend,
} as const;

export interface FriendProps {
  className?: string;
  name: keyof typeof friendArt;
  priority?: boolean;
  interactive?: boolean;
  still?: boolean;
}
export const Friend = ({ className, name, priority, interactive = true, still = false }: FriendProps) => {
  const Art = friendArt[name];
  return (
    <FriendHost
      className={cn("friend relative inline-block size-16 select-none", className)}
      isStill={still}
      name={name}
    >
      <Art priority={priority} />
      {interactive ? <span className="friend-hit" /> : null}
    </FriendHost>
  );
};
