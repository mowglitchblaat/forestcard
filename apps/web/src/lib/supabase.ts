// The Supabase client, with the same project and the same public key as the legacy page: the same
// session storage key too, so a session opened on one page is valid on the other.

import { createClient } from '@supabase/supabase-js';

const URL = 'https://bjsvqikjnvaomyoifiml.supabase.co';
// Publishable key: public by design (it is in the legacy page), access is limited by the database
// rules (RLS).
const PUBLISHABLE_KEY = 'sb_publishable_-3cPqDCyE-zhb3z5r6dPhg_DJFKGAI6';

export const supabase = createClient(URL, PUBLISHABLE_KEY);
