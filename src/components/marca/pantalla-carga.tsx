'use client'

import { useEffect, useState } from 'react'

import { Wordmark } from '@/components/marca/wordmark'

/**
 * Pantalla de arranque del sistema: el gallo camina mientras la app termina
 * de cargar y, cuando ya está lista, se voltea de frente y la pantalla se va.
 *
 * El gallo va suelto, con su sombra en el suelo y sin tarima: las tiras traen
 * el fondo recortado y la sombra convertida en alfa. Por eso esta pantalla es
 * CLARA y no de tinta — el gallo es negro y sobre oscuro desaparecería. De
 * paso el fondo es el mismo `slate-50` del layout, así que al desvanecerse no
 * se nota ningún salto de color.
 *
 * La caminata NO dura un tiempo fijo: dura lo que tarde la carga. El giro se
 * dispara con `load` (o al tope, si algo se atora), así que si el sistema
 * abre rápido la pantalla dura ~1.3 s y si tarda, el gallo sigue caminando.
 *
 * Se monta en los layouts de (admin) y (asesor), no en el layout raíz: la
 * landing pública no lleva pantalla de carga. Como vive en el layout, las
 * navegaciones dentro del área no la vuelven a mostrar — solo una carga real.
 */

/** Que no alcance a verse un parpadeo si la app ya estaba caliente. */
const MINIMO_CAMINANDO = 650
/** Si algo no termina de cargar, no dejamos al usuario encerrado mirando. */
const TOPE_CAMINANDO = 6000
/** Debe coincidir con la animación `gallo-voltea` de globals.css. */
const DURACION_GIRO = 900
const DURACION_SALIDA = 260

type Fase = 'caminando' | 'volteando' | 'saliendo' | 'fuera'

export function PantallaCarga() {
  const [fase, setFase] = useState<Fase>('caminando')

  // Arranca el giro cuando la página terminó de cargar (con un mínimo para
  // que no parpadee y un tope para que nunca se quede pegada).
  useEffect(() => {
    let cancelado = false
    let disparado = false
    const inicio = performance.now()

    const alListo = () => {
      if (cancelado || disparado) return
      disparado = true
      const espera = Math.max(0, MINIMO_CAMINANDO - (performance.now() - inicio))
      window.setTimeout(() => {
        if (!cancelado) setFase('volteando')
      }, espera)
    }

    if (document.readyState === 'complete') alListo()
    else window.addEventListener('load', alListo, { once: true })
    const tope = window.setTimeout(alListo, TOPE_CAMINANDO)

    return () => {
      cancelado = true
      window.removeEventListener('load', alListo)
      window.clearTimeout(tope)
    }
  }, [])

  // Ya volteado: desvanecer y desmontar.
  useEffect(() => {
    if (fase !== 'volteando') return
    const aSalir = window.setTimeout(() => setFase('saliendo'), DURACION_GIRO)
    const aFuera = window.setTimeout(
      () => setFase('fuera'),
      DURACION_GIRO + DURACION_SALIDA
    )
    return () => {
      window.clearTimeout(aSalir)
      window.clearTimeout(aFuera)
    }
  }, [fase])

  if (fase === 'fuera') return null

  const caminando = fase === 'caminando'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando Klo-Ser"
      className={`fixed inset-0 z-[120] flex flex-col items-center justify-center gap-5 bg-slate-50 transition-opacity duration-[260ms] ease-out ${
        fase === 'saliendo' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Sin recorte ni fondo: el sprite es un background y no se desborda. */}
      <div aria-hidden className="relative size-44 sm:size-52">
        {caminando ? (
          <>
            <span className="gallo-carga gallo-carga--camina" />
            <span className="gallo-carga gallo-carga--precarga" />
          </>
        ) : (
          <span className="gallo-carga gallo-carga--voltea" />
        )}
      </div>

      {/*
        La firma vertical de la marca: el gallo arriba y el wordmark debajo,
        centrados como un solo bloque. El `pl` compensa el tracking de 0.42em,
        que le cuelga a la derecha de la última letra y descentraba el texto
        respecto al gallo.
      */}
      <Wordmark className="pl-[0.42em] text-[18px] text-slate-900 sm:text-[20px]" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
