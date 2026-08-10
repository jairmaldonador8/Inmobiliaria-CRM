import { cn } from '@/lib/utils'

/**
 * Wordmark Klo-Ser: Jost extralight, mayúsculas, tracking 0.42em y guion a
 * media altura EN TINTA (decisión 2026-08-10): el guion toma el color del
 * texto — negro sobre claro, marfil sobre el sidebar oscuro. Nunca café ni
 * ámbar. `dashClassName` permite excepciones puntuales.
 */
export function Wordmark({
  className,
  dashClassName,
  ...props
}: React.ComponentProps<'span'> & { dashClassName?: string }) {
  return (
    <span
      className={cn(
        'font-logo inline-flex items-center font-extralight uppercase leading-none tracking-[0.42em]',
        className
      )}
      {...props}
    >
      klo
      <span
        aria-hidden
        className={cn(
          'ml-[0.04em] mr-[0.42em] inline-block h-0.5 w-[0.72em] shrink-0 bg-current',
          dashClassName
        )}
      />
      ser
    </span>
  )
}
