import { StackProbe } from "@apps/minimal/ui";
import { page } from "akanjs/client";

export default page()
  .config({ topInset: true, bottomInset: 64, transition: "none", cache: true })
  .render(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return <StackProbe name="home" />;
  });
