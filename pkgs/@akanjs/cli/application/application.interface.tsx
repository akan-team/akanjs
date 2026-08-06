"use client";
import type { ChildProcess } from "node:child_process";
import type EventEmitter from "node:events";
import type { App as AppType } from "@akanjs/devkit/commandDecorators";
import { MultiScrollList } from "@akanjs/devkit/ui";
import { useStdoutDimensions } from "@akanjs/devkit/useStdoutDimensions";
import { Box, render, Text, useApp } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface BackendProps {
  appName: string;
  childProcess: ChildProcess;
  onExit: () => void;
}

const Backend = ({ appName, childProcess, onExit }: BackendProps) => {
  const [width, height] = useStdoutDimensions();
  useEffect(() => {
    // setInterval(() => {
    //   setLogs((prevLogs) => [...prevLogs, "test" + new Date().toISOString()]);
    // }, 300);

    return () => {
      childProcess.kill();
      onExit();
    };
  }, [childProcess, onExit]);

  return (
    <Box width={width} height={height}>
      <Text bold>Akan.JS Backend</Text>
    </Box>
  );
};

interface FrontendProps {
  appName: string;
  childProcess: ChildProcess;
  onExit: () => void;
}

const Frontend = ({ appName, childProcess, onExit }: FrontendProps) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [width, height] = useStdoutDimensions();

  useEffect(() => {
    childProcess.stdout?.on("data", (data: Buffer) => {
      const newOutput = data.toString().split("\n");
      setLogs((prevLogs) => [...prevLogs, ...newOutput]);
    });
    childProcess.stderr?.on("data", (data: Buffer) => {
      const newOutput = data.toString().split("\n");
      setLogs((prevLogs) => [...prevLogs, ...newOutput]);
    });

    return () => {
      childProcess.kill();
      onExit();
    };
  }, [childProcess, onExit]);

  return (
    <Box width={width} height={height} flexDirection="column">
      <Text bold>{appName} Frontend</Text>
      {logs.map((log) => (
        <Text key={log}>{log}</Text>
      ))}
    </Box>
  );
};

interface CsrProps {
  app: AppType;
  event: EventEmitter;
  onExit: () => void;
}

const Csr = ({ app, event, onExit }: CsrProps) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [width, height] = useStdoutDimensions();
  useEffect(() => {
    event.on("info", (msg: string) => {
      setLogs((prevLogs) => [...prevLogs, msg]);
    });
    event.on("warn", (msg: string) => {
      setLogs((prevLogs) => [...prevLogs, msg]);
    });
    event.on("warnOnce", (msg: string) => {
      setLogs((prevLogs) => [...prevLogs, msg]);
    });
    event.on("error", (msg: string) => {
      setLogs((prevLogs) => [...prevLogs, msg]);
    });
    event.on("clearScreen", (type: string) => {
      setLogs((prevLogs) => [...prevLogs, type]);
    });
  }, [event]);
  return (
    <Box width={width} height={height} flexDirection="column">
      <Text bold>Akan.JS CSR</Text>
      <Text>{logs}</Text>
    </Box>
  );
};

const filterLogData = (data: Buffer | string) => {
  return typeof data === "string"
    ? data.split(/\r?\n/).filter((line) => line !== "")
    : data
        .toString()
        .split(/\r?\n/)
        .filter((line) => line !== "");
};

interface StartProps {
  maxLength?: number;
  appName: string;
  bcp: ChildProcess;
}

/**
 * Akan application 통합 실행 컴포넌트 (백엔드, 프론트엔드, React(CSR))
 *
 * @param maxLength 로그 최대 길이
 * @param appName 앱 이름
 * @param bcp 백엔드 차일드 프로세스
 * @param onExit 종료 함수
 */
const Start = ({ appName, bcp, maxLength = 100 }: StartProps) => {
  const [width, height] = useStdoutDimensions();
  const [backendLogs, setBackendLogs] = useState<{ type: string; content: string }[]>([]);
  const { exit } = useApp();

  const saveLog = useCallback(
    (
      type: string,
      data: Buffer | string,
      setLog: React.Dispatch<React.SetStateAction<{ type: string; content: string }[]>>,
    ) => {
      const newOutput = filterLogData(data);
      const logs = newOutput.map((line) => ({ type: type, content: line }));
      setLog((currentLogs) => {
        if (currentLogs.length >= maxLength) {
          return [...currentLogs.slice(logs.length, maxLength), ...logs];
        } else if (currentLogs.length < maxLength && currentLogs.length + logs.length > maxLength) {
          return [...currentLogs.slice(Math.abs(maxLength - currentLogs.length - logs.length), maxLength), ...logs];
        } else return [...currentLogs, ...logs];
      });
    },
    [maxLength],
  );

  useEffect(() => {
    bcp.stdout?.on("data", (data: Buffer) => {
      saveLog("info", data, setBackendLogs);
    });

    // 표준 에러 처리
    bcp.stderr?.on("data", (data: Buffer) => {
      saveLog("error", data, setBackendLogs);
    });

    return () => {
      exit();
    };
  }, [bcp, saveLog, exit]);

  return (
    <Box borderColor="#ff493b" height={height} width={width} flexDirection="row">
      <MultiScrollList
        logList={[
          {
            title: `${appName} backend`,
            logs: backendLogs,
            color: "#e535ab",
          },
        ]}
        maxLength={maxLength}
      />
    </Box>
  );
};

export const Interface = {
  /**
   * Akan CSR 실행 컴포넌트
   *
   * @param app 앱 정보
   * @param event CSR 이벤트 발생기
   * @param onExit 종료 함수
   */
  Csr: (app: AppType, event: EventEmitter, onExit: () => void) =>
    renderManager(<Csr app={app} event={event} onExit={onExit} />),
  /**
   * Akan Backend 실행 컴포넌트
   *
   * @param appName 앱 이름
   * @param childProcess 백엔드 차일드 프로세스
   * @param onExit 종료 함수
   */
  Backend: (appName: string, childProcess: ChildProcess, onExit: () => void) =>
    renderManager(<Backend appName={appName} childProcess={childProcess} onExit={onExit} />),
  /**
   * Akan Frontend 실행 컴포넌트
   *
   * @param appName 앱 이름
   * @param childProcess 프론트엔드 차일드 프로세스
   * @param onExit 종료 함수
   */
  Frontend: (appName: string, childProcess: ChildProcess, onExit: () => void) =>
    renderManager(<Frontend appName={appName} childProcess={childProcess} onExit={onExit} />),
  /**
   * Akan application 통합 실행 컴포넌트 (백엔드, 프론트엔드, React(CSR))
   *
   * @param maxLength 로그 최대 길이
   * @param appName 앱 이름
   * @param bcp 백엔드 차일드 프로세스
   * @param fcp 프론트엔드 차일드 프로세스
   * @param csr CSR 이벤트 발생기
   * @param onExit 종료 함수
   */
  Start: (appName: string, bcp: ChildProcess) => renderManager(<Start appName={appName} bcp={bcp} />),
};

const renderManager = (component: React.ReactNode) => {
  //Interface에서 실행되는 모든 렌더링을 관리하는 함수
  // 렌더링 중인 컴포넌트를 추적하고, 종료 시 모든 컴포넌트를 종료하는 기능을 제공
  const renderFn = render(component);

  return renderFn;
};
