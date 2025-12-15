"use client";
import { useCallback } from "react";

const debounce = <Callback extends (...args: any) => any>(callback: Callback, wait = 500) => {
  // 실행한 함수(setTimeout())를 취소
  let timer: NodeJS.Timeout;
  return ((...args: object[]) => {
    clearTimeout(timer);
    // delay가 지나면 callback 함수를 실행
    timer = setTimeout(() => {
      callback(...args);
    }, wait);
  }) as Callback;
};

export const useDebounce = <Callback extends (...args: any) => any>(
  callback: Callback,
  states: any[] = [],
  wait = 100
) => {
  const fn = useCallback(debounce(callback, wait), states);
  return fn;
};
