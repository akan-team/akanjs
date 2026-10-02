import { cn } from "akanjs/client";
import { FriendFace } from "./FriendFace";
import { FriendLayer } from "./FriendLayer";

const zees = [
  "moon-z top-[24%] left-[80%] w-[10%]",
  "moon-z top-[12%] left-[88%] w-[8%] [--delay:-1.2s]",
  "moon-z top-[3%] left-[95%] w-[6%] [--delay:-2.4s]",
] as const;
const notes = [
  { position: "top-[30%] left-[8%] [--note-r:-18deg] [--note-x:-9cqw]", isPair: false },
  { position: "moon-note-hum top-[26%] left-[70%] [--note-r:16deg] [--note-x:9cqw] [--delay:220ms]", isPair: true },
  { position: "top-[44%] left-[2%] [--note-r:-10deg] [--note-x:-13cqw] [--delay:640ms]", isPair: true },
  { position: "top-[40%] left-[76%] [--note-r:22deg] [--note-x:12cqw] [--delay:980ms]", isPair: false },
] as const;

interface MoonFriendProps {
  priority?: boolean;
}
export const MoonFriend = ({ priority }: MoonFriendProps) => {
  return (
    <>
      <span className="friend-act">
        <span className="friend-idle">
          <FriendLayer priority={priority} src="/jelly/moon.webp" />
          <span className="moon-phones">
            <FriendLayer src="/jelly/friends/moon-prop.webp" />
            <span className="moon-led" />
          </span>
          <FriendFace name="moon" />
        </span>
      </span>
      <span className="friend-fx">
        <span className="moon-zzz">
          {zees.map((zee) => (
            <svg className={zee} key={zee} viewBox="0 0 24 24">
              <path d="M5 5H19L5 19H19" />
            </svg>
          ))}
        </span>
        <svg className="moon-bang" viewBox="0 0 24 48">
          <path d="M12 6V30" />
          <circle cx="12" cy="41" r="3.6" />
        </svg>
        {notes.map((note) => (
          <svg className={cn("moon-note friend-detail", note.position)} key={note.position} viewBox="0 0 24 24">
            {note.isPair ? (
              <>
                <ellipse cx="5.5" cy="18.5" rx="3.6" ry="2.8" transform="rotate(-22 5.5 18.5)" />
                <ellipse cx="17" cy="16" rx="3.6" ry="2.8" transform="rotate(-22 17 16)" />
                <path className="moon-note-stem" d="M8.6 17.6V5.2L20 2.6V15" />
              </>
            ) : (
              <>
                <ellipse cx="7" cy="18.5" rx="3.8" ry="2.9" transform="rotate(-22 7 18.5)" />
                <path className="moon-note-stem" d="M10.3 17.6V3.4C13 4.8 16.6 6 16.6 10.2" />
              </>
            )}
          </svg>
        ))}
      </span>
    </>
  );
};
