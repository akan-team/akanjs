import { createPortal } from "react-dom";

interface PortalProps {
  children: React.ReactNode;
  id: string;
}
export const Portal = ({ children, id }: PortalProps) => {
  const targetElement = document.getElementById(id);
  return targetElement ? createPortal(children, targetElement) : null;
};
