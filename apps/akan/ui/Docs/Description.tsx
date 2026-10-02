import { CodeText } from "./CodeText";

export const Description = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-2 font-normal text-base text-foreground/85 leading-[1.75]">
    <CodeText>{children}</CodeText>
  </div>
);
