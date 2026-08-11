'use client'

import { useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'

import { FotoPlaceholder } from '@/components/propiedades/tarjeta-propiedad'
import { cn } from '@/lib/utils'

type Props = {
  fotos: string[]
  titulo: string
  /**
   * Capa inferior del héroe en móvil (operación, precio, zona). Va aquí y no
   * en la página porque tiene que ir ENCIMA de la foto a sangre.
   */
  velo?: ReactNode
  /** Capa superior izquierda del héroe en móvil (el botón de volver). */
  accionSuperior?: ReactNode
}

/**
 * Galería de la ficha de propiedad. Dos presentaciones de las mismas fotos:
 *
 * - **Teléfono** (hasta `lg`): carrusel a sangre que se pasa deslizando, con
 *   puntos y contador. El gesto es scroll nativo con `snap-x snap-mandatory`
 *   — nada de listeners de touch ni librerías: se siente como la galería del
 *   sistema y sigue funcionando con el teclado y el lector de pantalla.
 * - **Escritorio** (desde `lg`): foto principal + tira de miniaturas, tal
 *   como estaba. Es donde el dueño del producto dijo que ya se ve bien.
 *
 * Las dos ramas se montan siempre y se alternan con `lg:hidden` / `hidden
 * lg:flex`, NO midiendo el ancho en JavaScript: así el HTML del servidor y
 * el del cliente son idénticos y no hay parpadeo ni error de hidratación.
 */
export function GaleriaFotos({ fotos, titulo, velo, accionSuperior }: Props) {
  const [indice, setIndice] = useState(0)
  const [indiceMovil, setIndiceMovil] = useState(0)
  const carrusel = useRef<HTMLDivElement>(null)
  const fotoActual = fotos[indice] ?? fotos[0] ?? null

  /** Qué foto quedó centrada tras el deslizamiento. */
  function alDeslizar() {
    const nodo = carrusel.current
    if (!nodo || nodo.clientWidth === 0) return
    const actual = Math.round(nodo.scrollLeft / nodo.clientWidth)
    setIndiceMovil(Math.min(Math.max(actual, 0), Math.max(fotos.length - 1, 0)))
  }

  return (
    <>
      {/* ── Teléfono: héroe a sangre ──────────────────────────────── */}
      {/* `-mx-4`: rompe el padding horizontal del <main> para que la foto
          llegue a los bordes de la pantalla. `lg:hidden` lo apaga entero en
          escritorio, donde el padding sí debe respetarse. */}
      <div className="relative -mx-4 lg:hidden">
        <div
          ref={carrusel}
          onScroll={alDeslizar}
          aria-label={`Fotos de ${titulo}`}
          className="flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {fotos.length === 0 ? (
            <div className="aspect-[4/3] w-full shrink-0 bg-slate-100">
              <FotoPlaceholder />
            </div>
          ) : (
            fotos.map((foto, i) => (
              <div key={foto} className="relative aspect-[4/3] w-full shrink-0 snap-center bg-slate-100">
                <Image
                  src={foto}
                  alt={`${titulo} — foto ${i + 1} de ${fotos.length}`}
                  fill
                  // Solo la primera entra en la primera pantalla; las demás,
                  // perezosas, para no pelear ancho de banda en el celular.
                  priority={i === 0}
                  loading={i === 0 ? undefined : 'lazy'}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            ))
          )}
        </div>

        {accionSuperior ? (
          <div className="absolute top-3 left-3 z-10">{accionSuperior}</div>
        ) : null}

        {fotos.length > 1 ? (
          <span className="absolute top-3 right-3 rounded-full bg-slate-900/70 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
            {indiceMovil + 1} / {fotos.length}
          </span>
        ) : null}

        {/*
          Puntos y velo van en la MISMA capa, con los puntos arriba: sueltos
          contra la foto quedaban debajo del degradado y no se veían. Aquí
          caen sobre la banda oscura y contrastan siempre, aunque la foto sea
          clara. El activo se alarga además de aclararse, para no depender
          solo del color.
        */}
        {velo || fotos.length > 1 ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-5 text-white',
              velo
                ? 'bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent pt-14'
                : 'pt-8'
            )}
          >
            {fotos.length > 1 ? (
              <div aria-hidden className="mb-2 flex gap-1.5">
                {fotos.map((foto, i) => (
                  <span
                    key={foto}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === indiceMovil ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                    )}
                  />
                ))}
              </div>
            ) : null}
            {velo}
          </div>
        ) : null}
      </div>

      {/* ── Escritorio: foto principal + miniaturas ───────────────── */}
      <div className="hidden flex-col gap-3 lg:flex">
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
          {fotoActual ? (
            <Image
              key={fotoActual}
              src={fotoActual}
              alt={`${titulo} — foto ${indice + 1} de ${fotos.length}`}
              fill
              sizes="60vw"
              className="object-cover"
            />
          ) : (
            <FotoPlaceholder />
          )}
          {fotos.length > 1 ? (
            <span className="absolute right-3 bottom-3 rounded-full bg-slate-900/70 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
              {indice + 1} / {fotos.length}
            </span>
          ) : null}
        </div>

        {fotos.length > 1 ? (
          /*
            `w-0 min-w-full`, NO solo `overflow-x-auto`: con 7 fotos la tira
            mide 608px (7×80 + gaps) y ese ancho subía como tamaño mínimo
            automático por toda la cadena de padres hasta el item de la
            rejilla de la ficha, estirando la PÁGINA ENTERA. Con `w-0` el
            ancho deja de venir del contenido y `min-w-full` lo devuelve al
            del padre, así que el desborde se queda DENTRO de la tira.
          */
          <div
            className="flex w-0 min-w-full gap-2 overflow-x-auto pb-1"
            role="listbox"
            aria-label="Miniaturas"
          >
            {fotos.map((foto, i) => (
              <button
                key={foto}
                type="button"
                role="option"
                aria-selected={i === indice}
                aria-label={`Foto ${i + 1}`}
                onClick={() => setIndice(i)}
                className={cn(
                  'relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-lg ring-1 transition-all outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
                  i === indice
                    ? 'ring-2 ring-slate-900'
                    : 'ring-slate-200 opacity-70 hover:opacity-100'
                )}
              >
                <Image src={foto} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
