// import { makeResponseExample, SerializedEndpoint } from "akanjs/signal";

import type { SerializedEndpoint } from "akanjs/signal";
import { useMemo } from "react";
import { AiOutlineCopy } from "react-icons/ai";
import { Copy } from "../Copy";
import { makeResponseExample } from "./makeExample";
import { getStatusBadgeClassName, getStatusTextareaClassName, signalUi } from "./style";

export default function Response() {
  return <div></div>;
}

interface ResponseExampleProps {
  endpoint: SerializedEndpoint;
}
const ResponseExample = ({ endpoint }: ResponseExampleProps) => {
  const example = useMemo(() => JSON.stringify(makeResponseExample(endpoint), null, 2), []);
  return (
    <div className="relative">
      <textarea className={`${signalUi.codePanel} min-h-72 text-base`} value={example} onChange={() => true} />
      <div className="absolute top-4 right-4">
        <Copy text={example}>
          <button className="btn btn-outline btn-sm">
            <AiOutlineCopy /> Copy
          </button>
        </Copy>
      </div>
    </div>
  );
};
Response.Example = ResponseExample;

interface ResponseResultProps {
  status: "idle" | "loading" | "success" | "error";
  data: unknown;
}
const ResponseResult = ({ status, data }: ResponseResultProps) => {
  const dataStr = data ? JSON.stringify(data, null, 2) : "";
  return (
    <div className="relative">
      <textarea
        className={`${signalUi.codePanel} ${getStatusTextareaClassName(status)}`}
        value={dataStr}
        onChange={() => true}
      />
      {status === "loading" ? (
        <div className="absolute inset-0 flex animate-fadeIn items-center justify-center backdrop-blur-sm">
          <span className="loading loading-dots loading-lg"></span>
        </div>
      ) : status === "idle" ? (
        <></>
      ) : (
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className={getStatusBadgeClassName(status)}>{status}</span>
          <Copy text={dataStr}>
            <button className="btn btn-outline btn-sm">
              <AiOutlineCopy /> Copy
            </button>
          </Copy>
        </div>
      )}
    </div>
  );
};
Response.Result = ResponseResult;
