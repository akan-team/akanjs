import { Int } from "akanjs/base";
import { page, router } from "akanjs/client";

export default page()
  .config({ transition: "none", cache: true })
  .search("delay", Int)
  .render(async ({ delay }) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return router.redirect("/e2e/tabbed/home");
  });
