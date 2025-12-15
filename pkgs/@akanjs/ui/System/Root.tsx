"use client";
// import { baseEnv } from "@akanjs/base";
// import { checkDictCoverage } from "@akanjs/dictionary";

export interface RootProps {
  children: any;
  st: any;
}
export const Root = ({ children, st }: RootProps) => {
  // if (baseEnv.operationMode === "local") checkDictCoverage();
  return <>{children}</>;
};
