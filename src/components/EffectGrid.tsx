import type { CSSProperties } from "react";
import { effectCardVars } from "../lib/color";
import type { EffectPlugin } from "../api/types";
import { StompSwitch } from "./StompSwitch";

interface Props {
  plugins: EffectPlugin[];
  onToggle: (plugin: EffectPlugin) => void;
  onOpenSettings: (plugin: EffectPlugin) => void;
}

export function EffectGrid({ plugins, onToggle, onOpenSettings }: Props) {
  return (
    <div className="grid">
      {plugins.map((plugin) => {
        const active = !plugin.bypassed;
        const vars = effectCardVars(plugin.color, plugin.uri);
        const hasColor = Object.keys(vars).length > 0;
        const style = vars as CSSProperties;

        return (
          <article
            key={plugin.instance}
            className={`effect ${hasColor ? "has-color" : ""}`}
            style={style}
          >
            <div className="effect-head">
              <span className="effect-name">{plugin.title ?? plugin.instance}</span>
              <button
                type="button"
                className="effect-settings-btn"
                aria-label={`${plugin.title ?? plugin.instance} settings`}
                onClick={() => onOpenSettings(plugin)}
              >
                ⚙
              </button>
            </div>

            <div className="stomp-pedal">
              <span
                className={`stomp-led ${active ? "on" : ""}`}
                aria-label={active ? "Effect on" : "Effect off"}
                role="status"
              />
              <StompSwitch
                active={active}
                label={`Toggle ${plugin.title ?? plugin.instance}`}
                onPress={() => onToggle(plugin)}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}
