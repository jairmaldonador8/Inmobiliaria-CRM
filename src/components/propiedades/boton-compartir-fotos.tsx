'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Images } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Tope de fotos por envío: WhatsApp acepta más, pero 6 mantienen el share
 *  rápido en datos móviles (cada una pesa cientos de KB). */
const MAX_FOTOS = 6

/**
 * «Mandar fotos» (ronda 2, pedido de Renata): comparte las fotos REALES de
 * la propiedad con el share nativo del teléfono (Web Share API nivel 2), que
 * en móvil desemboca directo en WhatsApp. Escalera de fallbacks honesta:
 *
 *  1. Fotos como archivos (fetch → File → navigator.share). Puede fallar por
 *     CORS (las fotos de EasyBroker viven en su CDN) o por falta de soporte.
 *  2. Share nativo con la liga pública (las fotos viven ahí).
 *  3. Sin share nativo (escritorio): abrir la liga pública.
 *
 * Cancelar el share del sistema NO es un error (AbortError se ignora).
 */
export function BotonCompartirFotos({
  fotos,
  titulo,
  urlPublica,
  className,
}: {
  fotos: string[]
  titulo: string
  urlPublica: string | null
  className?: string
}) {
  const [ocupado, setOcupado] = useState(false)

  if (fotos.length === 0) return null

  async function compartir() {
    setOcupado(true)
    try {
      try {
        const archivos = await Promise.all(
          fotos.slice(0, MAX_FOTOS).map(async (url, i) => {
            const respuesta = await fetch(url)
            if (!respuesta.ok) throw new Error(`foto ${url}: ${respuesta.status}`)
            const blob = await respuesta.blob()
            const extension = blob.type.split('/')[1]?.split('+')[0] || 'jpg'
            return new File([blob], `foto-${i + 1}.${extension}`, {
              type: blob.type || 'image/jpeg',
            })
          })
        )
        if (navigator.canShare?.({ files: archivos })) {
          await navigator.share({ files: archivos, title: titulo })
          return
        }
        throw new Error('el navegador no comparte archivos')
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return // canceló, no es error
        // Escalón 2: la liga pública por el share nativo.
        if (urlPublica && typeof navigator.share === 'function') {
          await navigator.share({ title: titulo, url: urlPublica })
          return
        }
        // Escalón 3: sin share nativo — la liga en una pestaña.
        if (urlPublica) {
          window.open(urlPublica, '_blank', 'noopener,noreferrer')
          return
        }
        toast.error('No se pudieron compartir las fotos desde este navegador')
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      toast.error('No se pudieron compartir las fotos')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={compartir}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-colors active:translate-y-px disabled:opacity-60',
        className
      )}
    >
      <Images aria-hidden className="size-4" />
      {ocupado ? 'Preparando…' : 'Mandar fotos'}
    </button>
  )
}
