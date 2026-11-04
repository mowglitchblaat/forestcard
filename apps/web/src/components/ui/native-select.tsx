import * as React from 'react';
import { cn } from 'cn';

// A plain <select>, styled like Input: for the admin's long lists (cards, players), where the native
// control stays fast and searchable by typing.
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
