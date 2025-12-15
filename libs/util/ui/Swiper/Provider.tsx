"use client";
import "swiper/css";
import "swiper/css/effect-fade";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/swiper-bundle.css";

import { Autoplay, EffectCoverflow, Pagination } from "swiper/modules";
import { Swiper, type SwiperProps } from "swiper/react";

export type ProviderProps = SwiperProps;
export const Provider = ({ children, ...props }: ProviderProps) => {
  return (
    <Swiper modules={[EffectCoverflow, Pagination, Autoplay]} centeredSlides {...props}>
      {children}
    </Swiper>
  );
};
