import { router } from "akanjs/client";

export default function Page() {
  router.redirect("/");
  return <div>Websites</div>;
}
