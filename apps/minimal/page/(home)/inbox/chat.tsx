import { cn, type PageConfig } from "akanjs/client";
import { buttonVariants, Layout } from "akanjs/ui";
import { AiOutlineSend } from "react-icons/ai";

export default function Page() {
  return (
    <div className="apptest-screen">
      <Layout.Navbar className="apptest-nav" back>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-linear-to-br from-primary to-secondary" />
          <div>
            <div className="font-semibold">Seolleung host</div>
            <div className="text-success text-xs">online now</div>
          </div>
        </div>
      </Layout.Navbar>
      <div className="space-y-3 px-5 pt-5">
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          Hello. Check-in starts at 3 PM, and I will send the door lock instructions that morning.
        </div>
        <div className="ml-auto max-w-[78%] rounded-3xl rounded-tr-md bg-primary p-4 text-primary-foreground text-sm">
          Thank you. Is there parking available nearby?
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          I recommend the public parking lot behind the building. It is a 2-minute walk away.
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          Hello. Check-in starts at 3 PM, and I will send the door lock instructions that morning.
        </div>
        <div className="ml-auto max-w-[78%] rounded-3xl rounded-tr-md bg-primary p-4 text-primary-foreground text-sm">
          Thank you. Is there parking available nearby?
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          I recommend the public parking lot behind the building. It is a 2-minute walk away.
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          Hello. Check-in starts at 3 PM, and I will send the door lock instructions that morning.
        </div>
        <div className="ml-auto max-w-[78%] rounded-3xl rounded-tr-md bg-primary p-4 text-primary-foreground text-sm">
          Thank you. Is there parking available nearby?
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          I recommend the public parking lot behind the building. It is a 2-minute walk away.
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          Hello. Check-in starts at 3 PM, and I will send the door lock instructions that morning.
        </div>
        <div className="ml-auto max-w-[78%] rounded-3xl rounded-tr-md bg-primary p-4 text-primary-foreground text-sm">
          Thank you. Is there parking available nearby?
        </div>
        <div className="max-w-[78%] rounded-3xl rounded-tl-md bg-muted p-4 text-foreground/75 text-sm">
          I recommend the public parking lot behind the building. It is a 2-minute walk away.
        </div>
      </div>
      <Layout.BottomInset
        className="flex h-(--akan-bottom-inset) w-full bg-background/80 px-3 py-2 backdrop-blur"
        keyboardSticky
      >
        <div className="apptest-card flex h-full w-full items-center justify-center gap-2 rounded-3xl px-3">
          <input
            className="h-10 w-full border-0 bg-transparent px-3 text-foreground text-sm placeholder:text-foreground/35 focus:outline-none"
            placeholder="Type message..."
          />
          <button className={cn(buttonVariants({ variant: "primary", size: "icon" }), "rounded-2xl border-0")}>
            <AiOutlineSend />
          </button>
        </div>
      </Layout.BottomInset>
    </div>
  );
}
export const pageConfig = {
  topInset: 48,
  bottomInset: 72,
  safeArea: true,
  transition: "stack",
} satisfies PageConfig;
