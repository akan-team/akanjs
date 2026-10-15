"use client";
import { Banner, type cnst } from "@libs/shared/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Load } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"banner", cnst.LightBanner>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(banner) => <Banner.Unit.Card key={banner.id} href={`/banner/${banner.id}`} banner={banner} />}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"banner", cnst.Banner>;
}
export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View className={className} view={view} renderView={(banner) => <Banner.View.General banner={banner} />} />
  );
};
