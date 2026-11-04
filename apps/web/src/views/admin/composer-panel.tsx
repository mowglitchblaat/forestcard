// The composer's panel (the legacy page's htmlCompo and brancherCompo): the bare drawing, its zoom,
// width and height (dragged in the preview to place it, the wheel zooms), the plaque's font, style,
// size, position and margin, the ultimate's art direction, the plaque's lines and their
// explanations (automatic until edited), and the live preview. Shared by Admin · Cartes and the
// creation of a card from a player's proposal.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { type ComposerCard, type ComposerSettings, getComposer } from '@/lib/composer';
import { ICONS } from '@/lib/icons';
import { Choice, Field } from './kit';

// What the panel works on: the drawing (from a file, or the one kept on the card), or else the
// card's current ready image shown as it is, and the settings.
export type ComposerState = {
  drawing: HTMLImageElement | null;
  drawingFile: File | null;
  drawingPath: string | null;
  image: HTMLImageElement | null;
  settings: ComposerSettings;
};

export const emptyComposer = (): ComposerState => ({
  drawing: null,
  drawingFile: null,
  drawingPath: null,
  image: null,
  settings: { ...getComposer().DEF },
});

function Range({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: ReactNode;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </Field>
  );
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => fail(new Error('image illisible'));
    img.src = URL.createObjectURL(file);
  });

const fileName = (name: string) =>
  (name || 'carte')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase();

