/**
 * Tarjeta de "cristal" del kit Fintech Muro. Por defecto FINGE el glass con
 * tinte + borde + sombra cálida (0 costo de GPU) — el blur real solo se
 * activa con `conBlur`, y solo debe usarse en 1-3 elementos por pantalla
 * (tab bar / hero), nunca en cada tarjeta (ver skill fintech-muro-ui).
 */
import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const tarjetaGlassVariants = cva('border border-white/80 bg-[#FAF7F1]/65', {
  variants: {
    variant: {
      default: 'rounded-2xl shadow-glass-sm p-3',
      hero: 'rounded-hero shadow-glass p-4',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface TarjetaGlassProps
  extends ComponentProps<'div'>,
    VariantProps<typeof tarjetaGlassVariants> {
  /** Activa blur real (backdrop-blur-glass + isolate). Úsalo con moderación. */
  conBlur?: boolean
}

export default function TarjetaGlass({
  className,
  variant,
  conBlur,
  ...props
}: TarjetaGlassProps) {
  return (
    <div
      className={cn(
        tarjetaGlassVariants({ variant }),
        conBlur && 'backdrop-blur-glass isolate [-webkit-backdrop-filter:blur(12px)]',
        className
      )}
      {...props}
    />
  )
}
