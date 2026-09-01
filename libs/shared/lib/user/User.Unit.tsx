import type { cnst } from "@libs/shared/client";
import { Avatar as AvatarUI } from "@libs/util/ui";
import type { ModelProps } from "akanjs/client";
import { Tooltip } from "akanjs/ui";

export const Card = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return <div>{user.id}</div>;
};

export const Avatar = ({ user }: ModelProps<"user", cnst.LightUser>) => {
  return (
    <Tooltip content={user.nickname}>
      <AvatarUI src={user.image?.url} />
    </Tooltip>
  );
};
