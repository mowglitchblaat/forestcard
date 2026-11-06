// The story's reader: one chapter in a window, its picture as a header with the title laid over it,
// the text in paragraphs with a large first letter, and the previous / next chapters at the bottom.
// Opened from a chapter of the Story tab, or from a place of the world map (its chapter).

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Chapter } from '@/data/lore';
import { ICONS } from '@/lib/icons';

// The text's paragraphs: a blank line separates them, a single line break stays inside one.
export const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export function ChapterReader({
  chapters,
  index,
  onIndex,
  img,
}: {
  chapters: Chapter[];
  // the chapter shown, null when closed
  index: number | null;
  onIndex: (index: number | null) => void;
  img: (path: string | null) => string | null;
}) {
  const ch = index === null ? null : (chapters[index] ?? null);
  const picture = ch ? img(ch.image_path) : null;
  const paragraphs = ch ? paragraphsOf(ch.texte) : [];
  const previous = index !== null && index > 0 ? index - 1 : null;
  const next = index !== null && index < chapters.length - 1 ? index + 1 : null;
  return (
    <Dialog open={!!ch} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="max-h-dialog gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {ch && index !== null && (
          <>
            <div className="relative">
              {picture ? (
                <img src={picture} alt="" className="block aspect-video w-full object-cover" />
              ) : (
                <div className="aspect-[3/1] w-full bg-muted" />
              )}
              <div className="lore-reader-fade absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-6 pb-4">
                <DialogDescription className="text-xs tracking-widest uppercase">
                  Chapitre {index + 1}
                </DialogDescription>
                <DialogTitle className="text-2xl sm:text-3xl">{ch.titre}</DialogTitle>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-6 pt-4 pb-6 leading-relaxed sm:px-10">
              {paragraphs.map((p, i) => (
                <p key={i} className={`whitespace-pre-line ${i === 0 ? 'lore-reader-first' : ''}`}>
                  {p}
                </p>
              ))}
            </div>
            {(previous !== null || next !== null) && (
              <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                {previous !== null ? (
                  <Button variant="ghost" size="sm" onClick={() => onIndex(previous)}>
                    <ICONS.previous />
                    {chapters[previous]?.titre}
                  </Button>
                ) : (
                  <span />
                )}
                {next !== null && (
                  <Button variant="ghost" size="sm" onClick={() => onIndex(next)}>
                    {chapters[next]?.titre}
                    <ICONS.next />
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
