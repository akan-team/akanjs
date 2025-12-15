"use client";
import { useStdoutDimensions } from "@akanjs/devkit";
import { Box, BoxProps, Newline, Text, useInput } from "ink";
import React, { ReactNode, useEffect, useState } from "react";

interface ScrollListProps extends BoxProps {
  list: ReactNode[];
}

export const ScrollList = ({ list, ...props }: ScrollListProps) => {
  const [renderLogs, setRenderLogs] = useState<ReactNode[]>(list);
  const [width, height] = useStdoutDimensions();
  const [scrollPos, setScrollPos] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [boxHeight, setBoxHeight] = useState(height - 3);

  useInput((input, key) => {
    if (key.escape) {
      setIsRunning(false);
      setScrollPos(0);
    }
    if (input === " " && isRunning) {
      setIsRunning(false);
      setScrollPos(0);
    }
    if (key.downArrow && scrollPos > 0) {
      if (key.shift) {
        setScrollPos(scrollPos - 10);
      } else {
        setScrollPos(scrollPos - 1);
      }
    }
    if (key.upArrow && scrollPos < list.length - boxHeight) {
      if (key.shift) {
        setScrollPos(scrollPos + 10);
      } else {
        setScrollPos(scrollPos + 1);
      }
    }
  });

  useEffect(() => {
    //1 로그가 박스 높이보다 크면 스크롤 위치 조정
    //2. scrollPos값에 따라 포커싱 위치 변경하고 pos 활성시 포커싱 위치 고정
    if (isRunning) {
      setScrollPos(scrollPos + 1);
      return;
    }
    if (list.length > boxHeight) {
      setRenderLogs(list.slice(list.length - boxHeight, list.length));
    } else {
      setRenderLogs(list);
    }
  }, [list, isRunning]);

  useEffect(() => {
    setBoxHeight(Math.floor(height * 0.9));
  }, [height]);

  useEffect(() => {
    if (scrollPos > 0) {
      setRenderLogs(list.slice(list.length - boxHeight - scrollPos, list.length - scrollPos));
      setIsRunning(true);
    } else {
      setRenderLogs(list.slice(list.length - boxHeight, list.length));
      setIsRunning(false);
    }
  }, [scrollPos]);

  return (
    <Box {...props} width={width} height={"100%"} flexDirection="column">
      <Box borderStyle="round" width={width} height={height - 3}>
        <Newline />
        <Text>
          {isRunning ? (
            <>
              {renderLogs.slice(0, renderLogs.length - 1).map((log, index) => (
                <>
                  <Text key={index}>{log}</Text>
                  <Newline />
                </>
              ))}
              <Text backgroundColor="green">scrolling... + {scrollPos}</Text>
            </>
          ) : (
            <>
              {renderLogs.map((log, index) => (
                <>
                  <Text key={index}>{log}</Text>
                  <Newline />
                </>
              ))}
            </>
          )}
        </Text>
      </Box>
      <Box>
        <Text dimColor={true}>
          You can use the following shortcuts:
          <Newline />* <Text backgroundColor="green">up</Text> and <Text backgroundColor="green">down</Text> to scroll.{" "}
          <Text backgroundColor="green">shift</Text> to scroll faster.
          <Newline />* <Text backgroundColor="green">escape</Text> to stop scrolling.
        </Text>
      </Box>
    </Box>
  );
};
