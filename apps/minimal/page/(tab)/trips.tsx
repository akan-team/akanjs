import { appCard, appNavClass, iconTileRecipe, Screen } from "@apps/minimal/ui";
import { cn, page } from "akanjs/client";
import { Image, Layout, Link } from "akanjs/ui";
import { AiOutlineCalendar, AiOutlineEdit, AiOutlineRight } from "react-icons/ai";

const pageConfig = { topInset: 72 };

export default page()
  .config(pageConfig)
  .prompt("showTrips", "Show the trips coming up, starting with the next one.")
  .render(() => (
    <Screen className="px-5 pb-28">
      <Layout.TopInset className={cn(appNavClass, "flex items-center px-5")} estimatedHeight={pageConfig.topInset}>
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-foreground/40 text-xs uppercase tracking-[0.24em]">Upcoming</p>
            <h2 className="font-semibold text-xl">Trips</h2>
          </div>
          <AiOutlineCalendar className="text-2xl text-primary" />
        </div>
      </Layout.TopInset>
      <section className="pt-5 md:mx-auto md:max-w-3xl">
        <Link className="block overflow-hidden rounded-[2rem] bg-muted text-foreground" href="/trips/detail">
          <Image src="/stays/city.webp" alt="Seoul" width={1600} height={1000} className="h-48 w-full object-cover" />
          <div className="p-5">
            <p className="text-foreground/50 text-xs uppercase tracking-[0.24em]">Next trip</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-2xl">Seoul City Stay</h3>
                <p className="mt-1 text-foreground/50 text-sm">May 28 - May 30 · 2 guests</p>
              </div>
              <AiOutlineRight />
            </div>
          </div>
        </Link>
        <Link className={appCard(undefined, "mt-4 flex items-center gap-3 rounded-3xl p-4")} href="/memo">
          <div className={iconTileRecipe()}>
            <AiOutlineEdit />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Trip notes</p>
            <p className="text-foreground/50 text-sm">Shared with everyone on this trip, live</p>
          </div>
          <AiOutlineRight className="text-foreground/40" />
        </Link>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {["Check-in guide", "Local places"].map((item) => (
            <div className={appCard(undefined, "rounded-3xl p-4")} key={item}>
              <p className="font-semibold">{item}</p>
              <p className="mt-1 text-foreground/50 text-sm">Helpful details are ready for you before your trip.</p>
            </div>
          ))}
        </div>
      </section>
    </Screen>
  ));
