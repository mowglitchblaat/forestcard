// A button that confirms only after being held down: the fill shows the progress, releasing early
// cancels. For actions that write (save a deck, recycle, buy), instead of a confirmation dialog.
// Works with the pointer (mouse, touch) and the keyboard (hold Space or Enter).

import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<typeof Button>, 'onClick' | 'asChild'> & {
  onConfirm: () => void;
  // How long to hold, in milliseconds.
  duration?: number;
};

export function HoldButton({
  onConfirm,
  duration = 1000,
  disabled,
  className,
  children,
  ...props
}: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, duration);
  };
  useEffect(() => cancel, []);

  return (
    <Button
      {...props}
      disabled={disabled}
      className={cn('relative overflow-hidden select-none', className)}
      aria-description="Maintenir pour confirmer"
      onPointerDown={(e) => {
        if (e.button === 0) start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 bg-current opacity-20 transition-all ${
          holding ? 'w-full duration-(--hold-ms) ease-linear' : 'w-0 duration-150 ease-out'
        }`}
        style={{ '--hold-ms': `${duration}ms` }}
      />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </Button>
  );
}
