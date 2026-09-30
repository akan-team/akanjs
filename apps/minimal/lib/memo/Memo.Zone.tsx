"use client";
import { type cnst, Memo } from "@apps/minimal/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"memo", cnst.LightMemo>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(memo) => <Memo.Unit.Card key={memo.id} href={`/memo/${memo.id}`} memo={memo} />}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"memo", cnst.Memo>;
}
export const View = ({ className, view }: ViewProps) => {
  return <Load.View className={className} view={view} renderView={(memo) => <Memo.View.General memo={memo} />} />;
};
