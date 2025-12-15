"use client";
import { useStdoutDimensions } from "@akanjs/devkit";
import { Box, Text, useInput } from "ink";
import React, { useEffect, useState } from "react";

interface MultiScrollListProps {
  logList: {
    title: string;
    logs: {
      type: string;
      content: string;
    }[];
    color: string;
  }[];

  maxLength?: number;
}

/**
 * @param logList 로그 목록
 * @param maxLength 최대 로그 길이 (기본 100)
 */
const HEADER_HEIGHT = 1;
const FOOTER_HEIGHT = 1;
const OUTER_BORDER_HEIGHT = 2;
const BORDER_HEIGHT = 2;

export const MultiScrollList = ({ logList, maxLength = 100 }: MultiScrollListProps) => {
  // 창 너비, 높이
  const [width, height] = useStdoutDimensions();
  // 탭별 로그 렌더링

  const [focusLog, setFocusLog] = useState<{ type: string; content: string }[]>([]);
  // 탭별 로그 길이 저장 (스크롤시 로그 길이 변화로 위치 조정)
  const [lengthMap, setLengthMap] = useState<Map<number, number>>(new Map());
  // 스크롤 위치
  const [scrollPos, setScrollPos] = useState(0);
  // 현재 포커싱탭 인덱스
  const [tabIndex, setTabIndex] = useState<number>(0);
  // 스크롤 실행 여부
  const [isRunning, setIsRunning] = useState(false);
  // 박스 높이 (보더 사이즈 2, 헤더 사이즈 1, 푸터 사이즈 5 기본 1)
  const [boxHeight, setBoxHeight] = useState(
    height - HEADER_HEIGHT - OUTER_BORDER_HEIGHT - FOOTER_HEIGHT - BORDER_HEIGHT
  );
  const [boxWidth, setBoxWidth] = useState(width - 27);

  // maxLength에 따라 로그 배열을 제한하는 유틸리티 함수
  const getLimitedLogs = (logs: { type: string; content: string }[]) => {
    const sortedLogs = logs.reduce<{ type: string; content: string }[]>((acc, log) => {
      // log.content.length가 boxWidth보다 큰 경우 잘라서 줄 수 만큼 추가
      // ANSI 코드 보관

      // eslint-disable-next-line no-control-regex
      const content = log.content.replace(/\u001b(?:[@-Z\\\-_]|\[[\u0000-\u007F]*[@-~])/g, "");
      if (content.length > boxWidth) {
        const lines = Math.ceil(content.length / boxWidth);
        for (let i = 0; i < lines; i++) {
          acc.push({ type: log.type, content: content.slice(i * boxWidth, (i + 1) * boxWidth) });
        }
      } else {
        acc.push(log);
      }
      return acc;
    }, []);
    return sortedLogs.length > maxLength ? sortedLogs.slice(sortedLogs.length - maxLength) : sortedLogs;
  };

  // 입력 이벤트 처리
  useInput((input, key) => {
    // 탭 키 이벤트 처리(포커싱 탭 변경)
    if (key.tab) {
      setTabIndex((prev: number) => (prev + 1) % logList.length);
      setScrollPos(0);
      setIsRunning(false);
    }
    // 스크롤 중지 이벤트 처리 (포커싱까지 완전히 종료)
    if (key.escape) {
      setScrollPos(0);
      setIsRunning(false);
    }
    // 스크롤 중지 이벤트 처리 (포커싱 유지)
    if (input === " ") {
      setScrollPos(0);
      setIsRunning(false);
    }
    // 스크롤 다운 이벤트 처리
    if (key.downArrow && scrollPos > 0) {
      if (key.shift) {
        const newScrollPos = scrollPos - 10;
        // 스크롤 최소 위치에 도달 경우에 대한 예외 처리
        if (newScrollPos < 0) {
          setScrollPos(0);
        } else {
          setScrollPos(newScrollPos);
        }
      } else {
        const newScrollPos = scrollPos - 1;
        setScrollPos(newScrollPos);
      }
    }
    // 스크롤 업 이벤트 처리
    if (key.upArrow && scrollPos < logList[tabIndex].logs.length - boxHeight) {
      const limitedLogs = getLimitedLogs(logList[tabIndex].logs);
      if (scrollPos < limitedLogs.length - boxHeight) {
        // 스크롤 업 이벤트 처리 (스크롤 속도 증가)
        if (key.shift) {
          const newScrollPos = scrollPos + 10;
          // 스크롤 최대 위치에 도달 경우에 대한 예외 처리
          if (newScrollPos > limitedLogs.length - boxHeight) {
            setScrollPos(limitedLogs.length - boxHeight);
          } else {
            setScrollPos(newScrollPos);
          }
        } else {
          setScrollPos(scrollPos + 1);
        }
        if (!isRunning) setIsRunning(true);
      }
    }
  });

  useEffect(() => {
    // 공통 로직을 함수로 추출
    const getLogsToRender = (logs: { type: string; content: string }[], index: number) => {
      // maxLength에 따라 로그 제한
      const limitedLogs = getLimitedLogs(logs);
      // 로그 중 boxWidth보다 긴 것이 있는 경우 잘라서 출력

      // 활성 탭이고 스크롤 중인 특별한 경우
      if (scrollPos > 0 && tabIndex === index) {
        return limitedLogs.slice(limitedLogs.length - boxHeight - scrollPos, limitedLogs.length - scrollPos);
      }
      // 로그가 표시 영역보다 큰 경우 (공통 로직)
      else if (limitedLogs.length > boxHeight) {
        return limitedLogs.slice(limitedLogs.length - boxHeight, limitedLogs.length);
      }
      // 로그가 표시 영역에 모두 들어가는 경우 (공통 로직)
      else {
        return limitedLogs;
      }
    };

    // isRunning일 때 로직
    if (isRunning) {
      // 선택된 탭의 로그 길이 변화 확인 및 스크롤 포지션 업데이트
      if (lengthMap.has(tabIndex)) {
        const tabLength = lengthMap.get(tabIndex);
        const limitedLogsLength = Math.min(logList[tabIndex].logs.length, maxLength);
        if (tabLength && tabLength < limitedLogsLength) {
          setScrollPos(scrollPos + 1);
          lengthMap.set(tabIndex, limitedLogsLength);
        }
      }

      // 스크롤 위치에 따른 로그 렌더링 업데이트

      setFocusLog(getLogsToRender(logList[tabIndex].logs, tabIndex));
    }
    // isRunning이 아닐 때 로직
    else {
      // lengthMap 업데이트 및 초기 렌더링
      setFocusLog(getLogsToRender(logList[tabIndex].logs, tabIndex));
    }
  }, [logList, isRunning, scrollPos, tabIndex, boxHeight, maxLength]);

  useEffect(() => {
    setBoxHeight(height - HEADER_HEIGHT - OUTER_BORDER_HEIGHT - FOOTER_HEIGHT - BORDER_HEIGHT);
  }, [height]);

  // 초기 로그 사이즈 설정
  useEffect(() => {
    setLengthMap(new Map(logList.map((log, index) => [index, Math.min(log.logs.length, maxLength)])));
  }, [logList, maxLength]);

  return (
    <Box width={width} height={height} borderStyle="round" borderColor="blackBright" flexDirection="column">
      <Box width={"100%"} height={boxHeight + BORDER_HEIGHT + HEADER_HEIGHT} flexDirection="row">
        <Box width={30} height="100%" flexDirection="column">
          <Box>
            <Text>
              List {tabIndex + 1}/{logList.length}
            </Text>
          </Box>
          <Box borderStyle="round" borderColor="blackBright" width={"100%"} height="100%" flexDirection="column">
            {logList.map((log, index) => {
              return (
                <>
                  <Text color={index === tabIndex ? "green" : "white"}>
                    <Text>●</Text>&nbsp;
                    {log.title.length > 25 ? log.title.slice(0, 25) + "..." : log.title}
                  </Text>
                </>
              );
            })}
          </Box>
        </Box>
        <Box width={"100%"} height="100%" flexDirection="column">
          <Box height={1}>
            <Text color={logList[tabIndex].color}>
              {logList[tabIndex].title} {logList[tabIndex].logs.length}
            </Text>
          </Box>
          <Box
            borderStyle={isRunning ? "double" : "round"}
            flexDirection="column"
            borderColor={logList[tabIndex].color}
            width="100%"
            height="100%"
          >
            {scrollPos > 0 ? (
              <>
                {focusLog.slice(0, focusLog.length - 1).map((log, index) => {
                  return (
                    <Text underline={false} color={log.type === "error" ? "red" : "white"} key={index}>
                      {log.content}
                    </Text>
                  );
                })}
                <Text underline={false} backgroundColor="green">
                  Scrolling... +{scrollPos}
                </Text>
              </>
            ) : (
              focusLog.map((log, index) => {
                return (
                  <Text underline={false} color={log.type === "error" ? "red" : "white"} key={index}>
                    {log.content}
                  </Text>
                );
              })
            )}
          </Box>
        </Box>
      </Box>
      {/* <Text>{renderMultiLogs[tabIndex][0]}</Text> */}
      <Box width={"100%"} height={FOOTER_HEIGHT}>
        <Text dimColor={true}>
          Tab : switch tab | Up / Down(shift : x10) : scroll | Space : back last position | Esc : stop scrolling
        </Text>
      </Box>
    </Box>
  );
};
