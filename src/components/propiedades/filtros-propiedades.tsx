'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

import { etiquetaEstatus } from '@/lib/propiedades/formato'
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
  /** Valores de estatus realmente presentes en el inventario. */
  estatusDisponibles: string[]
  asesores: OpcionAsesor[]
}

const DEBOUNCE_MS = 350

/**
 * Fila de filtros de /admin/propiedades. Todo vive en searchParams (q,
 * operacion, estatus, asesor): la página servidor re-consulta al cambiar.
 */
export function FiltrosPropiedades({ estatusDisponibles, asesores }: Props) {
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

  const operacion = searchParams.get('operacion') ?? 'todas'
  const estatus = searchParams.get('estatus') ?? 'todos'
  const asesor = searchParams.get('asesor') ?? 'todos'

  const itemsOperacion = [
    { value: 'todas', label: 'Venta y renta' },
    { value: 'sale', label: 'Venta' },
    { value: 'rental', label: 'Renta' },
  ]
  const itemsEstatus = [
    { value: 'todos', label: 'Todos los estatus' },
    ...estatusDisponibles.map((e) => ({ value: e, label: etiquetaEstatus(e) })),
  ]
  const itemsAsesor = [
    { value: 'todos', label: 'Todos los asesores' },
    { value: 'sin', label: 'Sin responsable' },
    ...asesores.map((a) => ({ value: a.userId, label: a.nombre })),
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
          aria-label="Buscar propiedades"
          placeholder="Buscar por título o ubicación"
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => alBuscar(e.target.value)}
          className="bg-white pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={itemsOperacion}
          value={operacion}
          onValueChange={(v) => actualizarParam('operacion', v as string)}
        >
          <SelectTrigger aria-label="Filtrar por operación" className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {itemsOperacion.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={itemsEstatus}
          value={estatus}
          onValueChange={(v) => actualizarParam('estatus', v as string)}
        >
          <SelectTrigger aria-label="Filtrar por estatus" className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {itemsEstatus.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
      </div>
    </div>
  )
}
