"use client";
import { st, usePage } from "@libs/shared/client";
import { useEffect } from "react";

interface CallbackProps {
  className?: string;
  state: string;
  code: string;
  iss: string | null;
  error: string | null;
}
export const Callback = ({ className, state, code, iss, error }: CallbackProps) => {
  const { l } = usePage();
  const callback = st.use.remoteCallback();
  useEffect(() => {
    if (!error && state && code) void st.do.completeRemoteConnection(state, code, iss).catch(() => null);
  }, [state, code]);
  const status = error || !state || !code ? "failed" : callback?.state === state ? callback.status : "connecting";
  return (
    <p className={className}>
      {status === "connected"
        ? l("remote.connected")
        : status === "connecting"
          ? l("remote.connecting")
          : l(error === "access_denied" ? "remote.denied" : "remote.failed")}
    </p>
  );
};
