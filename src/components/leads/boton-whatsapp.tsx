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
 * Al tocar una opción abre WhatsApp DE INMEDIATO, de forma síncrona dentro
 * del gesto del usuario (los navegadores móviles bloquean los popups
 * diferidos), y en segundo plano llama a `registrarSalidaWhatsapp`, que
 * escribe el seguimiento del timeline, abre un «contacto» con desenlace
 * pendiente y avanza la etapa del lead a «Contactado».
 *
 * En móvil se usa el esquema nativo `whatsapp://` y en escritorio wa.me —
 * ver `esMovil()` abajo.
 *
 * Sin toast de éxito a propósito: la confirmación ya se ve en la ficha (la
 * etapa cambia y aparece el aviso de pendiente). El toast de error dice que
 * no se registró la nota — NUNCA que falló el WhatsApp, que ya se abrió.
 *
 * No consulta nada: plantillas y contexto llegan por props del servidor.
 */
/**
 * ¿Estamos en un teléfono o tableta? Decide entre el esquema nativo
 * `whatsapp://` (móvil) y wa.me (escritorio). Se lee el user agent en vez de
 * `matchMedia` a propósito: lo que importa no es el ancho de la ventana sino
 * si el sistema puede resolver el esquema de la app.
 */
function esMovil(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function BotonWhatsApp({ leadId, telefono, plantillas, contexto }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  function enviar(plantilla: PlantillaWhatsApp | null) {
    if (!telefono) return

    const texto = plantilla ? rellenarPlantilla(plantilla.texto, contexto) : ''

    // El registro se dispara ANTES de navegar. En móvil, saltar al esquema
    // `whatsapp://` manda la página a segundo plano de inmediato y puede
    // abortar una petición recién iniciada; arrancarla antes le da margen.
    // NO se hace await: seguimos dentro del gesto del usuario, así que el
    // popup de escritorio no se bloquea.
    void registrarSalidaWhatsapp(leadId, {
      nombrePlantilla: plantilla?.nombre ?? null,
    }).then((resultado) => {
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      router.refresh()
    })

    if (esMovil()) {
      // Esquema nativo: entra DIRECTO a la app. Con wa.me el teléfono abre
      // primero una pestaña del navegador que luego redirige a WhatsApp, y
      // ese salto se ve — era la queja del asesor.
      // `encodeURIComponent` y NO `URLSearchParams`: este último codifica los
      // espacios como `+` (convención de formularios), y un cliente que reciba
      // el esquema custom puede tomarlos literales — el asesor vería
      // «Hola+Marisol+...» en la caja del mensaje. `%20` es inequívoco, y es
      // además lo que ya usa la rama de escritorio.
      const consulta = texto
        ? `phone=${telefono}&text=${encodeURIComponent(texto)}`
        : `phone=${telefono}`
      // `assign()` y no `location.href = …`: hace lo mismo, pero la regla
      // react-hooks/immutability prohíbe asignar a un valor externo.
      window.location.assign(`whatsapp://send?${consulta}`)
    } else {
      // Escritorio: `whatsapp://` solo funciona con WhatsApp Desktop
      // instalado; wa.me cae con gracia en WhatsApp Web.
      const url = texto
        ? `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`
        : `https://wa.me/${telefono}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    setAbierto(false)
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
