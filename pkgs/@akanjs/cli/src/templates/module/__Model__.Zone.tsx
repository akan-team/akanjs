/* eslint-disable @akanjs/lint/useClientByFile */
import type { AppInfo, LibInfo } from "@akanjs/devkit";

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
import { Load } from "@akanjs/ui";
import { cnst, ${dict.Model} } from "@${dict.sysName}/client";
import { ClientInit, ClientView } from "@akanjs/signal";

interface CardProps {
  className?: string;
  init: ClientInit<"${dict.model}", cnst.Light${dict.Model}>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(${dict.model}: cnst.Light${dict.Model}) => (
        <${dict.Model}.Unit.Card key={${dict.model}.id} href={\`/${dict.model}/\${${dict.model}.id}\`} ${dict.model}={${dict.model}} />
      )}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"${dict.model}", cnst.${dict.Model}>;
}
export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(${dict.model}) => <${dict.Model}.View.General ${dict.model}={${dict.model}} />} />;
};
`,
  };
}
