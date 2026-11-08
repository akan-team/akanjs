"use client";
import { DraftStore } from "akanjs/store";
import { useEffect } from "react";
import type { AgentSession } from "use-agentic";
import { forgetOtherAccounts } from "./agentSessionOf";

export const useAccountBoundSession = (session: AgentSession) => {
  useEffect(() => {
    let owner = DraftStore.identity();
    const recheck = () => {
      const signedIn = DraftStore.identity();
      if (signedIn === owner) return;
      owner = signedIn;
      void session.reset();
      forgetOtherAccounts(signedIn);
    };
    window.addEventListener("akan:auth", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      window.removeEventListener("akan:auth", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [session]);
};
