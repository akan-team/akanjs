import { layout } from "akanjs/client";

export default layout().render(async ({ children }) => {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return (
    <>
      {children}
      <div data-e2e="tabbar">tabs</div>
    </>
  );
});
