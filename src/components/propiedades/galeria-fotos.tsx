'use client'

import { useState } from 'react'
import Image from 'next/image'

import { FotoPlaceholder } from '@/components/propiedades/tarjeta-propiedad'
import { cn } from '@/lib/utils'

type Props = {
  fotos: string[]
  titulo: string
}

/**
 * Galería de la ficha de propiedad: foto principal grande + tira de
 * miniaturas con scroll horizontal. Sin fotos → placeholder neutro.
 */
export function GaleriaFotos({ fotos, titulo }: Props) {
  const [indice, setIndice] = useState(0)
  const fotoActual = fotos[indice] ?? fotos[0] ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
        {fotoActual ? (
          <Image
            key={fotoActual}
            src={fotoActual}
            alt={`${titulo} — foto ${indice + 1} de ${fotos.length}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover"
          />
        ) : (
          <FotoPlaceholder />
        )}
        {fotos.length > 1 ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-slate-900/70 px-2.5 py-0.5 text-xs font-medium text-white">
            {indice + 1} / {fotos.length}
          </span>
        ) : null}
      </div>

      {fotos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Miniaturas">
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
              <Image
                src={foto}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
