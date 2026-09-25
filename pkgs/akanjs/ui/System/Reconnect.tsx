"use client";
import { cn, fetch, usePage } from "akanjs/client";
import { useInterval } from "akanjs/webkit";
// import { client } from "akanjs/signal";
import { useCallback, useEffect, useRef, useState } from "react";
import { TbPlugConnected, TbPlugConnectedX } from "react-icons/tb";

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
    // 페이지가 백그라운드 상태에서 disconnect가 발생하면 무시
    if (document.hidden) {
      wasHiddenOnDisconnect.current = true;
      return;
    }

    try {
      await (fetch as unknown as { ping: () => Promise<string> }).ping();
    } catch (e) {
      setConnectStatus((prev) => (prev === "normal" || prev === "initial" ? "disconnected" : prev));
      setTimeout(() => {
        setConnectStatus((prev) => (prev === "disconnected" ? "connecting" : prev));
      }, 2000);
    }
  };

  const handleVisibilityChange = useCallback(() => {
    // 페이지가 다시 보이게 될 때
    if (!document.hidden && wasHiddenOnDisconnect.current) {
      // socket이 연결되어 있으면 문제없음
      if (fetch.ws.connected) {
        wasHiddenOnDisconnect.current = false;
        setConnectStatus("normal");
      } else {
        // socket이 끊어져 있으면 실제 서버 문제인지 확인
        void handleDisconnect();
      }
    }
  }, []);

  useEffect(() => {
    fetch.ws.on("connect", handleConnect);
    fetch.ws.on("disconnect", () => handleDisconnect());

    // Page Visibility API 이벤트 리스너 추가
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
    <div className="fixed inset-0 z-[200] flex animate-fadeIn flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
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
