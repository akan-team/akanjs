import { StackProbe } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "stack", gesture: true })
  .search("id", String)
  .render(({ id }) => <StackProbe name="item" itemId={id ?? ""} />);
