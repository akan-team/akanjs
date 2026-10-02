import { cn } from "akanjs/client";

const faceClass = {
  planet: {
    eyes: ["friend-eye top-[40.5%] left-[34.5%] w-[12%]", "friend-eye top-[39.5%] left-[64.5%] w-[12%]"],
    mouth: "friend-mouth top-[54.2%] left-[49.5%] w-[7.5%]",
    blush: ["friend-blush top-[53.5%] left-[30%]", "friend-blush top-[52.5%] left-[69%]"],
  },
  rocket: {
    eyes: ["friend-eye top-[52%] left-[43.5%] w-[11%]", "friend-eye top-[52%] left-[59.5%] w-[11%]"],
    mouth: "friend-mouth top-[59.5%] left-[51.5%] w-[8%]",
    blush: ["friend-blush top-[58.5%] left-[36.5%]", "friend-blush top-[58.5%] left-[66.5%]"],
  },
  moon: {
    eyes: ["friend-eye top-[47%] left-[41.5%] w-[10%]", "friend-eye top-[45.5%] left-[53%] w-[10%]"],
    mouth: "friend-mouth top-[54%] left-[47.8%] w-[7%]",
    blush: ["friend-blush top-[54.5%] left-[39%]", "friend-blush top-[52.5%] left-[57%]"],
  },
  cloud: {
    eyes: ["friend-eye top-[56%] left-[39%] w-[12%]", "friend-eye top-[56.5%] left-[61%] w-[12%]"],
    mouth: "friend-mouth top-[63.5%] left-[50%] w-[8%]",
    blush: ["friend-blush top-[64%] left-[31%]", "friend-blush top-[64.5%] left-[69%]"],
  },
  comet: {
    eyes: ["friend-eye top-[42%] left-[64%] w-[11%]", "friend-eye top-[40%] left-[84%] w-[11%]"],
    mouth: "friend-mouth top-[47.8%] left-[75%] w-[7%]",
    blush: ["friend-blush top-[50%] left-[60%]", "friend-blush top-[48%] left-[89%]"],
  },
} as const;

interface FriendFaceProps {
  className?: string;
  name: keyof typeof faceClass;
}
export const FriendFace = ({ className, name }: FriendFaceProps) => {
  const face = faceClass[name];
  return (
    <span className={cn("friend-face", className)}>
      {face.blush.map((position) => (
        <span className={position} key={position} />
      ))}
      {face.eyes.map((position) => (
        <span className={position} data-friend-eye="" key={position}>
          <span className="friend-pupil" />
          <span className="friend-gloss" />
          <span className="friend-lid" />
          <span className="friend-lid-low" />
        </span>
      ))}
      <span className={face.mouth}>
        <svg viewBox="0 0 24 16">
          <path className="friend-smile" d="M4.5 5.2Q12 13.6 19.5 5.2" />
          <path className="friend-grin" d="M3.6 4.2Q12 5.6 20.4 4.2Q19.6 14.8 12 14.8Q4.4 14.8 3.6 4.2Z" />
          <ellipse className="friend-gasp" cx="12" cy="8.4" rx="4.4" ry="5.4" />
        </svg>
      </span>
    </span>
  );
};
