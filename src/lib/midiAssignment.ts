import type { EffectPlugin, MidiCc } from "../api/types";

/** True when MOD reports a real MIDI assignment (unassigned is often channel: -1). */
export function isAssignedMidiCc(cc: MidiCc | null | undefined): boolean {
  if (!cc) return false;
  if (typeof cc.channel !== "number" || typeof cc.control !== "number") return false;
  return cc.channel >= 0 && cc.control >= 0;
}

/** Effect has any MIDI controller on bypass or a control port. */
export function pluginHasMidiAssignment(plugin: EffectPlugin): boolean {
  if (isAssignedMidiCc(plugin.bypassCC)) return true;
  return plugin.ports.some((p) => isAssignedMidiCc(p.midiCC));
}
