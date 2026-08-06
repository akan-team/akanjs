import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  return (
    <Scroll>
      <Scroll.Slide id="css-overview" title={"CSS Styling Guidelines"}>
        <Docs.Title>{"CSS Styling Guidelines"}</Docs.Title>
        <Docs.Description>
          Comprehensive styling guidelines for Akan.js components using TailwindCSS and akanjs/ui semantic tokens
          ensuring consistency, maintainability and proper theming across applications.
        </Docs.Description>
      </Scroll.Slide>
      <div className="my-4 h-px w-full bg-border" />

      <Scroll.Slide id="core-principles" title={"Core Principles"}>
        <Docs.Title>{"Core Principles"}</Docs.Title>
        <Docs.Description>Follow these fundamental principles for consistent styling:</Docs.Description>
        <Docs.IntroTable
          type="principle"
          items={[
            {
              name: "Utility-First",
              desc: "Use Tailwind's utility classes instead of custom CSS",
              example: "className='p-4 bg-background'",
            },
            {
              name: "Component Composition",
              desc: "Design for composition with className overrides",
              example: "Accept className prop in components",
            },
            {
              name: "Theme Consistency",
              desc: "Use the semantic design-token color system",
              example: "bg-primary text-primary-foreground",
            },
            {
              name: "Responsive Design",
              desc: "Mobile-first layouts with breakpoint prefixes",
              example: "flex flex-col md:flex-row",
            },
            {
              name: "Accessibility",
              desc: "Ensure proper contrast and focus states",
              example: "focus:ring-2 focus:ring-primary",
            },
          ]}
        />
      </Scroll.Slide>
      <div className="my-4 h-px w-full bg-border" />

      <Scroll.Slide id="class-management-clsx" title={"Class Management (clsx)"}>
        <Docs.Title>{"Class Management (clsx)"}</Docs.Title>
        <Docs.Description>Use clsx for conditional class handling and composition:</Docs.Description>
        <Code.Snippet
          language="typescript"
          code={`import { clsx } from "@akanjs/client";

// Basic usage
<div className={clsx(
  "base-classes",
  condition && "conditional-classes",
  className
)}>
  {/* Content */}
</div>

// Object syntax
<div className={clsx(
  "base-styles",
  {
    "bg-primary": isPrimary,
    "bg-secondary": isSecondary,
    "bg-destructive": isError,
  },
  className
)}>
  {/* Content */}
</div>`}
        />
      </Scroll.Slide>
      <div className="my-4 h-px w-full bg-border" />

      <Scroll.Slide id="component-best-practices" title={"Component Best Practices"}>
        <Docs.Title>{"Component Best Practices"}</Docs.Title>
        <Docs.SubSubTitle>Forward className Prop</Docs.SubSubTitle>
        <Code.Snippet
          language="typescript"
          code={`interface CardProps {
  className?: string;
}

export const Card = ({ className }: CardProps) => (
  <div className={clsx("card bg-background shadow-md", className)}>
    {/* Content */}
  </div>
);`}
        />

        <Docs.SubSubTitle>Semantic Color System</Docs.SubSubTitle>
        <Docs.OptionTable
          items={[
            {
              key: "primary",
              type: "color",
              default: "theme-defined",
              desc: "Primary brand color",
              example: "bg-primary text-primary-foreground",
            },
            {
              key: "secondary",
              type: "color",
              default: "theme-defined",
              desc: "Secondary brand color",
              example: "bg-secondary text-secondary-foreground",
            },
            {
              key: "base-100",
              type: "color",
              default: "theme-defined",
              desc: "Base background color",
              example: "bg-background text-foreground",
            },
          ]}
        />

        <Docs.SubSubTitle>Responsive Design</Docs.SubSubTitle>
        <Code.Snippet
          language="typescript"
          code={`<div className="flex flex-col gap-4 md:flex-row">
  <div className="w-full md:w-1/3">Sidebar</div>
  <div className="w-full md:w-2/3">Main Content</div>
</div>`}
        />

        <Docs.SubSubTitle>State Variants</Docs.SubSubTitle>
        <Code.Snippet
          language="typescript"
          code={`<button className="
  bg-primary 
  hover:bg-primary 
  focus:ring-2 focus:ring-primary
  active:scale-95
  disabled:opacity-50
">
  Interactive Button
</button>`}
        />

        <Docs.SubSubTitle>Consistent Spacing</Docs.SubSubTitle>
        <Code.Snippet
          language="typescript"
          code={`<div className="space-y-4 p-4">
  <div>Section 1</div>
  <div>Section 2</div>
  <div>Section 3</div>
</div>`}
        />
      </Scroll.Slide>
      <div className="my-4 h-px w-full bg-border" />

      <Scroll.Slide id="additional-resources" title={"Additional Resources"}>
        <Docs.Title>{"Additional Resources"}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <a
                href="https://tailwindcss.com/docs"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                TailwindCSS Documentation
              </a>
            </li>
            <li>
              <a
                href="https://www.radix-ui.com/"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                Radix UI Documentation
              </a>
            </li>
            <li>
              <a
                href="https://nerdcave.com/tailwind-cheat-sheet"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                Tailwind CSS Cheat Sheet
              </a>
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>

      <div className="my-4 h-px w-full bg-border" />
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
