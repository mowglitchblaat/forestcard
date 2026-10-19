// The combat overlay itself (fx-preview.html, generated from the overlay page: fx-preview/), in a
// frame: once the page says it is ready, the frame calls its preview API. Used by the encyclopedia
// (an effect played on a card, a rarity's shine).

import { ICONS } from '@/lib/icons';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

export type PreviewCard = { nom: string; image: string | null; rar: unknown };
// fx-preview/preview.js, window.fxPreview.
export type PreviewApi = {
  show: (card: PreviewCard, opponent: PreviewCard | null) => void;
  play: (effect: string) => void;
};

const apiOf = (frame: HTMLIFrameElement | null): PreviewApi | undefined =>
  (frame?.contentWindow as (Window & { fxPreview?: PreviewApi }) | null)?.fxPreview;

// onReady: what to show once the page is loaded. A new value does not reach a page already loaded:
// give the frame a new key to show something else.
export function PreviewFrame({
  title,
  onReady,
  className = 'h-48',
  replay,
}: {
  title: string;
  onReady: (api: PreviewApi) => void;
  // The frame's height.
  className?: string;
  // A replay button, calling this.
  replay?: (api: PreviewApi) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.fxPreview !== 'ready') return;
      const api = apiOf(frame.current);
      if (api) onReady(api);
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [onReady]);
  return (
    <div className="relative overflow-hidden rounded-md bg-muted/40">
      <iframe
        ref={frame}
        src="fx-preview.html?demo"
        title={title}
        className={`pointer-events-none w-full ${className}`}
      />
      {replay && (
        <Button
          size="icon"
          variant="secondary"
          aria-label="Rejouer l'animation"
          className="absolute right-1.5 bottom-1.5 size-7"
          onClick={() => {
            const api = apiOf(frame.current);
            if (api) replay(api);
          }}
        >
          <ICONS.replay />
        </Button>
      )}
    </div>
  );
}

// A card, and an effect played on it. effect: none for a card alone (its frame and rarity shine);
// opponent: none, the card alone.
export function FxPreview({
  effect,
  card,
  opponent = null,
  className,
}: {
  effect?: string;
  card: PreviewCard;
  opponent?: PreviewCard | null;
  className?: string;
}) {
  return (
    <PreviewFrame
      title={effect ? "Animation de l'effet" : 'Aperçu de la carte'}
      className={className}
      onReady={(api) => {
        api.show(card, opponent);
        if (effect) api.play(effect);
      }}
      replay={effect ? (api) => api.play(effect) : undefined}
    />
  );
}
