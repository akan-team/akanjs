"use client";
import { cn } from "akanjs/client";
import { AiOutlineAudio, AiOutlineAudioMuted } from "react-icons/ai";

interface MicProps {
  className?: string;
  listening: boolean;
  label: string;
  onToggle: () => void;
}

export const Mic = ({ className, listening, label, onToggle }: MicProps) => (
  <button
    aria-label={label}
    aria-pressed={listening}
    className={cn(
      "shrink-0 hover:text-foreground",
      listening ? "animate-pulse text-primary" : "text-foreground/50",
      className,
    )}
    onClick={onToggle}
    title={label}
    type="button"
  >
    {listening ? <AiOutlineAudioMuted /> : <AiOutlineAudio />}
  </button>
);
