"use client";
import { ClientInit, ClientView } from "@akanjs/signal";
import { Load } from "@akanjs/ui";
import { cnst, File } from "@shared/client";

interface CardProps {
  className?: string;
  init: ClientInit<"file", cnst.LightFile>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(file: cnst.LightFile) => <File.Unit.Card key={file.id} file={file} />}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"file", cnst.File>;
}
export const View = ({ view }: ViewProps) => {
  return <Load.View view={view} renderView={(file) => <File.View.General file={file} />} />;
};
