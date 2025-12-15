import { AiOutlineCopy } from "react-icons/ai";

import { Copy } from "../Copy";

export default function Request() {
  return <div></div>;
}

interface RequestExampleProps {
  value: string;
}
const RequestExample = ({ value }: RequestExampleProps) => {
  return (
    <div className="relative">
      <textarea
        className="bg-base-100 min-h-[300px] w-full rounded-md p-4 text-base"
        value={value}
        onChange={() => true}
      />
      <div className="absolute top-4 right-4">
        <Copy text={value}>
          <button className="btn btn-sm">
            <AiOutlineCopy /> Copy
          </button>
        </Copy>
      </div>
    </div>
  );
};
Request.Example = RequestExample;
