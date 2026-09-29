import { definePlugin } from "../../../packages/core/src/index.ts";

/** The default output's volume, as the system's own volume control shows it. */
export interface VolumeState {
  /** 0 (silent) to 1 (full); null when the output takes no volume from the computer (HDMI audio on macOS). */
  level: number | null;
  muted: boolean;
  /** False when setVolume is refused for this output. */
  settable: boolean;
}

export interface VolumeApi {
  getVolume(): Promise<VolumeState>;
  /** `level` from 0 to 1. */
  setVolume(args: { level: number }): Promise<VolumeState>;
  setMuted(args: { muted: boolean }): Promise<VolumeState>;
}

export interface VolumeEvents {
  /** The default output, its volume or its mute changed, whoever changed it. */
  change: VolumeState;
}

/**
 * The system's output volume: CoreAudio's default output device (macOS), the default render endpoint the taskbar
 * slider moves (Windows), the default sink of PulseAudio or PipeWire through pactl (Linux), and on Android the
 * media volume the volume keys move while the app plays. iOS and the web answer UNSUPPORTED.
 */
export const volume = definePlugin<VolumeApi, VolumeEvents>("volume", {
  methods: ["getVolume", "setVolume", "setMuted"],
  events: ["change"],
});
