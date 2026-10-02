import { cn } from "akanjs/client";
import { FriendFace } from "./FriendFace";
import { FriendLayer } from "./FriendLayer";

const replicas = ["cloud-replica-l", "cloud-replica-r"] as const;
const drops = [
  "left-[28%] w-[4.5%]",
  "left-[40%] w-[5%] [--delay:180ms]",
  "left-[52%] w-[4.5%] [--delay:60ms]",
  "left-[63%] w-[5%] [--delay:300ms]",
  "left-[74%] w-[4%] [--delay:140ms]",
  "left-[46%] w-[4%] [--delay:420ms]",
] as const;

interface CloudFriendProps {
  priority?: boolean;
}
export const CloudFriend = ({ priority }: CloudFriendProps) => {
  return (
    <>
      <span className="friend-fx">
        {replicas.map((replica) => (
          <span className={cn("cloud-replica friend-detail", replica)} key={replica}>
            <span className="cloud-replica-bob">
              <FriendLayer src="/jelly/cloud.webp" />
              <span className="cloud-replica-eyes" />
            </span>
          </span>
        ))}
      </span>
      <span className="friend-act">
        <span className="friend-idle">
          <FriendLayer priority={priority} src="/jelly/cloud.webp" />
          <FriendFace name="cloud" />
          <span className="cloud-hat">
            <FriendLayer src="/jelly/friends/cloud-prop.webp" />
          </span>
        </span>
      </span>
      <span className="friend-fx">
        {drops.map((drop) => (
          <svg className={cn("cloud-drop friend-detail", drop)} key={drop} viewBox="0 0 16 24">
            <path d="M8 1.5C10.5 7 14 10.6 14 15.4A6 6 0 0 1 2 15.4C2 10.6 5.5 7 8 1.5Z" />
          </svg>
        ))}
      </span>
    </>
  );
};
