/**
 * Tarjeta oscura ("de tinta café") del kit Fintech Muro, usada para
 * destacar el dato más importante de la pantalla (p. ej. cierres del mes).
 * El CTA es opcional: si trae `href` se renderiza como enlace de Next.js.
 * Acepta `className` (fusionada con `cn()`) y reenvía el resto de props
 * estándar de `<div>`, igual que TarjetaGlass / FondoFintech.
 */
import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

interface CtaTinta {
  texto: string
  href: string
}

interface TarjetaTintaProps extends Omit<ComponentProps<'div'>, 'children'> {
  etiqueta: string
  children: ReactNode
  cta?: CtaTinta
}

export default function TarjetaTinta({
  etiqueta,
  children,
  cta,
  className,
  ...props
}: TarjetaTintaProps) {
  return (
    <div className={cn('rounded-2xl bg-[#141414]/95 p-4 text-[#F2F0EA]', className)} {...props}>
      <div className="text-[11px] uppercase tracking-wide text-[#A5A29A]">{etiqueta}</div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">{children}</div>
        {cta && (
          <Link
            href={cta.href}
            className="rounded-full bg-[#F2F0EA] px-3 py-1.5 text-xs font-bold text-[#141414]"
          >
            {cta.texto}
          </Link>
        )}
      </div>
    </div>
  )
}
