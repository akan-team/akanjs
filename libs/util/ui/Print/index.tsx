import { Area } from "./Area";
import { Provider, ProviderProps } from "./Provider";
import { Trigger } from "./Trigger";

export const Print = (props: ProviderProps) => {
  return <Provider {...props} />;
};

Print.Area = Area;
Print.Trigger = Trigger;
