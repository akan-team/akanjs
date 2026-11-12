"use client";
import { router } from "akanjs/client";
import { useEffect, useId } from "react";

export const refreshes = { count: 0 };

export const RouterBridge = () => {
  useEffect(() => {
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: () => undefined,
        back: () => undefined,
        refresh: () => void refreshes.count++,
      },
    });
  }, []);
  return null;
};

export const UsesId = () => <b id={useId()}>uses id</b>;
