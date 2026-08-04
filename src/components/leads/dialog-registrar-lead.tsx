'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'

import { capturarLead } from '@/lib/leads/acciones'
import { FUENTES_LEAD, etiquetaFuente } from '@/lib/leads/formato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionAsesor = { userId: string; nombre: string }
export type OpcionPropiedad = { id: string; titulo: string }

type Props = {
  asesores: OpcionAsesor[]
  propiedades: OpcionPropiedad[]
}

const BANDEJA = 'bandeja'
const MAX_RESULTADOS = 7

/** Botón «Registrar lead» con el dialog de captura manual (solo admin). */
export function DialogRegistrarLead({ asesores, propiedades }: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const [fuente, setFuente] = useState<string>('walk_in')
  const [asesorId, setAsesorId] = useState<string>(BANDEJA)

  // Combobox simple de propiedad: input de búsqueda + lista filtrada.
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
  const itemsAsesor = [
    { value: BANDEJA, label: 'Dejar en bandeja' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
  ]

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setFuente('walk_in')
      setAsesorId(BANDEJA)
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
      const resultado = await capturarLead({
        nombre,
        telefono,
        email: email || null,
        fuente,
        propiedadId: propiedadSeleccionada?.id ?? null,
        asesorId: asesorId === BANDEJA ? null : asesorId,
      })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      toast.success(
        asesorId === BANDEJA
          ? `Lead "${nombre}" registrado en la bandeja`
          : `Lead "${nombre}" registrado y asignado`
      )
      alCambiarAbierto(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogTrigger
        render={
          <Button>
            <Plus data-icon="inline-start" />
            Registrar lead
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar lead</DialogTitle>
          <DialogDescription>
            Captura manual de un prospecto (walk-in, llamada, referido…).
          </DialogDescription>
        </DialogHeader>

        <form action={alEnviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="lead-nombre">Nombre</Label>
            <Input id="lead-nombre" name="nombre" required disabled={pendiente} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-telefono">Teléfono</Label>
            <Input
              id="lead-telefono"
              name="telefono"
              type="tel"
              placeholder="10 dígitos"
              required
              disabled={pendiente}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-email">Correo (opcional)</Label>
            <Input id="lead-email" name="email" type="email" disabled={pendiente} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-fuente">Fuente</Label>
            <Select
              items={itemsFuente}
              value={fuente}
              onValueChange={(v) => setFuente(v as string)}
              disabled={pendiente}
            >
              <SelectTrigger id="lead-fuente" className="w-full">
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
            <Label htmlFor="lead-propiedad">Propiedad de interés (opcional)</Label>
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
                  id="lead-propiedad"
                  type="search"
                  placeholder="Buscar por título…"
                  value={busquedaPropiedad}
                  onChange={(e) => setBusquedaPropiedad(e.target.value)}
                  disabled={pendiente}
                  autoComplete="off"
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

          <div className="grid gap-2">
            <Label htmlFor="lead-asesor">Asesor</Label>
            <Select
              items={itemsAsesor}
              value={asesorId}
              onValueChange={(v) => setAsesorId(v as string)}
              disabled={pendiente}
            >
              <SelectTrigger id="lead-asesor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsAsesor.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
