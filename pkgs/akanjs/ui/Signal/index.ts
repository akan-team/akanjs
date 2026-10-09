import Arg from "./Arg";
import { DocAuthModal, DocSetting, DocSignal, DocSignals, Explorer, Zone } from "./Doc";
import { ListenerResult } from "./Listener";
import { ObjectDetail, ObjectSchema, ObjectType } from "./Object";
import { RestApiEndpoint, RestApiEndpoints, RestApiInterface, RestApiTry } from "./RestApi";
import {
  MessageEndpoint,
  MessageInterface,
  MessageTry,
  PubSubEndpoint,
  PubSubInterface,
  PubSubTry,
  WebSocketEndpoints,
} from "./WebSocket";

export const Signal = {
  Doc: { Zone, Explorer, Setting: DocSetting, AuthModal: DocAuthModal, DocSignals, DocSignal },
  Object: { Type: ObjectType, Detail: ObjectDetail, Schema: ObjectSchema },
  RestApi: { Endpoints: RestApiEndpoints, Endpoint: RestApiEndpoint, Interface: RestApiInterface, Try: RestApiTry },
  Arg,
  Listener: { Result: ListenerResult },
  WebSocket: { Endpoints: WebSocketEndpoints },
  PubSub: { Endpoint: PubSubEndpoint, Interface: PubSubInterface, Try: PubSubTry },
  Message: { Endpoint: MessageEndpoint, Interface: MessageInterface, Try: MessageTry },
};
