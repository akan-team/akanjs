"use client";
import { DraftStore } from "akanjs/store";
import { useEffect } from "react";
import type { AgentSession } from "use-agentic";
import { forgetOtherAccounts, ownHistoryOf } from "./agentSessionOf";

export const useAccountBoundSession = (session: AgentSession | null) => {
  useEffect(() => {
    if (!session) return;
    let owner = DraftStore.identity();
    const recheck = () => {
      const signedIn = DraftStore.identity();
      if (signedIn === owner) return;
      owner = signedIn;
      //? An app's history keeps what it stored; only the web-storage transcript this session wrote is cleared.
      void session.reset({ keepHistory: true }).then(() => ownHistoryOf(session)?.clear());
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
