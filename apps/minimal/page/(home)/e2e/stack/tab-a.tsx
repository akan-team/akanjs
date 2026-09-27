import { StackProbe } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ cache: true, transition: "none", gesture: false })
  .render(() => <StackProbe name="tab-a" />);
