import { router } from "akanjs/client";

export default async function Page() {
  router.redirect("/cheatsheet/mobile/setup");
  return <div>Mobile Setup</div>;
}
