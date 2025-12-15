"use client";
import EventEmitter from "node:events";

import { App as AppType, useStdoutDimensions } from "@akanjs/devkit";
import { ChildProcess } from "child_process";
import { Box, render, Text, useApp } from "ink";
import React, { useEffect, useState } from "react";

import { MultiScrollList } from "../../ui/MultiScrollList";

interface BackendProps {
  appName: string;
  childProcess: ChildProcess;
  onExit: () => void;
}

const Backend = ({ appName, childProcess, onExit }: BackendProps) => {
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

    // setInterval(() => {
    //   setLogs((prevLogs) => [...prevLogs, "test" + new Date().toISOString()]);
    // }, 300);

    return () => {
      childProcess.kill();
      onExit();
    };
  }, []);

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
  }, []);

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
  const [test, setTest] = useState<boolean>(false);
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
  }, []);
  return (
    <Box width={width} height={height} flexDirection="column">
      <Text>{test ? "true" : "false"}</Text>
      <Text bold>Akan.JS CSR</Text>
      <Text>{logs}</Text>
    </Box>
  );
};

interface StartProps {
  maxLength?: number;
  appName: string;
  bcp: ChildProcess;
  fcp: ChildProcess;
  csr: EventEmitter;
}

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
const Start = ({ appName, bcp, fcp, csr, maxLength = 100 }: StartProps) => {
  const [width, height] = useStdoutDimensions();
  const [csrLogs, setCsrLogs] = useState<{ type: string; content: string }[]>([]);
  const [backendLogs, setBackendLogs] = useState<{ type: string; content: string }[]>([]);
  const [frontendLogs, setFrontendLogs] = useState<{ type: string; content: string }[]>([]);
  const { exit } = useApp();

  const filterLogData = (data: Buffer | string) => {
    // 버퍼 데이터를 문자열로 변환하고 줄바꿈 기준으로 분리 후 빈 문자열 제거
    return typeof data === "string"
      ? data.split(/\r?\n/).filter((line) => line !== "")
      : data
          .toString()
          .split(/\r?\n/)
          .filter((line) => line !== "");
  };

  const saveLog = (
    type: string,
    data: Buffer | string,
    setLog: React.Dispatch<React.SetStateAction<{ type: string; content: string }[]>>
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
  };

  useEffect(() => {
    bcp.stdout?.on("data", (data: Buffer) => {
      saveLog("info", data, setBackendLogs);
    });

    // 표준 에러 처리
    bcp.stderr?.on("data", (data: Buffer) => {
      saveLog("error", data, setBackendLogs);
    });

    fcp.stdout?.on("data", (data: Buffer) => {
      saveLog("info", data, setFrontendLogs);
    });

    fcp.stderr?.on("data", (data: Buffer) => {
      saveLog("error", data, setFrontendLogs);
    });
    csr.on("info", (msg: string) => {
      saveLog("info", msg, setCsrLogs);
    });
    csr.on("warn", (msg: string) => {
      saveLog("warn", msg, setCsrLogs);
    });
    csr.on("error", (msg: string) => {
      saveLog("error", msg, setCsrLogs);
    });
    csr.on("clearScreen", (type: string) => {
      saveLog("clearScreen", type, setCsrLogs);
    });

    return () => {
      exit();
    };
  }, []);

  return (
    <>
      <Box borderColor="#ff493b" height={height} width={width} flexDirection="row">
        <MultiScrollList
          logList={[
            {
              title: `${appName} frontend`,
              logs: frontendLogs,
              color: "#ff493b",
            },
            {
              title: `${appName} backend`,
              logs: backendLogs,
              color: "#e535ab",
            },
            {
              title: `${appName} react`,
              logs: csrLogs,
              color: "#7cc5d9",
            },
          ]}
          maxLength={maxLength}
        />
      </Box>
    </>
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
  Start: (appName: string, bcp: ChildProcess, fcp: ChildProcess, csr: EventEmitter) =>
    renderManager(<Start appName={appName} bcp={bcp} fcp={fcp} csr={csr} />),
};

const renderManager = (component: React.ReactNode) => {
  //Interface에서 실행되는 모든 렌더링을 관리하는 함수
  // 렌더링 중인 컴포넌트를 추적하고, 종료 시 모든 컴포넌트를 종료하는 기능을 제공
  const renderFn = render(component);

  return renderFn;
};
