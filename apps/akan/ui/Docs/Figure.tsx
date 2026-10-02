import { cn } from "akanjs/client";
import { Image } from "akanjs/ui";

interface FigureProps {
  className?: string;
  title: string;
  image: string;
  // Never rendered: script/generateDiagramImage.ts reads this literal from the page source to redraw `image`.
  prompt: string;
  alt: string;
  width?: number;
  height?: number;
}

export const Figure = ({ className, title, image, alt, width = 1536, height = 1024 }: FigureProps) => {
  return (
    <figure
      className={cn("studio-lift my-5 overflow-hidden rounded-2xl border border-foreground/8 bg-card/80", className)}
    >
      <figcaption className="flex items-center gap-2 border-foreground/6 border-b bg-foreground/3 px-4 py-2.5 font-bold text-foreground/75 text-sm">
        <span aria-hidden className="jelly tint-primary size-2.5 shrink-0 rounded-full" />
        {title}
      </figcaption>
      <div className="p-4">
        <Image
          src={`/akanjsImage/diagrams/${image}.png`}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          className="mx-auto h-auto w-full max-w-3xl mix-blend-multiply dark:mix-blend-screen dark:hue-rotate-180 dark:invert"
        />
      </div>
    </figure>
  );
};
