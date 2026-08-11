'use client'

import { useTransition } from 'react'
import { Phone } from 'lucide-react'

import { registrarSalidaLlamada } from '@/lib/contactos/acciones'

/**
 * «Llamar» del detalle del lead: antes de soltar el marcador del teléfono
 * deja anotada la llamada en la historia, para que al volver el sistema
 * pueda preguntar cómo le fue (misma mecánica que WhatsApp).
 *
 * El registro NO bloquea la llamada: si el servidor tarda o falla, el
 * marcador se abre igual. Llamar es lo importante; anotar es el favor que
 * el sistema hace después.
 *
 * Ojo con el `href`: se conserva como enlace real (no un botón con JS) para
 * que el «abrir en otra app» del sistema operativo funcione igual que
 * siempre, incluido mantener presionado para copiar el número.
 */
export function BotonLlamar({ leadId, telefono }: { leadId: string; telefono: string }) {
  const [, iniciarTransicion] = useTransition()

  return (
    <a
      href={`tel:+${telefono}`}
      onClick={() => {
        iniciarTransicion(async () => {
          await registrarSalidaLlamada(leadId)
        })
      }}
      className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-input bg-white text-xs font-medium text-slate-900 shadow-xs transition-colors hover:bg-slate-50 active:translate-y-px"
    >
      <Phone aria-hidden className="size-5" />
      Llamar
    </a>
  )
}
