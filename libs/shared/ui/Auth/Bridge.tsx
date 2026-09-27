"use client";
import { cnst, st } from "@libs/shared/client";
import { ConstantRegistry } from "akanjs/constant";
import { useFetch } from "akanjs/webkit";
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
    //? the app's own user model extends this lib's with its methods, and it is the one registered last
    const User = ConstantRegistry.getDatabase("user").full as typeof cnst.User;
    st.set({
      ...(me ? { me: new cnst.Admin().set(me as cnst.Admin) } : {}),
      ...(self ? { self: new User().set(self as cnst.User) } : {}),
    });
  }, [meFullfilled, selfFullfilled]);
  return null;
};
