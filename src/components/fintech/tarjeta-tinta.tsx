/**
 * Tarjeta oscura ("de tinta café") del kit Fintech Muro, usada para
 * destacar el dato más importante de la pantalla (p. ej. cierres del mes).
 * El CTA es opcional: si trae `href` se renderiza como enlace de Next.js.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'

interface CtaTinta {
  texto: string
  href: string
}

interface TarjetaTintaProps {
  etiqueta: string
  children: ReactNode
  cta?: CtaTinta
}

export default function TarjetaTinta({ etiqueta, children, cta }: TarjetaTintaProps) {
  return (
    <div className="rounded-2xl bg-[#221B14]/90 p-4 text-[#F2EDE4]">
      <div className="text-[11px] uppercase tracking-wide text-[#C9B896]">{etiqueta}</div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">{children}</div>
        {cta && (
          <Link
            href={cta.href}
            className="rounded-full bg-[#C98A3B] px-3 py-1.5 text-xs font-bold text-[#221B14]"
          >
            {cta.texto}
          </Link>
        )}
      </div>
    </div>
  )
}
