import { usePage } from "@apps/akan/client";
import { Link } from "akanjs/ui";
import { BsArrowRight } from "react-icons/bs";
import { Friend, JellyStar } from "../Jelly";
import { jellyButtonRecipe } from "../Recipe";

interface NotFoundProps {
  pathname: string;
}
export const NotFound = ({ pathname }: NotFoundProps) => {
  const { l } = usePage();
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center px-6 pt-[calc(var(--akanjs-header-offset)+3rem)] pb-16">
      <div className="jelly-glass relative w-full max-w-xl rounded-4xl px-8 py-10 text-center md:px-12">
        <span className="jelly-float pointer-events-none absolute -top-10 -left-6 block [--float-tilt:-6deg]">
          <Friend name="rocket" className="size-20" />
        </span>
        <span className="jelly-float pointer-events-none absolute -right-5 -bottom-8 block [--float-delay:-2s]">
          <Friend name="moon" className="size-16" />
        </span>
        <div aria-hidden className="flex items-center justify-center font-black text-8xl text-foreground leading-none">
          <span>4</span>
          <span className="mx-1 block size-20">
            <JellyStar motion="breathe" />
          </span>
          <span>4</span>
        </div>
        <h1 className="mt-6 font-black text-3xl md:text-4xl">
          {l.trans({ en: "This page drifted out of orbit.", ko: "이 페이지는 궤도를 벗어났어요." })}
        </h1>
        <p className="mt-3 text-foreground/60 leading-7">
          {l.trans({
            en: "The address does not exist, or it moved somewhere else.",
            ko: "없는 주소이거나 다른 곳으로 옮겨졌습니다.",
          })}
        </p>
        <code className="mt-5 inline-block max-w-full truncate rounded-full bg-foreground/6 px-4 py-1.5 font-mono text-foreground/60 text-sm">
          {pathname}
        </code>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className={jellyButtonRecipe()}>
            {l.trans({ en: "Go home", ko: "홈으로" })}
          </Link>
          <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ tone: "ink" })}>
            {l.trans({ en: "Open the docs", ko: "문서 열기" })} <BsArrowRight />
          </Link>
        </div>
      </div>
    </main>
  );
};
