"use client";
import { useEffect, useRef } from "react";

// Submits once the code is complete and on every click, but never a second time while one is still in flight.
export const useAutoSubmit = (code: string, submit: () => Promise<void>, length = 6) => {
  const isSubmitting = useRef(false);
  const run = async () => {
    if (isSubmitting.current || code.length !== length) return;
    isSubmitting.current = true;
    try {
      await submit();
    } finally {
      isSubmitting.current = false;
    }
  };
  useEffect(() => {
    if (code.length === length) void run();
  }, [code]);
  return { run };
};
