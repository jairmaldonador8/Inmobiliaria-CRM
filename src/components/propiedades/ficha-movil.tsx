'use client'

import { useState } from 'react'
import { ArrowLeft, ExternalLink, MessageCircle } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Piezas exclusivas de la ficha de propiedad en el TELÉFONO (propuesta P2,
 * «Vitrina»). Compartidas entre la ficha de dirección y la de asesor.
 * Escritorio no usa ninguna: todas se apagan desde `lg`.
 */

/** Botón redondo de volver, flotando sobre la foto a sangre. */
export function BotonVolverFlotante({ href, etiqueta }: { href: string; etiqueta: string }) {
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className="flex size-9 items-center justify-center rounded-full bg-slate-950/55 text-white backdrop-blur-sm transition-colors hover:bg-slate-950/75"
    >
      <ArrowLeft aria-hidden className="size-5" />
    </Link>
  )
}

export type CeldaDato = { etiqueta: string; valor: string }

/**
 * Ficha técnica en celdas. Es la MISMA información que la lista de escritorio,
 * no un resumen: en una pantalla angosta un número grande en su propia celda
 * se lee de un vistazo, mientras que la lista etiqueta-valor obliga a barrer
 * de izquierda a derecha renglón por renglón.
 *
 * Rejilla de 2 columnas fija (no `auto-fit`): con anchos que van de 320 a
 * 440 px, `auto-fit` saltaría de 2 a 3 columnas entre un iPhone SE y un Pro
 * Max y la ficha se vería distinta en cada teléfono.
 */
export function DatosEnCeldas({ datos }: { datos: CeldaDato[] }) {
  if (datos.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-2 lg:hidden">
      {datos.map(({ etiqueta, valor }) => (
        <div key={etiqueta} className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <dt className="truncate text-[0.6875rem] font-medium tracking-wide text-slate-400 uppercase">
            {etiqueta}
          </dt>
          <dd className="mt-0.5 truncate text-base font-semibold text-slate-900 tabular-nums">
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Descripción con «Leer más». Las de EasyBroker pasan de 1 000 caracteres y
 * empujaban la ficha técnica fuera de la primera pantalla del teléfono.
 * Recortada a 5 líneas se ve de qué va sin sepultar el resto.
 *
 * El texto completo está SIEMPRE en el DOM (recortado con `line-clamp`, no
 * cortado en JavaScript): así el buscador del navegador lo encuentra y no se
 * pierde contenido si el JavaScript no llegó a cargar.
 */
export function DescripcionPlegable({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false)
  // Umbral en caracteres, no en líneas: no hay forma de saber cuántas líneas
  // ocupará antes de pintar. ~280 son unas 5 líneas en un teléfono angosto;
  // por debajo de eso el botón sobra.
  const necesitaPliegue = texto.length > 280

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 lg:p-5">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Descripción</h2>
      <p
        className={cn(
          'text-sm leading-relaxed break-words whitespace-pre-line text-slate-600',
          // El pliegue es solo del teléfono: en escritorio la columna es
          // ancha y la descripción completa cabe sin estorbar.
          necesitaPliegue && !abierta && 'line-clamp-5 lg:line-clamp-none'
        )}
      >
        {texto}
      </p>
      {necesitaPliegue ? (
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="mt-2 text-sm font-semibold text-slate-900 underline-offset-4 hover:underline lg:hidden"
        >
          {abierta ? 'Leer menos' : 'Leer más'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Barra de acciones fija del teléfono: compartir por WhatsApp sin scrollear.
 * Era el punto de la propuesta P2 — el asesor abre la ficha con el cliente en
 * la línea y necesita mandarle la propiedad ya.
 *
 * Se ancla a `--alto-nav`, la variable que cada layout publica con el alto de
 * SU barra de pestañas (la del asesor y la píldora del admin no miden lo
 * mismo, y las dos crecen con la barra de gestos del iPhone). Medir eso aquí
 * dentro, o copiar el número, dejaba la barra tapando la navegación: con
 * `bottom-16` se solapaba 1px con el borde de la barra del asesor, y en un
 * iPhone con barra de gestos habría quedado ~34px por debajo.
 */
export function BarraAccionesMovil({
  enlaceWhatsApp,
  urlPublica,
  className,
}: {
  enlaceWhatsApp: string
  urlPublica: string | null
  className?: string
}) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-[var(--alto-nav,4rem)] z-30 flex gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur-sm lg:hidden',
        className
      )}
    >
      <a
        href={enlaceWhatsApp}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors active:translate-y-px"
      >
        <MessageCircle aria-hidden className="size-4" />
        Compartir
      </a>
      {urlPublica ? (
        <a
          href={urlPublica}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-colors active:translate-y-px"
        >
          Ver publicada
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </div>
  )
}
