import { clsx } from "@akanjs/client";
import type { TextDoc } from "@akanjs/constant";
import { ObjectId } from "@akanjs/ui";

interface CardProps {
  className?: string;
  doc: TextDoc;
}
export const Card = ({ className, doc }: CardProps) => {
  return (
    <div className={clsx("bg-base-content/5 w-full rounded-lg p-4", className)}>
      <ObjectId id={doc.id as string} />
      <Doc doc={doc} />
    </div>
  );
};

interface DocProps {
  doc: TextDoc;
  prefix?: string;
}
export const Doc = ({ doc, prefix }: DocProps) => {
  return (
    <div className="">
      {Object.entries(doc).map(([key, value]) => {
        if (key === "id") return null;
        else if (typeof value === "string")
          return (
            <div key={key}>
              {prefix}
              {key}: {value}
            </div>
          );
        else return <Doc key={key} doc={value} prefix={`${prefix ? `${prefix}.` : ""}${key}`} />;
      })}
    </div>
  );
};
