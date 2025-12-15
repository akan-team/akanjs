import { Provider, Slide } from "./index_";
import type { ProviderProps } from "./Provider";

export const Swiper = (props: ProviderProps) => {
  return <Provider {...props} />;
};
Swiper.Slide = Slide;
