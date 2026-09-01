import { Code } from "../Reference";

export default function Request() {
  return <div></div>;
}

interface RequestExampleProps {
  value: string;
}
const RequestExample = ({ value }: RequestExampleProps) => <Code code={value} label="Request" />;
Request.Example = RequestExample;
