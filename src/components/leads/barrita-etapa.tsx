'use client'

import { useEffect, useRef, useState } from 'react'

import { ETAPAS_KANBAN, etiquetaEtapa } from '@/lib/leads/formato'
import { cn } from '@/lib/utils'

/**
 * La barrita de vida del lead (ronda 2, variante «semáforo» aprobada por
 * Jair): cinco segmentos —uno por etapa activa del pipeline— que se van
 * «calentando» hacia el verde conforme el lead avanza, con Klo caminando
 * parado sobre la etapa actual. Al avanzar de etapa, Klo camina hasta el
 * siguiente segmento y suelta su burbuja «Klo-ser to your dreams» unos
 * segundos («¡Klo-ser than ever!» si cerró ganado).
 *
 * Cerrado ganado: la barra entera se pinta verde. Cerrado perdido: se apaga.
 */

// Semáforo de avance (mockup design-propuestas/ronda-2-lead-ui.html): frío al
// inicio, amarillos en medio, verde en negociación. Hex fijos a propósito —
// son color de marca del estado, legibles en tema claro y oscuro.
const COLORES_SEMAFORO = ['#94a3b8', '#fbbf24', '#f59e0b', '#a3c34d', '#10b981'] as const
const VERDE_GANADO = '#10b981'

const MS_BURBUJA = 4000

type Progreso =
  | { tipo: 'activo'; indice: number }
  | { tipo: 'ganado' }
  | { tipo: 'perdido' }

function progresoDeEtapa(etapa: string): Progreso {
  if (etapa === 'cerrado_ganado') return { tipo: 'ganado' }
  if (etapa === 'cerrado_perdido') return { tipo: 'perdido' }
  // 'apartado' quedó fusionado con negociación (migración 0012).
  if (etapa === 'apartado') return { tipo: 'activo', indice: ETAPAS_KANBAN.length - 1 }
  const indice = (ETAPAS_KANBAN as readonly string[]).indexOf(etapa)
  return { tipo: 'activo', indice: indice === -1 ? 0 : indice }
}

export function BarritaEtapa({ etapa }: { etapa: string }) {
  const progreso = progresoDeEtapa(etapa)
  const total = ETAPAS_KANBAN.length
  const indiceKlo = progreso.tipo === 'activo' ? progreso.indice : total - 1

  // La burbuja solo aparece AL AVANZAR (decisión de Jair): se compara la
  // etapa contra la del render anterior; el primer render no la muestra.
  const [burbuja, setBurbuja] = useState<string | null>(null)
  const etapaPrevia = useRef(etapa)
  useEffect(() => {
    if (etapaPrevia.current === etapa) return
    etapaPrevia.current = etapa
    setBurbuja(etapa === 'cerrado_ganado' ? '¡Klo-ser than ever!' : 'Klo-ser to your dreams')
    const temporizador = setTimeout(() => setBurbuja(null), MS_BURBUJA)
    return () => clearTimeout(temporizador)
  }, [etapa])

  const centroKlo = `${((indiceKlo * 2 + 1) / (total * 2)) * 100}%`

  return (
    <div aria-label={`Etapa del lead: ${etiquetaEtapa(etapa)}`} className="flex flex-col gap-1.5">
      {/* La pista de Klo: el gallito camina (webp animado del splash) parado
          sobre el segmento de la etapa actual; `left` transiciona para que
          se vea caminar al avanzar. Oculto si el lead se perdió — nadie
          quiere al gallito festejando sobre una barra apagada. */}
      <div className="relative h-9" aria-hidden>
        {progreso.tipo !== 'perdido' ? (
          <>
            {burbuja ? (
              <span
                className="absolute bottom-7 -translate-x-[105%] rounded-full bg-slate-900 px-2.5 py-1 text-[0.625rem] font-medium whitespace-nowrap text-white"
                style={{ left: centroKlo }}
              >
                {burbuja}
              </span>
            ) : null}
            {/* gallo-camina.webp es una TIRA de 12 cuadros (2400×200), la
                misma del splash: se anima con steps() sobre background-
                position (ver .gallo-barrita en globals.css), no con <img>.
                En tema oscuro el gallo negro se invierte a blanco. */}
            <span
              aria-hidden
              className="gallo-barrita absolute -bottom-1 size-9 -translate-x-1/2 motion-safe:transition-[left] motion-safe:duration-700 dark:invert"
              style={{ left: centroKlo }}
            />
          </>
        ) : null}
      </div>

      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => {
          const color =
            progreso.tipo === 'ganado'
              ? VERDE_GANADO
              : progreso.tipo === 'activo' && i <= progreso.indice
                ? COLORES_SEMAFORO[i]
                : null
          const actual = progreso.tipo === 'activo' && i === progreso.indice
          return (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full bg-slate-200 transition-colors',
                actual && 'ring-2 ring-slate-900/10'
              )}
              style={color ? { backgroundColor: color } : undefined}
            />
          )
        })}
      </div>

      <div className="flex items-baseline justify-between">
        <span
          className="text-xs font-semibold"
          style={{
            color:
              progreso.tipo === 'perdido'
                ? undefined
                : progreso.tipo === 'ganado'
                  ? VERDE_GANADO
                  : COLORES_SEMAFORO[indiceKlo],
          }}
        >
          {etiquetaEtapa(etapa)}
        </span>
        <span className="text-[0.6875rem] text-slate-400">
          {progreso.tipo === 'activo' ? `etapa ${progreso.indice + 1} de ${total}` : ''}
        </span>
      </div>
    </div>
  )
}
