import { withRef, withVariants } from "@udecode/cn";
import { PlateElement } from "@udecode/plate-common";
import { cva } from "class-variance-authority";
import React from "react";

const headingVariants = cva("", {
  variants: {
    variant: {
      h1: "font-heading mb-1 mt-[2em] text-4xl font-bold",
      h2: "font-heading mb-px mt-[1.4em] text-2xl font-semibold tracking-tight",
      h3: "font-heading mb-px mt-[1em] text-xl font-semibold tracking-tight",
      h4: "font-heading mt-[0.75em] text-lg font-semibold tracking-tight",
      h5: "mt-[0.75em] text-lg font-semibold tracking-tight",
      h6: "mt-[0.75em] text-base font-semibold tracking-tight",
    },
    isFirstBlock: {
      true: "mt-0",
      false: "",
    },
  },
});

const HeadingElementVariants = withVariants(PlateElement, headingVariants, ["isFirstBlock", "variant"]);

export const HeadingElement = withRef<typeof HeadingElementVariants>(
  ({ variant = "h1", isFirstBlock, children, ...props }, ref) => {
    const { element, editor } = props;
    if (!variant) return null;
    const Element = variant;

    return (
      <HeadingElementVariants
        ref={ref}
        asChild
        variant={variant}
        isFirstBlock={element === editor.children[0]}
        {...props}
      >
        <Element>{children}</Element>
      </HeadingElementVariants>
    );
  }
);
