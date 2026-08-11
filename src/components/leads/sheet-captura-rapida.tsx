'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'

import { capturarLeadAsesor } from '@/lib/leads/acciones-asesor'
import { FUENTES_LEAD, etiquetaFuente } from '@/lib/leads/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type OpcionPropiedad = { id: string; titulo: string }

const MAX_RESULTADOS = 7

/**
 * Alto de los campos de esta hoja. El `Input` base mide `h-8` (32px), pensado
 * para el ratón; en el teléfono queda por debajo de los 44px que recomienda
 * Apple para un objetivo táctil y se fallaba el toque capturando de pie. En
 * escritorio vuelve a un alto normal, que ahí 48px se ven desproporcionados.
 */
const ALTO_CAMPO = 'h-12 lg:h-9'

/**
 * Botón flotante «+ Registrar lead» con bottom sheet de captura rápida
 * (asesor, móvil primero): 3 campos a la vista — nombre, teléfono, fuente —
 * más propiedad y correo opcionales. El lead queda asignado al asesor y
 * aparece en la columna «Nuevo» del kanban.
 */
export function SheetCapturaRapida({ propiedades }: { propiedades: OpcionPropiedad[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const [fuente, setFuente] = useState<string>('whatsapp')
  const [mostrarEmail, setMostrarEmail] = useState(false)
  // La propiedad casi nunca se llena en captura rápida (el asesor está
  // apuntando un nombre y un teléfono antes de que se le olviden), así que
  // arranca escondida detrás de un botón, igual que el correo.
  const [mostrarPropiedad, setMostrarPropiedad] = useState(false)

  // Combobox simple de propiedad (mismo patrón que dialog-registrar-lead).
  const [busquedaPropiedad, setBusquedaPropiedad] = useState('')
  const [propiedadSeleccionada, setPropiedadSeleccionada] = useState<OpcionPropiedad | null>(null)

  const resultadosPropiedad = useMemo(() => {
    const termino = busquedaPropiedad.trim().toLowerCase()
    if (!termino) return []
    return propiedades
      .filter((p) => p.titulo.toLowerCase().includes(termino))
      .slice(0, MAX_RESULTADOS)
  }, [busquedaPropiedad, propiedades])

  const itemsFuente = FUENTES_LEAD.map((f) => ({ value: f, label: etiquetaFuente(f) }))

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setFuente('whatsapp')
      setMostrarEmail(false)
      setMostrarPropiedad(false)
      setBusquedaPropiedad('')
      setPropiedadSeleccionada(null)
    }
  }

  function alEnviar(formData: FormData) {
    setError(null)

    const nombre = String(formData.get('nombre') ?? '').trim()
    const telefono = String(formData.get('telefono') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()

    iniciarTransicion(async () => {
      const resultado = await capturarLeadAsesor({
        nombre,
        telefono,
        email: email || null,
        fuente,
        propiedadId: propiedadSeleccionada?.id ?? null,
      })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success(`Lead "${nombre}" registrado`)
      alCambiarAbierto(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={alCambiarAbierto}>
      <SheetTrigger
        render={
          <Button
            size="lg"
            /*
              Se ancla a `--alto-nav` (el alto REAL de la barra de pestañas,
              que cada layout publica) más un respiro de 0.75rem. Antes era
              `bottom-20`, un 80px fijo: en un iPhone con barra de gestos la
              nav crece ~34px y se comía 19px del botón — medido: botón
              716-764, nav desde 745. Se veía atrapado debajo de las
              pestañas y costaba tocarlo.

              `ring`: el botón flota sobre la lista de leads y, siendo negro
              sobre tarjetas claras, sin un borde se confundía con el fondo
              al pasar por encima de una tarjeta.

              lg:bottom-24 (escritorio, sin barra de pestañas): encima de
              BotonSugerencia (lg:bottom-6, ver layout del asesor).
            */
            className="fixed right-4 bottom-[calc(var(--alto-nav,4rem)+0.75rem)] z-40 h-12 rounded-full px-5 shadow-lg ring-4 ring-slate-50/80 lg:bottom-24 lg:ring-0"
          />
        }
      >
        <Plus data-icon="inline-start" />
        Registrar lead
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Registrar lead</SheetTitle>
          <SheetDescription>Captura rápida: queda asignado a ti, en «Nuevo».</SheetDescription>
        </SheetHeader>

        <form action={alEnviar} className="grid gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-2">
            <Label htmlFor="captura-nombre">Nombre</Label>
            <Input id="captura-nombre" name="nombre" required disabled={pendiente} className={ALTO_CAMPO} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="captura-telefono">Teléfono</Label>
            {/* `inputMode="tel"` abre el teclado numérico del teléfono
                directo, sin pasar por el de letras. */}
            <Input
              id="captura-telefono"
              name="telefono"
              type="tel"
              inputMode="tel"
              placeholder="10 dígitos"
              required
              disabled={pendiente}
              className={ALTO_CAMPO}
            />
          </div>

          {/*
            Fuente como chips, no como desplegable: son seis opciones fijas y
            cortas, así que caben a la vista. El desplegable costaba dos
            toques (abrir, elegir) y montaba un menú encima del formulario;
            así es un solo toque y nunca se tapa lo que ya escribiste.
          */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">¿De dónde llegó?</legend>
            <div className="flex flex-wrap gap-2">
              {itemsFuente.map((item) => {
                const activa = fuente === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={activa}
                    disabled={pendiente}
                    onClick={() => setFuente(item.value)}
                    className={cn(
                      // min-h-11: objetivo táctil de 44px, el mínimo cómodo.
                      'min-h-11 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-50',
                      activa
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {propiedadSeleccionada ? (
            <div className="grid gap-2">
              <Label>Propiedad de interés</Label>
              <div className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-input bg-slate-50 px-3 text-sm lg:min-h-9">
                <span className="min-w-0 truncate">{propiedadSeleccionada.titulo}</span>
                <button
                  type="button"
                  aria-label="Quitar propiedad"
                  onClick={() => {
                    setPropiedadSeleccionada(null)
                    setMostrarPropiedad(false)
                  }}
                  className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : mostrarPropiedad ? (
            <div className="grid gap-2">
              <Label htmlFor="captura-propiedad">Propiedad de interés (opcional)</Label>
              <Input
                id="captura-propiedad"
                type="search"
                placeholder="Buscar por título…"
                value={busquedaPropiedad}
                onChange={(e) => setBusquedaPropiedad(e.target.value)}
                disabled={pendiente}
                autoComplete="off"
                autoFocus
                className={ALTO_CAMPO}
              />
              {resultadosPropiedad.length > 0 ? (
                <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                  {resultadosPropiedad.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPropiedadSeleccionada(p)
                          setBusquedaPropiedad('')
                        }}
                        className="min-h-11 w-full truncate px-3 text-left hover:bg-slate-100 lg:min-h-9"
                      >
                        {p.titulo}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : busquedaPropiedad.trim() ? (
                <p className="text-xs text-slate-500">Sin propiedades con ese título</p>
              ) : null}
            </div>
          ) : null}

          {/*
            Propiedad y correo, escondidos tras botones: en captura rápida lo
            que urge es el nombre y el teléfono antes de que se olviden. Dejan
            el formulario en dos campos más los chips, y siguen a un toque.
          */}
          {!mostrarPropiedad && !propiedadSeleccionada ? (
            <button
              type="button"
              onClick={() => setMostrarPropiedad(true)}
              className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              + Propiedad de interés
            </button>
          ) : null}

          {mostrarEmail ? (
            <div className="grid gap-2">
              <Label htmlFor="captura-email">Correo</Label>
              <Input
                id="captura-email"
                name="email"
                type="email"
                inputMode="email"
                disabled={pendiente}
                autoFocus
                className={ALTO_CAMPO}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarEmail(true)}
              className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              + Correo
            </button>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <SheetFooter className="p-0 pt-1">
            <Button type="submit" size="lg" disabled={pendiente} className="h-12 w-full lg:h-10">
              {pendiente ? 'Registrando…' : 'Registrar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
