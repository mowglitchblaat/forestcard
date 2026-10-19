// Inline styles carry CSS custom properties only (the shadcn lint, no-inline-styles): a dynamic value
// is set as style={{ '--pct': '40%' }} and read by a class (w-(--pct)). React's CSSProperties does
// not type custom properties: this declares them.
import 'react';

declare module 'react' {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
