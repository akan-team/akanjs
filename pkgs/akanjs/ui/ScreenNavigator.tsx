"use client";
import { useDrag } from "@use-gesture/react";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
import { animated } from "akanjs/ui";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { SpringValue, useSpringValue } from "react-spring";
import { sharedContext } from "../client/sharedContext";

interface ScreenNavigatorContextType {
  bind: (...args: any[]) => any;
  menus: string[];
  currentMenu: string;
  setMenu: (menu: string) => void;
  xValue: SpringValue<number>;
  onClickMenu: (menu: string) => void;
}

const ScreenNavigatorContext = sharedContext<ScreenNavigatorContextType>("screenNavigator", {
  bind: () => ({}),
  xValue: new SpringValue(0),
  setMenu: null as unknown as (menu: string) => void,
  onClickMenu: null as unknown as (menu: string) => void,
  currentMenu: "",
  menus: [],
});

interface ScreenNavigatorProps {
  // currentMenu: string;
  children: React.ReactNode;
  setMenu?: (menu: string) => void;
  menus: string[];
  /** Names this navigator for the in-page agent. Without it it publishes nothing — two on one screen would share a name. */
  namespace?: string;
}

export const ScreenNavigator = ({
  children,
  setMenu = () => {
    //
  },
  menus,
  namespace,
}: ScreenNavigatorProps) => {
  const [currentMenu, setCurrentMenu] = useState(menus[0]);
  const xValue = useSpringValue(0, { config: { clamp: true } });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const deviceWidth = ref.current.clientWidth / 2;
    if (currentMenu === menus[1]) xValue.set(-deviceWidth);
    else xValue.set(0);
  }, []);

  const bind = useDrag(
    ({ first, last, offset: [x], velocity: [vx], direction: [dx], movement: [mx], cancel }) => {
      if (!ref.current) return;
      // FIXME: 메뉴가 3개 이상일 경우 고려해야함
      const deviceWidth = ref.current.clientWidth / 2;
      if (x > 0 || x < -deviceWidth) return;
      if (dx < 1) {
        if (x > -deviceWidth / 2) {
          void xValue.start(x);
        } else {
          void xValue.start(-deviceWidth);
          setCurrentMenu(menus[1]);
          setMenu(menus[1]);
        }
        if (last && x > -deviceWidth / 2) {
          void xValue.start(0);
        }
      } else {
        if (x > -deviceWidth / 2) {
          void xValue.start(0);
          setCurrentMenu(menus[0]);
          setMenu(menus[0]);
        } else {
          void xValue.start(x);
        }
        if (last && x < -deviceWidth / 2) {
          void xValue.start(-deviceWidth);
        }
      }
    },
    { axis: "x", filterTaps: true, threshold: 10 },
  );

  const onClickMenu = (menu: string) => {
    if (!ref.current) return;
    const deviceWidth = ref.current.clientWidth / 2;

    if (menu === menus[0]) {
      void xValue.start(0);
      setMenu(menus[0]);
      setCurrentMenu(menus[0]);
    } else {
      void xValue.start(-deviceWidth);
      setMenu(menus[1]);
      setCurrentMenu(menus[1]);
    }
  };

  const suffix = namespace ? capitalize(namespace) : "";
  st.expose(namespace ? `screenIn${suffix}` : null, String)
    .desc("The screen this navigator is showing.")
    .value(currentMenu);
  st.tool(namespace ? `goToScreenIn${suffix}` : null)
    .desc(`Slide the ${namespace ?? ""} navigator to one screen.`)
    .arg("screen", String, { oneOf: menus })
    .exec(onClickMenu);

  return (
    <ScreenNavigatorContext.Provider value={{ bind, xValue, onClickMenu, menus, currentMenu, setMenu }}>
      <animated.div {...bind()} className="flex h-full w-[200vw] overflow-x-scroll" style={{ x: xValue }} ref={ref}>
        {children}
      </animated.div>
    </ScreenNavigatorContext.Provider>
  );
};

const NavbarItem = ({ menu, children, className }: { menu: string; children: ReactNode; className?: string }) => {
  const { onClickMenu, currentMenu } = useContext(ScreenNavigatorContext);
  return (
    <div
      className={cn(className, currentMenu === menu ? "opacity-100" : "opacity-40")}
      onClick={() => {
        onClickMenu(menu);
      }}
    >
      {children}
    </div>
  );
};
ScreenNavigator.NavbarItem = NavbarItem;

const Screen = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full w-screen overflow-scroll" style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
};
ScreenNavigator.Screen = Screen;
