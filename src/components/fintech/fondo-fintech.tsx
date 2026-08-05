/**
 * Fondo estático de las vistas «Fintech Muro»: gradiente hueso→durazno→ámbar
 * más dos orbes radiales decorativos (sin animar — el blur real se reserva
 * para tab bar / hero, ver skill fintech-muro-ui). Los orbes son
 * `aria-hidden` porque son puro decorado sin significado semántico.
 */
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface FondoFintechProps {
  children: ReactNode
  className?: string
}

const GRADIENTE_MURO = 'linear-gradient(150deg,#F5F1E8 0%,#F3DCC2 32%,#EBBF9A 62%,#DFA987 100%)'

export default function FondoFintech({ children, className }: FondoFintechProps) {
  return (
    <div
      className={cn('relative min-h-dvh overflow-hidden', className)}
      style={{ background: GRADIENTE_MURO }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-5 -right-8 size-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(201,138,59,.38), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-9 top-8 size-36 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(163,78,40,.22), transparent 70%)' }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
