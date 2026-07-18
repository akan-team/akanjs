import { router } from "akanjs/client";
import { Link } from "akanjs/ui";

export default async function Page() {
  router.redirect("/explore?csr=true");
  await new Promise((resolve) => setTimeout(resolve, 10));
  return (
    <div className="mt-36">
      Apptest
      <Link href="/explore">Explore</Link>
    </div>
  );
}
