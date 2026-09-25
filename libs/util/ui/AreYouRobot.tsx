// import { Turnstile, TurnstileProps } from "@marsidev/react-turnstile";

import type { TurnstileProps } from "@marsidev/react-turnstile";

interface AreYouRobotProps {
  siteKey: string;
  options?: TurnstileProps["options"];
  onSuccess: (token: string) => void;
}
export const AreYouRobot = ({ siteKey, options = {}, onSuccess }: AreYouRobotProps) => {
  // Turnstile is switched off; the widget it replaces is kept here for when it is turned back on.
  // <Turnstile
  //   siteKey={siteKey}
  //   options={{ theme: st.use.theme() === "light" ? "light" : "dark", size: "invisible", ...options }}
  //   onSuccess={(token) => {
  //     onSuccess(token);
  //   }}
  // />
  return null;
};
