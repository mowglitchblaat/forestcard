// Whether the viewport is narrower than the mobile breakpoint, kept in sync with the media query.
// Rewritten from the shadcn template with useSyncExternalStore: the template set state inside an
// effect (lint: react/set-state-in-effect), which renders twice on mount.

import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (onChange: () => void) => {
  const mql = matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches);
}
