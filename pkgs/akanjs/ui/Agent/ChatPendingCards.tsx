"use client";
import { useState } from "react";
import type { AgentSession } from "use-agentic";
import { OverlayPortalProvider, overlayZ, useHoldsScrim } from "../overlayLayer";
import Approval from "./Approval";
import Question from "./Question";
import ToolCard from "./ToolCard";

export const isAsking = (session: AgentSession) =>
  !!(session.pendingApproval || session.pendingCard || session.pendingQuestion);

export const ChatPendingCards = ({ session, portal }: { session: AgentSession; portal: HTMLElement | null }) => (
  <OverlayPortalProvider value={portal}>
    {session.pendingApproval ? <Approval approval={session.pendingApproval} /> : null}
    {session.pendingCard ? <ToolCard card={session.pendingCard} key={session.pendingCard.callId} /> : null}
    {session.pendingQuestion ? (
      <Question key={session.pendingQuestion.callId} question={session.pendingQuestion} />
    ) : null}
  </OverlayPortalProvider>
);

// Zero-size and untransformed, so a modal's `fixed inset-0` root inside it still covers the viewport.
const host = "fixed top-0 left-0 size-0";

export const usePanelOverlays = () => {
  const [layer, onLayer] = useState<HTMLElement | null>(null);
  const [cardLayer, onCardLayer] = useState<HTMLElement | null>(null);
  return { layer, cardLayer, hosts: { layer, onLayer, onCardLayer } };
};

interface PanelOverlayHostsProps {
  asking: boolean;
  layer: HTMLElement | null;
  onLayer: (layer: HTMLElement | null) => void;
  onCardLayer: (layer: HTMLElement | null) => void;
}

// A turn waiting on an answer sinks a scrim the panel opened, or it would cover the card and a click on Approve would
// dismiss the modal, whose own tool may be the one asking. What a card opens has a layer of its own, so it stays up.
export const PanelOverlayHosts = ({ asking, layer, onLayer, onCardLayer }: PanelOverlayHostsProps) => {
  const sunk = useHoldsScrim(layer) && asking;
  return (
    <>
      <div
        className={host}
        ref={onLayer}
        style={{ zIndex: sunk ? overlayZ.agentPanelOverlaySunk : overlayZ.agentPanelOverlay }}
      />
      <div className={host} ref={onCardLayer} style={{ zIndex: overlayZ.agentPanelCardOverlay }} />
    </>
  );
};
