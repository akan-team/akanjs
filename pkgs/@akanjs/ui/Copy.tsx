"use client";
import { st } from "@akanjs/store";
import { CopyToClipboard } from "react-copy-to-clipboard";

export interface CopyProps {
  text?: string;
  copyMessage?: string;
  children: any;
}
export const Copy = ({ text, copyMessage, children }: CopyProps) => {
  return (
    <CopyToClipboard
      text={text ?? ""}
      onCopy={() => {
        st.do.showMessage({ content: copyMessage ?? "Copied", type: "success" });
      }}
    >
      {children}
    </CopyToClipboard>
  );
};
