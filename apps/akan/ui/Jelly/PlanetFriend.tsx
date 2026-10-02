import { FriendFace } from "./FriendFace";
import { FriendLayer } from "./FriendLayer";

interface PlanetFriendProps {
  priority?: boolean;
}
export const PlanetFriend = ({ priority }: PlanetFriendProps) => {
  return (
    <>
      <span className="friend-act">
        <span className="friend-idle">
          <FriendLayer priority={priority} src="/jelly/planet.webp" />
          <svg className="planet-orbit" viewBox="0 0 100 100">
            <ellipse
              className="planet-streak"
              cx="51"
              cy="51"
              pathLength={100}
              rx="44.5"
              ry="11.5"
              transform="rotate(-13 51 51)"
            />
            <ellipse
              className="planet-streak planet-streak-fast"
              cx="51"
              cy="51"
              pathLength={100}
              rx="44.5"
              ry="11.5"
              transform="rotate(-13 51 51)"
            />
          </svg>
          <FriendFace name="planet" />
          <span className="planet-glasses">
            <FriendLayer src="/jelly/friends/planet-prop.webp" />
            <span className="planet-glint" />
          </span>
        </span>
      </span>
      <span className="friend-fx">
        <svg className="planet-reload friend-detail" viewBox="0 0 100 100">
          <path d="M87 20.8A47 47 0 1 1 42.8 4.7" pathLength={100} />
          <path className="planet-reload-tip" d="M36.5 -1.5L43.6 4.6L36.8 11" />
        </svg>
      </span>
    </>
  );
};
