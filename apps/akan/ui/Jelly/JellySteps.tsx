import { DefaultSteps, type StepsProps } from "akanjs/ui";
import { JellyStar } from "./JellyStar";

export const JellySteps = (props: StepsProps) => {
  return (
    <>
      <DefaultSteps {...props} />
      {props.isRunning ? (
        <div aria-hidden="true" className="flex h-9 items-end pl-1">
          <JellyStar className="size-8" motion="hop" />
        </div>
      ) : null}
    </>
  );
};
