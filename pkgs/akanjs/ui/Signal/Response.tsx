import { usePage } from "akanjs/client";
import type { SerializedEndpoint } from "akanjs/signal";
import { useMemo } from "react";
import { AiOutlineLoading } from "react-icons/ai";
import { Code } from "../Reference";
import { makeResponseExample } from "./makeExample";
import { signalText } from "./signalText";
import { getStatusBadgeClassName, getStatusTone } from "./style";

interface ResponseExampleProps {
  endpoint: SerializedEndpoint;
}
export const ResponseExample = ({ endpoint }: ResponseExampleProps) => {
  const { l } = usePage();
  const example = useMemo(() => JSON.stringify(makeResponseExample(endpoint), null, 2), []);
  return <Code code={example} label={l.trans(signalText.example)} />;
};

interface ResponseResultProps {
  status: "idle" | "loading" | "success" | "error";
  data: unknown;
}
export const ResponseResult = ({ status, data }: ResponseResultProps) => {
  const { l } = usePage();
  return (
    <Code
      code={data ? JSON.stringify(data, null, 2) : ""}
      label={l.trans(signalText.response)}
      meta={status === "idle" ? null : <span className={getStatusBadgeClassName(status)}>{status}</span>}
      placeholder={l.trans(signalText.responsePlaceholder)}
      overlay={
        status === "loading" ? (
          <div className="absolute inset-0 flex animate-fadeIn items-center justify-center bg-background/60 backdrop-blur-sm">
            <AiOutlineLoading className="animate-spin text-2xl text-foreground/40" />
          </div>
        ) : null
      }
      tone={getStatusTone(status)}
    />
  );
};
