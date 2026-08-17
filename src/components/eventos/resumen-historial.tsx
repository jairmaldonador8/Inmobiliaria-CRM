import { Home, Mail, MessageCircle, NotebookPen, Phone } from 'lucide-react'

import type { EventoTimeline } from '@/lib/eventos/consultas'
import { resumirHistoria } from '@/lib/eventos/resumen'

/**
 * Chips con el resumen del historial de contacto: «3 llamadas · 5 WhatsApp
 * · 1 visita…». Va arriba del timeline para que el detalle vertical se lea
 * DESPUÉS de la foto general. Sin interacciones no pinta nada.
 */
export function ResumenHistorial({ historia }: { historia: EventoTimeline[] }) {
  const resumen = resumirHistoria(historia)
  if (resumen.total === 0) return null

  const chips = [
    { Icono: Phone, valor: resumen.llamadas, singular: 'llamada', plural: 'llamadas' },
    { Icono: MessageCircle, valor: resumen.whatsapps, singular: 'WhatsApp', plural: 'WhatsApp' },
    { Icono: Home, valor: resumen.visitas, singular: 'visita', plural: 'visitas' },
    { Icono: Mail, valor: resumen.correos, singular: 'correo', plural: 'correos' },
    { Icono: NotebookPen, valor: resumen.notas, singular: 'nota', plural: 'notas' },
  ].filter((chip) => chip.valor > 0)

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(({ Icono, valor, singular, plural }) => (
        <span
          key={singular}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200"
        >
          <Icono aria-hidden className="size-3.5 text-slate-400" />
          <span className="font-semibold text-slate-900">{valor}</span>
          {valor === 1 ? singular : plural}
        </span>
      ))}
    </div>
  )
}
