import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
  model: string;
  sysName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Zone.tsx`,
    content: `
"use client";
import { Load } from "akanjs/ui";
// Alias the domain namespace so the Card/View exports below never collide with the model name
// (a model literally named "card" or "view" would otherwise shadow this import).
import { type cnst, ${dict.Model} as ${dict.Model}Domain } from "@${scanInfo?.type ?? "apps"}/${dict.sysName}/client";
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";

interface CardProps {
  className?: string;
  init: ClientInit<"${dict.model}", cnst.Light${dict.Model}>;
  slice?: SliceMeta;
}
export const Card = ({ className, init, slice }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(${dict.model}) => (
        <${dict.Model}Domain.Unit.Card key={${dict.model}.id} href={\`/${dict.model}/\${${dict.model}.id}\`} ${dict.model}={${dict.model}} />
      )}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"${dict.model}", cnst.${dict.Model}>;
}
export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(${dict.model}) => <${dict.Model}Domain.View.General ${dict.model}={${dict.model}} />} />;
};
`,
  };
}
