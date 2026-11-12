---
"akanjs": patch
---

`Agent.Chat`, `Select` and `Data.ListContainer` are split into named hooks and sub-components that stay in their original three files, with behaviour, rendered markup and render counts unchanged. `ui/Agent/Chat.tsx` gains `useChatSession`, `useOpenState`, `useChatShortcut`, `useAbortOwnedSession`, `useChatComposer`, `useChatLayers`, `usePanelFocus`, `transcriptOf` and `ChatPanel`. `ui/Select.tsx` gains `labelOptionsOf`. `ui/Data/ListContainer.tsx` gains `useListQuery`, `useListTools`, `useViewActions`, `useListDashboard`, `exportToolsOf` and `ListToolbar`.
