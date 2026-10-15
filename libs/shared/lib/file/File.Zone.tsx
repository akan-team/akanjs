"use client";
import { type cnst, File } from "@libs/shared/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"file", cnst.LightFile>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units className={className} init={init} renderItem={(file) => <File.Unit.Card key={file.id} file={file} />} />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"file", cnst.File>;
}
export const View = ({ className, view }: ViewProps) => {
  return <Load.View className={className} view={view} renderView={(file) => <File.View.General file={file} />} />;
};
