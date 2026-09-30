import { page } from "akanjs/client";
import type { ReactNode } from "react";

export default page()
  .config({ transition: "none" })
  .render(async () => JSON.parse("not json") as ReactNode);
