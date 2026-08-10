import { cn } from '@/lib/utils'

/**
 * Wordmark Klo-Ser: Jost extralight, mayúsculas, tracking 0.42em y guion
 * ámbar a media altura (decisión de marca final). Con el rebranding B&N el
 * ámbar del guion es el ÚNICO color de marca en todo el sistema, en claro y
 * oscuro por igual (docs/diseno/); `dashClassName` permite excepciones.
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
          'ml-[0.04em] mr-[0.42em] inline-block h-0.5 w-[0.72em] shrink-0 bg-[#C98A3B]',
          dashClassName
        )}
      />
      ser
    </span>
  )
}
