// The chat's own parts, so an app bound to an `Agent*` slot composes the default instead of re-implementing it.
// The `use-agentic` names below are re-exported because an app may not import that package directly (a barrel
// takes no third-party import): without them a replacement cannot see the session an `Agent.Zone` handed down,
// a custom transport cannot be typed, and a host cannot back the transcript with a store of its own.
export {
  AgentProvider,
  type AgentProviderProps,
  type AgentRunner,
  AgentSession,
  type AgentSessionOptions,
  type ChatMessage,
  type CompactOptions,
  type ContextBlock,
  httpRunner,
  type PublishedTool,
  type RunnerEvent,
  type RunnerRequest,
  SessionContext,
  type SessionHistory,
  type SurfaceView,
  useAgent,
} from "use-agentic";
export { Agent } from "./Agent";
export { type ApprovalProps, DefaultApproval } from "./Agent/Approval";
export { type AgentSessionSetup, agentSessionOf } from "./Agent/agentSessionOf";
export { type AttachReader, maxAttachmentBytes } from "./Agent/attachment";
export { type BubbleProps, DefaultBubble } from "./Agent/Bubble";
export type { ChatProps } from "./Agent/Chat";
export { type ChatCommand, ChatCommands } from "./Agent/ChatCommands";
export { type ComposerProps, DefaultComposer } from "./Agent/Composer";
export { fetchRunner } from "./Agent/fetchRunner";
export type { HistoryProps as AgentHistoryProps } from "./Agent/History";
export { DefaultLauncher, type LauncherProps } from "./Agent/Launcher";
export { type CodeProps, DefaultCode, DefaultMarkdown, type MarkdownProps } from "./Agent/Markdown";
export { DefaultMenu, type MenuProps as AgentMenuProps, type MenuRow } from "./Agent/Menu";
export { DefaultQuestion, type QuestionProps } from "./Agent/Question";
export type { PersistOption } from "./Agent/sessionHistory";
export type { AgentBuiltin, BuiltinOption } from "./Agent/sessionView";
export { tokenCount } from "./Agent/tokenCount";
export type { VoiceEngine, VoiceHandlers, VoiceListener, VoiceSpeech } from "./Agent/voice";
export { agentAttrs } from "./agentAttrs";
export { animated } from "./animated";
export { Badge } from "./Badge";
export { BottomSheet, type BottomSheetRef } from "./BottomSheet";
export { Button } from "./Button";
export { ClientSide } from "./ClientSide";
export { Clipboard } from "./Clipboard";
export { Constant } from "./Constant";
export { Copy } from "./Copy";
export { CsrImage } from "./CsrImage";
export { Data } from "./Data";
export { DatePicker } from "./DatePicker";
export { Dialog } from "./Dialog";
export { DragAction } from "./DragAction";
export { DraggableList } from "./DraggableList";
export { DROPDOWN_KEEP_OPEN_ATTR, Dropdown } from "./Dropdown";
export { Empty } from "./Empty";
export { Field } from "./Field";
export { FontFace } from "./FontFace";
export { Image } from "./Image";
export { InfiniteScroll } from "./InfiniteScroll";
export { Input } from "./Input";
export { KeyboardAvoiding } from "./KeyboardAvoiding";
export { Layout } from "./Layout";
export { LegacyModal } from "./LegacyModal";
export { Link } from "./Link";
export { Load } from "./Load";
export { Loading } from "./Loading";
export { Menu } from "./Menu";
export { Modal } from "./Modal";
export { Model } from "./Model";
export { More } from "./More";
export { ObjectId } from "./ObjectId";
export {
  isOwnOverlayClick,
  OVERLAY_LAYER_ATTR,
  OverlayOwnerProvider,
  useOverlayLayerProps,
  useOverlayScope,
} from "./overlayLayer";
export { Pagination } from "./Pagination";
export { Popconfirm } from "./Popconfirm";
export { Portal } from "./Portal";
export { Radio } from "./Radio";
export {
  RecentTime,
  type RecentTimeProps,
  type RecentTimeRelative,
  type RecentTimeRelativeFormat,
  type RecentTimeRelativeStyle,
  type RecentTimeRelativeUnit,
} from "./RecentTime";
export { Refresh } from "./Refresh";
export {
  type BadgeVariants,
  type ButtonVariants,
  badgeRecipe,
  buttonRecipe,
  type InputSurfaceVariants,
  inputRecipe,
  recipe,
  tv,
} from "./recipe";
export { ScreenNavigator } from "./ScreenNavigator";
export { Select } from "./Select";
export { Signal } from "./Signal";
export { Switch, type SwitchProps } from "./Switch";
export { System, type WebAppManifest } from "./System";
export { Tab } from "./Tab";
export { Table } from "./Table";
export { ToggleSelect } from "./ToggleSelect";
export { Tooltip, type TooltipProps } from "./Tooltip";
// `UiOverrideProvider` is public on purpose, not incidentally: an app mounts it by hand where the route
// manifest cannot reach — a component rendered by a root-boundary layout sits outside the generated provider.
export {
  type AkanModalComponent,
  type AkanUiOverrideManifest,
  type AkanUiOverrideName,
  type AkanUiOverrides,
  type AkanUiRecipes,
  createOverridable,
  override,
  UiOverrideProvider,
  type UiOverrideProviderProps,
  useUiOverride,
  useUiRecipe,
} from "./UiOverride";
export { Unauthorized } from "./Unauthorized";
