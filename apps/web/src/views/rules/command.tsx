// A chat command, as a chip that copies it on click (to paste it in the Twitch chat), and a channel
// points reward, which is activated in Twitch, not pasted.

import { TONES } from '@/lib/tones';
import { ICONS } from '@/lib/icons';
import { useState } from 'react';

export function Command({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <button
      type="button"
      onClick={copy}
      title="Copier"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-chip text-foreground transition hover:bg-accent"
    >
      {children}
      {copied ? <ICONS.copied className="size-3" /> : <ICONS.copy className="size-3 opacity-50" />}
    </button>
  );
}

// A channel points reward: activated from Twitch's channel points menu, nothing to copy.
export function Reward({ children }: { children: string }) {
  return (
    <span
      title="Récompense de points de chaîne"
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-chip font-medium ${TONES.twitch.badge}`}
    >
      <ICONS.sauce className="size-3" />
      {children}
    </span>
  );
}
