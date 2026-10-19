// The patch notes fingerprint as shared query state (one fetch for the sidebar and the page).

import { useQuery } from '@tanstack/react-query';
import { fetchPatchNotesFingerprint, PATCH_NOTES_REFRESH, patchNotesKeys } from './patchnotes';

export const usePatchNotesFingerprint = (): string | undefined =>
  useQuery({
    queryKey: patchNotesKeys.fingerprint,
    queryFn: fetchPatchNotesFingerprint,
    refetchInterval: PATCH_NOTES_REFRESH,
    retry: false,
  }).data;
