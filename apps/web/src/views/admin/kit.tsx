// The admin's building blocks: a section (a card with its title and help), a labelled field, the
// result of the last action (saved, or the database's refusal), and the hook that runs an action
// and refreshes what the admin shows. The legacy page told the result in a dialog (uiAlert); here it
// stays under the section that did it.

import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ICONS } from '@/lib/icons';

export function AdminSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

// A checkbox or a radio with its text on the right.
export function Choice({ children }: { children: ReactNode }) {
  return <label className="flex items-center gap-2 text-sm">{children}</label>;
}

export type Notice = { kind: 'ok' | 'error'; text: string } | null;

export function NoticeView({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === 'ok' ? (
    <Alert variant="success">
      <ICONS.done />
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <ICONS.info />
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

// Runs an admin action: shows its message (the text it returns, or the error), then reloads what the
// page shows: the admin's lists, and the player's own data (gold, collection) an action may change.
export function useAction() {
  const client = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<string | void>) => {
    setPending(true);
    setNotice(null);
    try {
      const text = await action();
      if (text) setNotice({ kind: 'ok', text });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPending(false);
      await client.invalidateQueries();
    }
  };
  return {
    run: (action: () => Promise<string | void>) => void run(action),
    pending,
    notice,
    setNotice,
  };
}

// An admin page that could not load (a table or function missing on the database's side).
export function AdminError({ error }: { error: Error }) {
  return <NoticeView notice={{ kind: 'error', text: error.message }} />;
}
