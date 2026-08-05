import { cn } from '@/lib/utils'

/**
 * Wordmark Klo-Ser: Jost extralight, mayúsculas, tracking 0.42em y guion
 * café a media altura (decisión de marca final — ver design-propuestas/).
 * En fondos oscuros el guion va en ocre: pasa `dashClassName="bg-[#C98A3B]"`.
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
          'ml-[0.04em] mr-[0.42em] inline-block h-0.5 w-[0.72em] shrink-0 bg-[#6B4A33]',
          dashClassName
        )}
      />
      ser
    </span>
  )
}
