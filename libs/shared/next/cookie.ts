import { baseClientEnv } from "@akanjs/base";
import { getAccount, router } from "@akanjs/client";
import { Me, Self } from "@shared/base";
import React from "react";

export interface GetOption {
  unauthorize: string;
}

export function getMe<O extends GetOption | undefined>(option?: O): O extends GetOption ? Me : Me | undefined {
  const me = getAccount<{ me?: Me }>().me;
  if (!me && option) {
    if (option.unauthorize === "notFound") router.notFound();
    else if (baseClientEnv.side === "client") router.replace(option.unauthorize);
    else React.use(router.redirect(option.unauthorize));
  }
  return me as unknown as Me;
}

export function getSelf<O extends GetOption | undefined>(option?: O): O extends GetOption ? Self : Self | undefined {
  const self = getAccount<{ self?: Self }>().self;
  if (!self && option) {
    if (option.unauthorize === "notFound") router.notFound();
    else if (baseClientEnv.side === "client") router.replace(option.unauthorize);
    else React.use(router.redirect(option.unauthorize));
  }
  return self as unknown as Self;
}
