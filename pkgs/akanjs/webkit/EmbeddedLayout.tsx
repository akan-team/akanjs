"use client";
import { hiddenLayoutContext } from "akanjs/client";
import {
  type ContextType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AgentActivity, GateContext, SurfaceContext } from "use-agentic";

interface EmbeddedLayoutValue {
  target: HTMLElement | null;
  onOutlet: (mounted: boolean) => void;
  surface: ContextType<typeof SurfaceContext>;
  gate: ContextType<typeof GateContext>;
}
const embeddedLayoutContext = createContext<EmbeddedLayoutValue | null>(null);

//? An MCP view shows the page its tool named, not the app around it. Skipping the layout would drop its guards,
//? providers and guidance, so it runs hidden and the page is drawn beside it through a portal, which context crosses.
//? A layout that draws no page, like a gate, is the content then and stays on screen.
interface EmbeddedLayoutProps {
  children: ReactNode;
}
export const EmbeddedLayout = ({ children }: EmbeddedLayoutProps) => {
  const surface = useContext(SurfaceContext);
  const gate = useContext(GateContext);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [drawsPage, setDrawsPage] = useState(true);
  const outletRef = useRef(false);
  const onOutlet = useCallback((mounted: boolean) => {
    outletRef.current = mounted;
    setDrawsPage(mounted);
  }, []);
  //? The outlet sits inside this layout's markup, so its own layout effect has already run when this one does.
  useLayoutEffect(() => {
    if (!outletRef.current) setDrawsPage(false);
  });
  const value = useMemo(() => ({ target, onOutlet, surface, gate }), [target, onOutlet, surface, gate]);
  return (
    <embeddedLayoutContext.Provider value={value}>
      <div hidden={drawsPage}>
        <hiddenLayoutContext.Provider value={drawsPage}>
          <AgentActivity active={!drawsPage} keepGuides>
            {children}
          </AgentActivity>
        </hiddenLayoutContext.Provider>
      </div>
      <div ref={setTarget} className="contents" />
    </embeddedLayoutContext.Provider>
  );
};

interface LayoutOutletProps {
  children: ReactNode;
}
export const LayoutOutlet = ({ children }: LayoutOutletProps) => {
  const embedded = useContext(embeddedLayoutContext);
  const onOutlet = embedded?.onOutlet;
  useLayoutEffect(() => {
    onOutlet?.(true);
  }, [onOutlet]);
  //? Suspense hiding the outlet clears its layout effects but keeps this one, so presence ends only with it.
  useEffect(() => {
    if (!onOutlet) return;
    onOutlet(true);
    return () => onOutlet(false);
  }, [onOutlet]);
  if (!embedded?.target) return null;
  return createPortal(
    <SurfaceContext.Provider value={embedded.surface}>
      <GateContext.Provider value={embedded.gate}>
        <hiddenLayoutContext.Provider value={false}>{children}</hiddenLayoutContext.Provider>
      </GateContext.Provider>
    </SurfaceContext.Provider>,
    embedded.target,
  );
};
