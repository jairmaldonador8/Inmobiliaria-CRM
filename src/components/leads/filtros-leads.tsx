'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

import { ETAPAS_LEAD, FUENTES_LEAD, etiquetaEtapa, etiquetaFuente } from '@/lib/leads/formato'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionAsesor = { userId: string; nombre: string }

type Props = {
  asesores: OpcionAsesor[]
}

const DEBOUNCE_MS = 350

/**
 * Fila de filtros de /admin/leads. Todo vive en searchParams (q, asesor,
 * etapa, fuente): la página servidor re-consulta al cambiar.
 */
export function FiltrosLeads({ asesores }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function actualizarParam(clave: string, valor: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (valor && valor !== 'todas' && valor !== 'todos') params.set(clave, valor)
    else params.delete(clave)
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    })
  }

  function alBuscar(texto: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => actualizarParam('q', texto.trim() || null), DEBOUNCE_MS)
  }

  const asesor = searchParams.get('asesor') ?? 'todos'
  const etapa = searchParams.get('etapa') ?? 'todas'
  const fuente = searchParams.get('fuente') ?? 'todas'

  const itemsAsesor = [
    { value: 'todos', label: 'Todos los asesores' },
    { value: 'bandeja', label: 'Bandeja (sin asignar)' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
  ]
  const itemsEtapa = [
    { value: 'todas', label: 'Todas las etapas' },
    ...ETAPAS_LEAD.map((e) => ({ value: e, label: etiquetaEtapa(e) })),
  ]
  const itemsFuente = [
    { value: 'todas', label: 'Todas las fuentes' },
    ...FUENTES_LEAD.map((f) => ({ value: f, label: etiquetaFuente(f) })),
  ]

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="relative md:max-w-xs md:flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
        />
        <Input
          type="search"
          aria-label="Buscar leads"
          placeholder="Buscar por nombre o teléfono"
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => alBuscar(e.target.value)}
          className="bg-white pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={itemsAsesor}
          value={asesor}
          onValueChange={(v) => actualizarParam('asesor', v as string)}
        >
          <SelectTrigger aria-label="Filtrar por asesor" className="bg-white">
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

        <Select
          items={itemsEtapa}
          value={etapa}
          onValueChange={(v) => actualizarParam('etapa', v as string)}
        >
          <SelectTrigger aria-label="Filtrar por etapa" className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {itemsEtapa.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={itemsFuente}
          value={fuente}
          onValueChange={(v) => actualizarParam('fuente', v as string)}
        >
          <SelectTrigger aria-label="Filtrar por fuente" className="bg-white">
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
    </div>
  )
}
