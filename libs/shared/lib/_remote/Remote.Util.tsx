"use client";
import { st, usePage } from "@libs/shared/client";
import { RemoteHandshake } from "@libs/shared/webkit";
import { buttonRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useState } from "react";

interface ConnectProps {
  className?: string;
  url: string;
  children?: ReactNode;
  onConnected?: () => void;
}
export const Connect = ({ className, url, children, onConnected }: ConnectProps) => {
  const { l } = usePage();
  const [waiting, setWaiting] = useState(false);
  useEffect(
    () =>
      RemoteHandshake.listen(url, () => {
        setWaiting(false);
        onConnected?.();
      }),
    [url],
  );
  return (
    <button
      type="button"
      className={cn(buttonRecipe({ variant: "primary", size: "sm" }), className)}
      disabled={waiting}
      onClick={() => {
        setWaiting(true);
        st.do.connectRemote(url).catch(() => setWaiting(false));
      }}
    >
      {waiting ? l("remote.waiting") : (children ?? l("remote.connect"))}
    </button>
  );
};
