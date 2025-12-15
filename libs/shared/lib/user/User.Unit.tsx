import { ModelProps } from "@akanjs/client";
import { Avatar as AvatarUI } from "@util/ui";

import * as cnst from "../cnst";

export const Card = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return <div>{user.id}</div>;
};

export const Avatar = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <div data-tip={user.nickname} className="tooltip">
      <AvatarUI src={user.image?.url} />
    </div>
  );
};
