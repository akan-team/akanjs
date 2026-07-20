import type { cnst } from "@libs/shared/client";
import type { ModelProps } from "akanjs/client";

export const Card = ({ className, notification }: ModelProps<"notification", cnst.LightNotification>) => {
  return <div>{notification.id}</div>;
};
