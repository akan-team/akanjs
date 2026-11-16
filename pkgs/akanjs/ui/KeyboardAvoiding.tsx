"use client";
import { useSpring } from "@react-spring/web";
import { useCsr } from "akanjs/client";
import { st } from "akanjs/store";
import { isPageKeyboardAvoidance } from "akanjs/webkit";
import { type ReactNode, useEffect, useRef } from "react";
import { animated } from "./animated";

interface KeyboardAvoidingProps {
  children: ReactNode;
  className?: string;
  keyboardSticky?: boolean;
}
export const KeyboardAvoiding = ({ children, className }: KeyboardAvoidingProps) => {
  const keyboardHeight = st.use.keyboardHeight({ agent: false });
  const defaultHeight = useRef<number | null>(null);
  const pageState = st.use.pageState({ agent: false });
  const { pageContentRef } = useCsr();
  const [{ height }, setSpring] = useSpring(() => ({
    height: 0,
    config: { duration: 100 },
  }));

  const onChange = async (height: number) => {
    await Promise.all([setSpring.start({ height })]);
  };

  useEffect(() => {
    const test = async () => {
      if (!pageContentRef.current) return;

      //? The frame already ends the page at the keys where the iOS shell left them to the page.
      const newHeight = keyboardHeight && !isPageKeyboardAvoidance() ? keyboardHeight - pageState.bottomSafeArea : 0;

      await onChange(newHeight);

      if (
        Math.floor(pageContentRef.current.scrollTop + pageContentRef.current.clientHeight) ===
        pageContentRef.current.scrollHeight
      )
        setTimeout(() => {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTo({
            top: pageContentRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 200);
    };
    void test();
  }, [keyboardHeight]);

  useEffect(() => {
    if (pageContentRef.current) {
      const heightNum = parseInt(pageContentRef.current.style.height.replace("px", ""));
      defaultHeight.current = heightNum;
    }
  }, []);

  return (
    <animated.div className="h-auto" style={{ marginBottom: height }}>
      {children}
    </animated.div>
  );
};
