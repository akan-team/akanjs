"use client";
import { useFetch } from "@akanjs/next";
import { cnst, st } from "@shared/client";
import { useEffect } from "react";

interface BridgeProps {
  mePromise?: Promise<{ id: string } | null>;
  selfPromise?: Promise<{ id: string } | null>;
}

export const Bridge = ({ mePromise, selfPromise }: BridgeProps) => {
  const { fulfilled: meFullfilled, value: me } = useFetch(mePromise);
  const { fulfilled: selfFullfilled, value: self } = useFetch(selfPromise);
  useEffect(() => {
    if (!meFullfilled || !selfFullfilled) return;
    st.set({
      ...(me ? { me: cnst.admin.crystalize(me as cnst.Admin) } : {}),
      ...(self ? { self: cnst.user.crystalize(self as cnst.User) } : {}),
    });
  }, [meFullfilled, selfFullfilled]);
  return null;
};
