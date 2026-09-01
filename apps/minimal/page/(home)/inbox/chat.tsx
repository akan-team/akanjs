import { appCard, appNavClass, chatBubbleRecipe, gradientSurfaceRecipe, Screen } from "@apps/minimal/ui";
import type { PageConfig } from "akanjs/client";
import { buttonRecipe, Layout } from "akanjs/ui";
import { AiOutlineSend } from "react-icons/ai";

const messages: { side: "incoming" | "outgoing"; text: string }[] = Array.from({ length: 4 }, () => [
  {
    side: "incoming" as const,
    text: "Hello. Check-in starts at 3 PM, and I will send the door lock instructions that morning.",
  },
  { side: "outgoing" as const, text: "Thank you. Is there parking available nearby?" },
  {
    side: "incoming" as const,
    text: "I recommend the public parking lot behind the building. It is a 2-minute walk away.",
  },
]).flat();

export default function Page() {
  return (
    <Screen>
      <Layout.Navbar className={appNavClass} back>
        <div className="flex items-center gap-3">
          <div className={gradientSurfaceRecipe({ tone: "duo" }, "h-9 w-9 rounded-2xl")} />
          <div>
            <div className="font-semibold">Seolleung host</div>
            <div className="text-success text-xs">online now</div>
          </div>
        </div>
      </Layout.Navbar>
      <div className="space-y-3 px-5 pt-5">
        {messages.map((message, index) => (
          <div key={`${message.side}-${index}`} className={chatBubbleRecipe({ side: message.side })}>
            {message.text}
          </div>
        ))}
      </div>
      <Layout.BottomInset
        className="flex h-(--akan-bottom-inset) w-full bg-background/80 px-3 py-2 backdrop-blur"
        keyboardSticky
        contentAnchor="bottom"
      >
        <div className={appCard(undefined, "flex h-full w-full items-center justify-center gap-2 rounded-3xl px-3")}>
          <input
            className="h-10 w-full border-0 bg-transparent px-3 text-foreground text-sm placeholder:text-foreground/35 focus:outline-none"
            placeholder="Type message..."
          />
          <button className={buttonRecipe({ variant: "primary", size: "icon" }, "rounded-2xl border-0")}>
            <AiOutlineSend />
          </button>
        </div>
      </Layout.BottomInset>
    </Screen>
  );
}
export const pageConfig = {
  topInset: 48,
  bottomInset: 72,
  safeArea: true,
  transition: "stack",
} satisfies PageConfig;
