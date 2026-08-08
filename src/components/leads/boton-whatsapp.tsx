'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MessageCircle } from 'lucide-react'

import { rellenarPlantilla, type ContextoPlantilla } from '@/lib/plantillas/rellenar'
import { registrarSalidaWhatsapp } from '@/lib/contactos/acciones'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export type PlantillaWhatsApp = { id: string; nombre: string; texto: string }

type Props = {
  leadId: string
  /** Teléfono normalizado (52XXXXXXXXXX); null desactiva el botón. */
  telefono: string | null
  plantillas: PlantillaWhatsApp[]
  contexto: ContextoPlantilla
}

/**
 * Botón «WhatsApp» del detalle de lead: sheet con las plantillas activas
 * (vista previa YA rellenada con los datos del lead) + opción sin plantilla.
 *
 * Al tocar una opción: abre wa.me DE INMEDIATO (window.open síncrono — los
 * navegadores móviles bloquean popups diferidos) y registra el seguimiento
 * tipo whatsapp en segundo plano (fire-and-forget con toast).
 *
 * No consulta nada: plantillas y contexto llegan por props del servidor.
 */
export function BotonWhatsApp({ leadId, telefono, plantillas, contexto }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  function enviar(plantilla: PlantillaWhatsApp | null) {
    if (!telefono) return

    const texto = plantilla ? rellenarPlantilla(plantilla.texto, contexto) : ''
    const url = texto
      ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/${telefono}`
    window.open(url, '_blank', 'noopener,noreferrer')
    setAbierto(false)

    // Fire-and-forget: WhatsApp ya se abrió; el registro corre detrás.
    void registrarSalidaWhatsapp(leadId, {
      nombrePlantilla: plantilla?.nombre ?? null,
    }).then((resultado) => {
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger
        render={
          <Button
            disabled={!telefono}
            className="h-14 flex-col gap-1 rounded-xl bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700"
          />
        }
      >
        <MessageCircle aria-hidden className="size-5" />
        WhatsApp
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Enviar WhatsApp</SheetTitle>
          <SheetDescription>
            Elige una plantilla — se abre WhatsApp con el mensaje listo.
          </SheetDescription>
        </SheetHeader>

        <ul className="grid gap-2 overflow-y-auto px-4 pb-4">
          {plantillas.map((plantilla) => (
            <li key={plantilla.id}>
              <button
                type="button"
                data-plantilla={plantilla.nombre}
                onClick={() => enviar(plantilla)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-emerald-600/40 hover:bg-emerald-50/50 active:bg-emerald-50"
              >
                <p className="text-sm font-medium text-slate-900">{plantilla.nombre}</p>
                <p data-preview className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">
                  {rellenarPlantilla(plantilla.texto, contexto)}
                </p>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              data-plantilla="sin-plantilla"
              onClick={() => enviar(null)}
              className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left transition-colors hover:bg-slate-50"
            >
              <p className="text-sm font-medium text-slate-700">Sin plantilla</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Abre el chat vacío para escribir libre
              </p>
            </button>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  )
}
