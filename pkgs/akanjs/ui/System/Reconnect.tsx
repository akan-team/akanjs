"use client";
import { cn, fetch, usePage } from "akanjs/client";
import { useInterval } from "akanjs/webkit";
import { useCallback, useEffect, useRef, useState } from "react";
import { TbPlugConnected, TbPlugConnectedX } from "react-icons/tb";
import { overlayZ } from "../overlayLayer";

const DOTS_LENGTH = 4;

export const Reconnect = () => {
  const { l } = usePage();
  const devMode = process.env.AKAN_PUBLIC_ENV === "local";
  const [dots, setDots] = useState(0);
  const [connectStatus, setConnectStatus] = useState<
    "initial" | "normal" | "connected" | "disconnected" | "connecting"
  >("initial");
  const wasHiddenOnDisconnect = useRef(false);

  const handleConnect = useCallback(() => {
    wasHiddenOnDisconnect.current = false;
    setConnectStatus((prev) => (prev === "normal" || prev === "initial" ? prev : "connected"));
  }, []);

  const handleDisconnect = async () => {
    if (document.hidden) {
      wasHiddenOnDisconnect.current = true;
      return;
    }

    try {
      await (fetch as unknown as { ping: () => Promise<string> }).ping();
    } catch {
      setConnectStatus((prev) => (prev === "normal" || prev === "initial" ? "disconnected" : prev));
      setTimeout(() => {
        setConnectStatus((prev) => (prev === "disconnected" ? "connecting" : prev));
      }, 2000);
    }
  };

  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden && wasHiddenOnDisconnect.current) {
      if (fetch.ws.connected) {
        wasHiddenOnDisconnect.current = false;
        setConnectStatus("normal");
      } else {
        void handleDisconnect();
      }
    }
  }, []);

  useEffect(() => {
    fetch.ws.on("connect", handleConnect);
    fetch.ws.on("disconnect", handleDisconnect);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    setTimeout(() => {
      if (connectStatus !== "initial") return;
      if (fetch.ws.connected) setConnectStatus("normal");
      else void handleDisconnect();
    }, 1000);

    return () => {
      fetch.ws.off("connect", handleConnect);
      fetch.ws.off("disconnect", handleDisconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleConnect, handleVisibilityChange]);

  useEffect(() => {
    if (connectStatus === "connected") window.location.reload();
  }, [connectStatus]);

  useInterval(() => {
    if (connectStatus === "connecting") setDots((prev) => (prev + 1) % DOTS_LENGTH);
  }, 500);
  if (!devMode) return null;
  if (process.env.AKAN_PUBLIC_ENV !== "local") return null;
  if (connectStatus === "initial" || connectStatus === "normal") return null;
  return (
    <div
      className="fixed inset-0 flex animate-fadeIn flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
      style={{ zIndex: overlayZ.reconnect }}
    >
      <div className="flex w-[min(90vw,26rem)] flex-col items-center gap-4 rounded-box border border-border bg-card p-8 text-center text-card-foreground shadow-2xl">
        <div
          className={cn(
            "flex size-20 items-center justify-center rounded-full text-4xl",
            connectStatus === "connected" ? "bg-success/15 text-success" : "bg-muted text-foreground/40",
            connectStatus === "connecting" && "animate-pulse",
          )}
        >
          {connectStatus === "connected" ? <TbPlugConnected /> : <TbPlugConnectedX />}
        </div>
        <div className="font-bold text-2xl leading-snug">
          {connectStatus === "disconnected"
            ? l("base.somethingWrong")
            : connectStatus === "connecting"
              ? l("base.connecting")
              : l("base.connected")}
        </div>
        <div className="text-foreground/70 text-sm">
          {connectStatus === "connected" ? (
            l("base.refreshing")
          ) : connectStatus === "connecting" ? (
            <span>
              {l("base.tryReconnecting")}
              {".".repeat(dots + 1)}
            </span>
          ) : (
            l("base.serverDisconnected")
          )}
        </div>
        <div className={cn("text-muted-foreground text-sm leading-snug", connectStatus === "connected" && "invisible")}>
          <div>{l("base.serverHasProblem")}</div>
          <div className="font-bold">{l("base.checkServerStatus")}</div>
        </div>
      </div>
    </div>
  );
};
