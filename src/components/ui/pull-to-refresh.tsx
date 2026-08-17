'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Cuántos px hay que jalar hacia abajo para disparar el refresco. */
const UMBRAL_PX = 70

/**
 * Pull-to-refresh para la PWA (pedido de Renata, Live test 2026-08-17):
 * instalada en el teléfono no hay botón de recargar, así que jalar hacia
 * abajo desde el tope de la página refresca los datos del servidor
 * (router.refresh() re-consulta los Server Components sin recargar la app).
 *
 * Solo escucha gestos táctiles: en escritorio no hace nada. El gesto solo
 * arma cuando la página está hasta arriba (scrollY 0), para no pelearse con
 * el scroll normal.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [progreso, setProgreso] = useState(0) // 0..1 respecto al umbral
  const [refrescando, setRefrescando] = useState(false)
  const inicioY = useRef<number | null>(null)
  const progresoRef = useRef(0)

  useEffect(() => {
    function alTocar(e: TouchEvent) {
      inicioY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }

    function alMover(e: TouchEvent) {
      if (inicioY.current === null) return
      const delta = e.touches[0].clientY - inicioY.current
      if (delta <= 0 || window.scrollY > 0) {
        progresoRef.current = 0
        setProgreso(0)
        return
      }
      // Resistencia: el indicador avanza a media velocidad del dedo.
      const p = Math.min(delta / (UMBRAL_PX * 2), 1.15)
      progresoRef.current = p
      setProgreso(p)
    }

    function alSoltar() {
      if (inicioY.current === null) return
      inicioY.current = null
      if (progresoRef.current >= 1) {
        setRefrescando(true)
        router.refresh()
        // router.refresh() no expone promesa: el giro se apaga solo.
        window.setTimeout(() => setRefrescando(false), 1200)
      }
      progresoRef.current = 0
      setProgreso(0)
    }

    window.addEventListener('touchstart', alTocar, { passive: true })
    window.addEventListener('touchmove', alMover, { passive: true })
    window.addEventListener('touchend', alSoltar, { passive: true })
    window.addEventListener('touchcancel', alSoltar, { passive: true })
    return () => {
      window.removeEventListener('touchstart', alTocar)
      window.removeEventListener('touchmove', alMover)
      window.removeEventListener('touchend', alSoltar)
      window.removeEventListener('touchcancel', alSoltar)
    }
  }, [router])

  const visible = refrescando || progreso > 0.05

  return (
    <div
      aria-hidden={!refrescando}
      role="status"
      aria-label="Actualizando"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center transition-opacity duration-150 lg:hidden',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        transform: `translateY(${refrescando ? 16 : Math.min(progreso, 1) * 24 - 8}px)`,
      }}
    >
      <span className="mt-2 flex size-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <RefreshCw
          aria-hidden
          className={cn(
            'size-4 text-slate-600 dark:text-slate-300',
            refrescando && 'animate-spin'
          )}
          style={
            refrescando ? undefined : { transform: `rotate(${Math.min(progreso, 1) * 270}deg)` }
          }
        />
      </span>
    </div>
  )
}