export function ComposerPanel({
  title,
  help,
  card,
  tier,
  name,
  state,
  onChange,
  children,
}: {
  title: ReactNode;
  help: ReactNode;
  card: ComposerCard;
  tier: string;
  name: string;
  state: ComposerState;
  onChange: (next: ComposerState) => void;
  children?: ReactNode;
}) {
  const cpo = getComposer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [info, setInfo] = useState('');
  const o = state.settings;
  const set = (patch: Partial<ComposerSettings>) =>
    onChange({ ...state, settings: { ...o, ...patch } });

  // The preview: drawn at full size, then reduced in high quality to the canvas's displayed size.
  // The card is compared by its JSON: the editor passes a new object at each render.
  const cardKey = JSON.stringify(card);
  useEffect(() => {
    const carte = JSON.parse(cardKey) as ComposerCard;
    const settings = state.settings;
    const cv = canvas.current;
    if (!cv) return;
    let stale = false;
    const frame = requestAnimationFrame(() => {
      void (async () => {
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        if (!state.drawing) {
          cpo.taille(cv);
          ctx.clearRect(0, 0, cv.width, cv.height);
          if (state.image) {
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(state.image, 0, 0, cv.width, cv.height);
          }
          setInfo(
            state.image
              ? 'Image actuelle (déjà prête). Ajoute le dessin seul pour passer au nouveau système.'
              : 'Ajoute ton dessin seul pour voir la carte se composer.',
          );
          return;
        }
        const buffer = document.createElement('canvas');
        buffer.width = cpo.W;
        buffer.height = cpo.H;
        const bctx = buffer.getContext('2d');
        if (!bctx) return;
        await cpo.rendre(bctx, {
          dessin: state.drawing,
          carte,
          tier,
          o: settings,
          chiffres: true,
        });
        if (stale) return;
        cpo.reduire(buffer, cv);
        setInfo(
          "Aperçu de la carte avec chiffres ; l'image de combat est la même, sans les chiffres.",
        );
      })();
    });
    return () => {
      stale = true;
      cancelAnimationFrame(frame);
    };
  }, [state, cardKey, tier, cpo]);

  // The wheel zooms the drawing: a non-passive listener, to keep the page from scrolling.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const wheel = (e: WheelEvent) => {
      if (!state.drawing) return;
      e.preventDefault();
      const z = Math.min(3, Math.max(0.5, o.z * (e.deltaY < 0 ? 1.05 : 1 / 1.05)));
      onChange({ ...state, settings: { ...o, z } });
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => cv.removeEventListener('wheel', wheel);
  }, [state, o, onChange]);

  const auto = cpo.lignes(card, { textes: null, dtextes: null });
  const lines = o.textes ? o.textes.join('\n') : auto.map((l) => l.t).join('\n');
  const explanations = o.dtextes ? o.dtextes.join('\n') : auto.map((l) => l.d ?? '').join('\n');

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <b>
          {title}{' '}
          <small className="font-normal text-muted-foreground">composeur {cpo.VERSION}</small>
        </b>
        <span className="text-sm text-muted-foreground">{help}</span>
      </div>
      {/* The preview at a working size (20rem), kept in view while the settings scroll. */}
      <div className="grid items-start gap-4 md:layout-aside-main-20">
        <div className="flex flex-col gap-1 md:sticky md:top-4">
          <canvas
            ref={canvas}
            width={cpo.W}
            height={cpo.H}
            className="aspect-proposal w-full cursor-grab touch-none rounded-lg bg-muted"
            onPointerDown={(e) => {
              if (!state.drawing) return;
              drag.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const r = e.currentTarget.getBoundingClientRect();
              set({
                x: d.ox + (e.clientX - d.x) / r.width,
                y: d.oy + (e.clientY - d.y) / r.height,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <small className="text-muted-foreground">{info}</small>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Dessin seul (sans cadre, ni écriteau, ni chiffres)">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void loadImage(file).then((drawing) =>
                  onChange({
                    ...state,
                    drawing,
                    drawingFile: file,
                    drawingPath: null,
                    settings: { ...o, z: 1, sx: 1, sy: 1, x: 0, y: 0 },
                  }),
                );
              }}
            />
          </Field>
          <Range
            label="Zoom du dessin · glisse-le dans l'aperçu pour le placer"
            min={50}
            max={300}
            value={Math.round(o.z * 100)}
            onChange={(v) => set({ z: v / 100 })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="Largeur (étirer / resserrer)"
              min={50}
              max={200}
              value={Math.round((o.sx || 1) * 100)}
              onChange={(v) => set({ sx: v / 100 })}
            />
            <Range
              label="Hauteur (étirer / aplatir)"
              min={50}
              max={200}
              value={Math.round((o.sy || 1) * 100)}
              onChange={(v) => set({ sy: v / 100 })}
            />
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => set({ z: 1, sx: 1, sy: 1, x: 0, y: 0 })}
            >
              ↺ Remettre le dessin d'origine
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Police de l'écriteau">
              <NativeSelect value={o.police} onChange={(e) => set({ police: e.target.value })}>
                {cpo.POLICES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Passifs">
              <NativeSelect
                value={o.style}
                onChange={(e) => set({ style: e.target.value === 'texte' ? 'texte' : 'pastille' })}
              >
                <option value="texte">Texte coloré</option>
                <option value="pastille">Pastilles</option>
              </NativeSelect>
            </Field>
          </div>
          <Range
            label="Taille du texte"
            min={60}
            max={140}
            value={o.taille}
            onChange={(v) => set({ taille: v })}
          />
          <Range
            label="Position verticale de l'écriteau"
            min={-300}
            max={300}
            value={o.decal}
            onChange={(v) => set({ decal: v })}
          />
          <Range
            label="Marge de l'écriteau autour du texte"
            min={10}
            max={160}
            value={o.marge}
            onChange={(v) => set({ marge: v })}
          />
          <Choice>
            <Checkbox checked={o.daUlt} onChange={(e) => set({ daUlt: e.target.checked })} /> Ultime
            en italique rouge sombre (la DA des cartes)
          </Choice>
          <Choice>
            <Checkbox checked={o.lueur} onChange={(e) => set({ lueur: e.target.checked })} /> Lueur
            rouge sur l'ultime
          </Choice>
          <Field label="Texte de l'écriteau : une ligne par effet, l'ultime en premier (modifiable ; la couleur suit l'effet de la ligne)">
            <Textarea
              rows={3}
              value={lines}
              onChange={(e) => set({ textes: e.target.value.split('\n') })}
            />
          </Field>
          <Choice>
            <Checkbox
              checked={o.details !== false}
              onChange={(e) => set({ details: e.target.checked })}
            />{' '}
            Explications des compétences sous chaque titre
          </Choice>
          {o.details !== false && (
            <>
              <Range
                label="Taille des explications"
                min={60}
                max={160}
                value={o.dtaille || 100}
                onChange={(v) => set({ dtaille: v })}
              />
              <Field label="Explications : une ligne par effet, dans le même ordre (modifiable ; ligne vide = pas d'explication)">
                <Textarea
                  rows={4}
                  value={explanations}
                  onChange={(e) => set({ dtextes: e.target.value.split('\n') })}
                />
              </Field>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => set({ textes: null, dtextes: null })}
            >
              ↺ Texte automatique
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!state.drawing}
              onClick={() => {
                if (!state.drawing) return;
                void cpo
                  .images({ dessin: state.drawing, carte: card, tier, o })
                  .then(({ carte, combat }) => {
                    for (const [file, suffix] of [
                      [carte, ''],
                      [combat, '-combat'],
                    ] as const) {
                      if (!file) continue;
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(file);
                      a.download = `${fileName(name)}${suffix}.webp`;
                      a.click();
                    }
                  });
              }}
            >
              <ICONS.download />
              Télécharger les images
            </Button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
