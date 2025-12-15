import { Menu } from "./Menu";
import { Menus } from "./Menus";
import { Panel } from "./Panel";
import { Provider, ProviderProps } from "./Provider";

export const Tab = (props: ProviderProps) => {
  return <Provider {...props} />;
};
Tab.Menu = Menu;
Tab.Menus = Menus;
Tab.Panel = Panel;
