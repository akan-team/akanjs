import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout, Link } from "akanjs/ui";
import { AiOutlineClose } from "react-icons/ai";

export default function Page() {
  return (
    <>
      <Layout.Navbar back>
        <Link.Back className="m-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/10 backdrop-blur">
          <AiOutlineClose className="text-3xl" />
        </Link.Back>
      </Layout.Navbar>
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background text-foreground">
        {/* <div className="absolute inset-5 rounded-[2rem] border border-foreground/15 bg-gradient-to-br from-border via-muted to-background" /> */}
        {/* <Link.Back>
          <div className="absolute top-6 left-6 z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/10 backdrop-blur">
            <AiOutlineClose className="text-3xl" />
          </div>
        </Link.Back> */}
        <div className="relative z-10 text-center">
          <div className="mx-auto h-40 w-40 rounded-[2rem] border border-foreground/20 bg-foreground/5 shadow-2xl shadow-primary/20" />
          <p className="mt-6 font-semibold text-2xl">Camera preview</p>
          <p className="mt-2 text-foreground/50 text-sm">
            Capture your favorite places and save them to your wishlist.
          </p>
        </div>
        <Layout.BottomInset
          className="flex h-[72px] w-full bg-background/70 px-5 py-2 backdrop-blur"
          estimatedHeight={pageConfig.bottomInset}
          keyboardSticky
        >
          <button className={buttonRecipe({ variant: "primary" }, "h-full w-full rounded-2xl border-0")}>
            Take photo
          </button>
        </Layout.BottomInset>
      </div>
    </>
  );
}
export const pageConfig = {
  safeArea: true,
  bottomInset: 72,
  topInset: 72,
  transition: "bottomUp",
} satisfies PageConfig;
