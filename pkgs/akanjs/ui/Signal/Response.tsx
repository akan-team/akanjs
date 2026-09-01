import type { SerializedEndpoint } from "akanjs/signal";
import { useMemo } from "react";
import { AiOutlineLoading } from "react-icons/ai";
import { Code } from "../Reference";
import { makeResponseExample } from "./makeExample";
import { getStatusBadgeClassName, getStatusTone } from "./style";

export default function Response() {
  return <div></div>;
}

interface ResponseExampleProps {
  endpoint: SerializedEndpoint;
}
const ResponseExample = ({ endpoint }: ResponseExampleProps) => {
  const example = useMemo(() => JSON.stringify(makeResponseExample(endpoint), null, 2), []);
  return <Code code={example} label="Example" />;
};
Response.Example = ResponseExample;

interface ResponseResultProps {
  status: "idle" | "loading" | "success" | "error";
  data: unknown;
}
const ResponseResult = ({ status, data }: ResponseResultProps) => (
  <Code
    code={data ? JSON.stringify(data, null, 2) : ""}
    label="Response"
    meta={status === "idle" ? null : <span className={getStatusBadgeClassName(status)}>{status}</span>}
    placeholder="Send the request to see the response."
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
Response.Result = ResponseResult;
