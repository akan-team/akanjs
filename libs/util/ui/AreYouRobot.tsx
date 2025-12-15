// import { Turnstile, TurnstileProps } from "@marsidev/react-turnstile";
import { TurnstileProps } from "@marsidev/react-turnstile";
import { useTheme } from "next-themes";

interface AreYouRobotProps {
  siteKey: string;
  options?: TurnstileProps["options"];
  onSuccess: (token: string) => void;
}
export const AreYouRobot = ({ siteKey, options = {}, onSuccess }: AreYouRobotProps) => {
  const { theme } = useTheme();
  const applyTheme = theme === "dark" ? "dark" : theme === "light" ? "light" : "auto";
  return (
    <></>
    // <Turnstile
    //   siteKey={siteKey}
    //   options={{ theme: applyTheme, size: "invisible", ...options }}
    //   onSuccess={(token) => {
    //     onSuccess(token);
    //   }}
    // />
  );
};
