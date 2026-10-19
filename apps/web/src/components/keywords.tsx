// An effect text with its keywords coloured (src/lib/keywords.ts).

import { KEYWORD_CLASSES, keywordPieces } from '@/lib/keywords';

export function Keywords({ text }: { text: string }) {
  return keywordPieces(text).map((p, i) =>
    p.kind ? (
      <span key={i} className={KEYWORD_CLASSES[p.kind]}>
        {p.text}
      </span>
    ) : (
      p.text
    ),
  );
}
