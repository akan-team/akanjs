import { StackProbe } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "none", cache: true })
  .render(() => <StackProbe name="gate-home" />);
