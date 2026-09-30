import { layout, router } from "akanjs/client";

export default layout().render(async ({ children }) => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (!(globalThis as { __e2eSignedIn?: boolean }).__e2eSignedIn) return router.redirect("/e2e/stack/tab-b");
  return (
    <>
      {children}
      <div data-e2e="gate-tabbar">tabs</div>
    </>
  );
});
