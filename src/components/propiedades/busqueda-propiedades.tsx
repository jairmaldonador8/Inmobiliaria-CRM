'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

const DEBOUNCE_MS = 350

/**
 * Buscador simple por searchParams (?q=) — vista asesor. Debounce corto para
 * no re-consultar en cada tecla.
 */
export function BusquedaPropiedades({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  function alBuscar(texto: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      const q = texto.trim()
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false })
    }, DEBOUNCE_MS)
  }

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
      />
      <Input
        type="search"
        aria-label="Buscar propiedades"
        placeholder={placeholder}
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => alBuscar(e.target.value)}
        className="h-10 rounded-xl bg-white pl-9"
      />
    </div>
  )
}
