"use client";
import { useCsr } from "@akanjs/client";
import { st } from "@akanjs/store";
import { animated } from "@akanjs/ui";
import { useEffect, useRef } from "react";
import { useSpring } from "react-spring";

interface KeyboardAvoidingProps {
  children: any;
  className?: string;
  keyboardSticky?: boolean;
}
export const KeyboardAvoiding = ({ children, className }: KeyboardAvoidingProps) => {
  const keyboardHeight = st.use.keyboardHeight();
  const defaultHeight = useRef<number | null>(null);
  const pageState = st.use.pageState();
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

      const newHeight = keyboardHeight ? keyboardHeight - pageState.bottomSafeArea : 0;

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
