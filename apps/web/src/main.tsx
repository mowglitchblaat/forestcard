import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';
import { router } from '@/router';
import { routerHash } from '@/views';

// Legacy anchors (bookmarks, links) are rewritten before the router reads the address.
const rewritten = routerHash(location.hash);
if (rewritten) history.replaceState(null, '', rewritten);

// Data stays fresh 5 minutes: switching views or tabs, or coming back to the window, does not
// re-read it (the author's Supabase quota). What must stay live says so itself (the gold, every
// 45 s); a write will invalidate what it changed.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  },
});
const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
