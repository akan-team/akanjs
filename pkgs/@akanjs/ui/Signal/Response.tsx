import { makeResponseExample, SerializedEndpoint } from "@akanjs/signal";
import { useMemo } from "react";
import { AiOutlineCopy } from "react-icons/ai";

import { Copy } from "../Copy";

export default function Response() {
  return <div></div>;
}

interface ResponseExampleProps {
  gqlMeta: SerializedEndpoint;
}
const ResponseExample = ({ gqlMeta }: ResponseExampleProps) => {
  const example = useMemo(() => JSON.stringify(makeResponseExample(gqlMeta), null, 2), []);
  return (
    <div className="relative">
      <textarea
        className="bg-base-100 min-h-[500px] w-full rounded-md p-4 text-base"
        value={example}
        onChange={() => true}
      />
      <div className="absolute top-4 right-4">
        <Copy text={example}>
          <button className="btn btn-sm">
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
  data: any;
}
const ResponseResult = ({ status, data }: ResponseResultProps) => {
  const dataStr = data ? JSON.stringify(data, null, 2) : "";
  return (
    <div className="relative">
      <textarea
        className={`textarea ${
          status === "loading"
            ? "textarea-disabled"
            : status === "success"
              ? "textarea-success border-success"
              : status === "error"
                ? "textarea-error text-error border-error"
                : ""
        } bg-base-100 min-h-[300px] w-full rounded-md p-4 text-sm font-normal`}
        value={dataStr}
        onChange={() => true}
      />
      {status === "loading" ? (
        <div className="animate-fadeIn absolute inset-0 flex items-center justify-center backdrop-blur-sm">
          <span className="loading loading-dots loading-lg"></span>
        </div>
      ) : status === "idle" ? (
        <></>
      ) : (
        <div className="absolute top-4 right-4">
          <Copy text={dataStr}>
            <button className="btn btn-sm">
              <AiOutlineCopy /> Copy
            </button>
          </Copy>
        </div>
      )}
    </div>
  );
};
Response.Result = ResponseResult;
