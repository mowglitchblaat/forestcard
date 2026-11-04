import * as React from 'react';
import { cn } from 'cn';

// A native checkbox (or radio, with type="radio"), in the theme's accent colour.
function Checkbox({ className, type = 'checkbox', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
