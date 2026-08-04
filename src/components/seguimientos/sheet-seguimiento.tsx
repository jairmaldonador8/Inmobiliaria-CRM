'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'

import { registrarSeguimiento } from '@/lib/seguimientos/acciones'
import {
  MAX_NOTA_SEGUIMIENTO,
  TIPOS_SEGUIMIENTO,
  etiquetaTipoSeguimiento,
} from '@/lib/seguimientos/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

export type OpcionPropiedadSeguimiento = { id: string; titulo: string }

const MAX_RESULTADOS = 7

type Props = {
  leadId: string
  /**
   * propiedad_id del lead: si existe, el seguimiento la referencia por
   * default (sin combobox); si es null se ofrece un combobox opcional.
   */
  propiedadLeadId: string | null
  propiedades: OpcionPropiedadSeguimiento[]
}

/**
 * Botón «+ Seguimiento» con bottom sheet: tipo, nota y propiedad opcional.
 * Al registrar: toast + refresh (el timeline es server-rendered).
 */
export function SheetSeguimiento({ leadId, propiedadLeadId, propiedades }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const [tipo, setTipo] = useState<string>('llamada')

  // Combobox simple de propiedad (mismo patrón que sheet-captura-rapida).
  const [busquedaPropiedad, setBusquedaPropiedad] = useState('')
  const [propiedadSeleccionada, setPropiedadSeleccionada] =
    useState<OpcionPropiedadSeguimiento | null>(null)

  const resultadosPropiedad = useMemo(() => {
    const termino = busquedaPropiedad.trim().toLowerCase()
    if (!termino) return []
    return propiedades
      .filter((p) => p.titulo.toLowerCase().includes(termino))
      .slice(0, MAX_RESULTADOS)
  }, [busquedaPropiedad, propiedades])

  const itemsTipo = TIPOS_SEGUIMIENTO.map((t) => ({
    value: t,
    label: etiquetaTipoSeguimiento(t),
  }))

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setTipo('llamada')
      setBusquedaPropiedad('')
      setPropiedadSeleccionada(null)
    }
  }

  function alEnviar(formData: FormData) {
    setError(null)
    const nota = String(formData.get('nota') ?? '').trim()

    iniciarTransicion(async () => {
      const resultado = await registrarSeguimiento(leadId, {
        tipo,
        nota,
        propiedadId: propiedadLeadId ?? propiedadSeleccionada?.id ?? null,
      })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success('Seguimiento registrado')
      alCambiarAbierto(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={alCambiarAbierto}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 rounded-xl bg-white text-xs font-medium"
          />
        }
      >
        <Plus aria-hidden className="size-5" />
        Seguimiento
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Registrar seguimiento</SheetTitle>
          <SheetDescription>
            Queda en el historial del lead — no se puede editar después.
          </SheetDescription>
        </SheetHeader>

        <form action={alEnviar} className="grid gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-2">
            <Label htmlFor="seguimiento-tipo">Tipo</Label>
            <Select
              items={itemsTipo}
              value={tipo}
              onValueChange={(v) => setTipo(v as string)}
              disabled={pendiente}
            >
              <SelectTrigger id="seguimiento-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsTipo.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="seguimiento-nota">Nota</Label>
            <Textarea
              id="seguimiento-nota"
              name="nota"
              required
              rows={4}
              maxLength={MAX_NOTA_SEGUIMIENTO}
              placeholder="¿Qué pasó con este lead?"
              disabled={pendiente}
            />
          </div>

          {/* Con propiedad de interés ya definida en el lead, el seguimiento
              la referencia solo — sin pedir nada más. */}
          {propiedadLeadId === null ? (
            <div className="grid gap-2">
              <Label htmlFor="seguimiento-propiedad">Propiedad (opcional)</Label>
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
                    id="seguimiento-propiedad"
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
          ) : null}

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
