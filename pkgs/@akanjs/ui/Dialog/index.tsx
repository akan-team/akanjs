import { Action } from "./Action";
import { Content } from "./Content";
import { Modal } from "./Modal";
import { Provider, ProviderProps } from "./Provider";
import { Title } from "./Title";
import { Trigger } from "./Trigger";

export const Dialog = ({ children, ...props }: ProviderProps) => {
  return <Provider {...props}>{children}</Provider>;
};
Dialog.Modal = Modal;
Dialog.Title = Title;
Dialog.Action = Action;
Dialog.Trigger = Trigger;
Dialog.Content = Content;
