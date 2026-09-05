import { INTAKE_EMAIL } from '@/lib/site';
import { cn } from '@/lib/utils';

export function FitCheckFallback({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>
      Email doesn’t open? Write to{' '}
      <a className="font-medium underline underline-offset-2" href={`mailto:${INTAKE_EMAIL}`}>
        {INTAKE_EMAIL}
      </a>
      .
    </p>
  );
}
