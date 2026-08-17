'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Recorrido del dedo (px) para armar el refresco. */
const RECORRIDO_PX = 90
/** Auto-refresh de datos mientras la pestaña está visible. */
const AUTO_REFRESH_MS = 60_000
/** No refrescar dos veces en menos de esto (gesto + focus + timer se pisan). */
const MIN_ENTRE_REFRESH_MS = 15_000

/**
 * Mantiene la app siempre al día (pedido de Renata + Jair, Live test
 * 2026-08-17), por tres vías:
 *
 *  1. Pull-to-refresh: jalar hacia abajo desde el tope de la página
 *     refresca los datos (la PWA instalada no tiene botón de recargar).
 *  2. Auto-refresh: cada minuto, mientras la pestaña esté visible.
 *  3. Al volver a la app (focus / pestaña visible de nuevo).
 *
 * Todo vía router.refresh(): re-consulta los Server Components sin recargar
 * la app ni perder el estado de la página. El gesto solo arma con la página
 * hasta arriba (scrollY 0) para no pelearse con el scroll normal.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [progreso, setProgreso] = useState(0) // 0..1 respecto al recorrido
  const [refrescando, setRefrescando] = useState(false)
  const inicioY = useRef<number | null>(null)
  const progresoRef = useRef(0)
  const ultimoRefresh = useRef(0)

  useEffect(() => {
    function refrescar(forzado: boolean) {
      const ahora = Date.now()
      if (!forzado && ahora - ultimoRefresh.current < MIN_ENTRE_REFRESH_MS) return
      ultimoRefresh.current = ahora
      setRefrescando(true)
      router.refresh()
      // router.refresh() no expone promesa: el giro se apaga solo.
      window.setTimeout(() => setRefrescando(false), 1200)
    }

    // --- Gesto táctil ------------------------------------------------------
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
      const p = Math.min(delta / RECORRIDO_PX, 1.15)
      progresoRef.current = p
      setProgreso(p)
    }

    function alSoltar() {
      if (inicioY.current === null) return
      inicioY.current = null
      if (progresoRef.current >= 1) refrescar(true)
      progresoRef.current = 0
      setProgreso(0)
    }

    // --- Siempre actualizado: timer + volver a la app ----------------------
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refrescar(false)
    }, AUTO_REFRESH_MS)

    function alVolver() {
      if (document.visibilityState === 'visible') refrescar(false)
    }

    window.addEventListener('touchstart', alTocar, { passive: true })
    window.addEventListener('touchmove', alMover, { passive: true })
    window.addEventListener('touchend', alSoltar, { passive: true })
    window.addEventListener('touchcancel', alSoltar, { passive: true })
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('touchstart', alTocar)
      window.removeEventListener('touchmove', alMover)
      window.removeEventListener('touchend', alSoltar)
      window.removeEventListener('touchcancel', alSoltar)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [router])

  const visible = refrescando || progreso > 0.03
  const armado = progreso >= 1

  return (
    <div
      role="status"
      aria-label={refrescando ? 'Actualizando' : undefined}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center transition-opacity duration-150',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        transform: `translateY(${refrescando ? 20 : Math.min(progreso, 1) * 34 - 6}px)`,
      }}
    >
      <span
        className={cn(
          'mt-2 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 shadow-lg ring-1 ring-slate-200 transition-colors dark:bg-slate-900 dark:ring-slate-700',
          armado && !refrescando && 'ring-slate-400 dark:ring-slate-500'
        )}
      >
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
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {refrescando ? 'Actualizando…' : armado ? 'Suelta para actualizar' : 'Jala para actualizar'}
        </span>
      </span>
    </div>
  )
}
