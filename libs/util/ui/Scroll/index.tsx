import { Navigator } from "./Navigator";
import { Provider, ProviderProps } from "./Provider";
import { Render, RenderContext } from "./Render";
import { Slide } from "./Slide";
import { TitleNavigator } from "./TitleNavigator";

export const Scroll = (props: ProviderProps) => {
  return <Provider {...props} />;
};
Scroll.Navigator = Navigator;
Scroll.Render = Render;
Scroll.RenderContext = RenderContext;
Scroll.Slide = Slide;
Scroll.TitleNavigator = TitleNavigator;
