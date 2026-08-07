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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionPropiedad = { id: string; titulo: string }

const MAX_RESULTADOS = 7

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
            // bottom-20 (móvil): encima de la barra de pestañas (h-16).
            // lg:bottom-24 (escritorio, sin barra de pestañas): encima de
            // BotonSugerencia (lg:bottom-6, ver layout del asesor) — mismo
            // apilado que ya usa banner-instalacion.tsx para este mismo FAB.
            className="fixed right-4 bottom-20 z-40 h-12 rounded-full px-5 shadow-lg lg:bottom-24"
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
            <Input id="captura-nombre" name="nombre" required disabled={pendiente} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="captura-telefono">Teléfono</Label>
            <Input
              id="captura-telefono"
              name="telefono"
              type="tel"
              inputMode="tel"
              placeholder="10 dígitos"
              required
              disabled={pendiente}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="captura-fuente">Fuente</Label>
            <Select
              items={itemsFuente}
              value={fuente}
              onValueChange={(v) => setFuente(v as string)}
              disabled={pendiente}
            >
              <SelectTrigger id="captura-fuente" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsFuente.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="captura-propiedad">Propiedad de interés (opcional)</Label>
            {propiedadSeleccionada ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-input bg-slate-50 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 truncate">{propiedadSeleccionada.titulo}</span>
                <button
                  type="button"
                  aria-label="Quitar propiedad"
                  onClick={() => setPropiedadSeleccionada(null)}
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="captura-propiedad"
                  type="search"
                  placeholder="Buscar por título…"
                  value={busquedaPropiedad}
                  onChange={(e) => setBusquedaPropiedad(e.target.value)}
                  disabled={pendiente}
                  autoComplete="off"
                />
                {resultadosPropiedad.length > 0 ? (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                    {resultadosPropiedad.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPropiedadSeleccionada(p)
                            setBusquedaPropiedad('')
                          }}
                          className="w-full truncate px-2.5 py-1.5 text-left hover:bg-slate-100"
                        >
                          {p.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : busquedaPropiedad.trim() ? (
                  <p className="text-xs text-slate-500">Sin propiedades con ese título</p>
                ) : null}
              </>
            )}
          </div>

          {/* El correo casi nunca se tiene a la mano en captura rápida:
              escondido tras un link para dejar el formulario en 3 campos. */}
          {mostrarEmail ? (
            <div className="grid gap-2">
              <Label htmlFor="captura-email">Correo</Label>
              <Input id="captura-email" name="email" type="email" disabled={pendiente} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarEmail(true)}
              className="justify-self-start text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
            >
              + agregar correo
            </button>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <SheetFooter className="p-0 pt-1">
            <Button type="submit" size="lg" disabled={pendiente} className="w-full">
              {pendiente ? 'Registrando…' : 'Registrar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
