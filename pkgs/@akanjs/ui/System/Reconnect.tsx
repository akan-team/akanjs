"use client";
import { clsx, usePage } from "@akanjs/client";
import { useInterval } from "@akanjs/next";
import { client } from "@akanjs/signal";
import { useCallback, useEffect, useRef, useState } from "react";
import { TbPlugConnected, TbPlugConnectedX } from "react-icons/tb";

const DOTS_LENGTH = 4;

export const Reconnect = () => {
  const { l } = usePage();
  const devMode = process.env.NEXT_PUBLIC_ENV === "local";
  if (!devMode) return null;
  const [dots, setDots] = useState(0);
  const [connectStatus, setConnectStatus] = useState<
    "initial" | "normal" | "connected" | "disconnected" | "connecting"
  >("initial");
  const wasHiddenOnDisconnect = useRef(false);

  if (process.env.NEXT_PUBLIC_ENV !== "local") return null;

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
      const io = client.getIo();

      // socket이 연결되어 있으면 문제없음
      if (io.socket.connected) {
        wasHiddenOnDisconnect.current = false;
        setConnectStatus("normal");
      } else {
        // socket이 끊어져 있으면 실제 서버 문제인지 확인
        void handleDisconnect();
      }
    }
  }, []);

  useEffect(() => {
    const io = client.getIo();
    io.socket.on("connect", handleConnect);
    io.socket.on("disconnect", () => handleDisconnect());

    // Page Visibility API 이벤트 리스너 추가
    document.addEventListener("visibilitychange", handleVisibilityChange);

    setTimeout(() => {
      if (connectStatus !== "initial") return;
      if (client.getIo().socket.connected) setConnectStatus("normal");
      else void handleDisconnect();
    }, 1000);

    return () => {
      io.socket.off("connect", handleConnect);
      io.socket.off("disconnect", handleDisconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleConnect, handleVisibilityChange]);

  useEffect(() => {
    if (connectStatus === "connected") window.location.reload();
  }, [connectStatus]);

  useInterval(() => {
    if (connectStatus === "connecting") setDots((prev) => (prev + 1) % DOTS_LENGTH);
  }, 500);

  if (connectStatus === "initial" || connectStatus === "normal") return null;
  return (
    <div className="animate-fadeIn bg-base-100/50 fixed top-0 left-0 flex h-screen w-screen flex-col items-center justify-center">
      <div className="bg-base-300 flex w-4/5 flex-col items-center justify-center rounded-md p-5 md:w-1/3">
        <div className="text-3xl font-bold whitespace-nowrap">
          {connectStatus === "disconnected"
            ? l("base.somethingWrong")
            : connectStatus === "connecting"
              ? l("base.connecting")
              : l("base.connected")}
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="py-5">
            {connectStatus === "disconnected" ? (
              <div className="text-[150px] text-gray-500">
                <TbPlugConnectedX />
              </div>
            ) : connectStatus === "connecting" ? (
              <div className="animate-pulse py-5 text-[150px] text-gray-500">
                <TbPlugConnectedX />
              </div>
            ) : (
              <div className="animate-pop text-[150px] text-white">
                <TbPlugConnected />
              </div>
            )}
          </div>

          {connectStatus === "connected" ? (
            <>
              <div className="animate-pop"></div>
              <span>
                <span className="text-lg">{l("base.refreshing")}</span>
              </span>
            </>
          ) : connectStatus === "connecting" ? (
            <div className="flex items-center justify-center">
              <div className="text-lg">{l("base.tryReconnecting")}</div>
              <div className="flex items-center">
                {Array.from({ length: DOTS_LENGTH }).map((_, index) =>
                  dots >= index ? (
                    <div key={index} className="visible">
                      .
                    </div>
                  ) : (
                    <div key={index} className="invisible">
                      .
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="text-lg">{l("base.serverDisconnected")}</div>
          )}
        </div>

        <div
          className={clsx(
            "mt-2 text-center text-sm leading-tight text-gray-500",
            connectStatus === "disconnected" || connectStatus === "connecting" ? "visible" : "invisible"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center justify-center">
              <div>{l("base.serverHasProblem")}</div>
              <div className="font-bold">{l("base.checkServerStatus")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
