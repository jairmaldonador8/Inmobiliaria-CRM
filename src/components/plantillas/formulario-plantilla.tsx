'use client'

/**
 * Campos compartidos del editor de plantillas (Task 19): nombre + texto,
 * chips para insertar variables en la posición del cursor y vista previa en
 * vivo con datos de ejemplo. Se usa tanto en el dialog de crear como en el
 * de editar (mismo formulario, distinto submit).
 */

import { useRef } from 'react'

import { rellenarPlantilla, VARIABLES_PLANTILLA, type ContextoPlantilla } from '@/lib/plantillas/rellenar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Datos de ejemplo para que la vista previa sea legible mientras se escribe. */
const CONTEXTO_EJEMPLO: ContextoPlantilla = {
  nombre: 'María',
  propiedad: 'Casa Roble 24',
  zona: 'Norte',
  precio: '$2,500,000 MXN',
  asesor: 'Carlos',
}

type Props = {
  idPrefix: string
  nombre: string
  texto: string
  onNombreChange: (valor: string) => void
  onTextoChange: (valor: string) => void
  disabled?: boolean
}

export function FormularioPlantilla({
  idPrefix,
  nombre,
  texto,
  onNombreChange,
  onTextoChange,
  disabled,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /** Inserta {variable} en la posición del cursor del textarea (o al final si no hay foco). */
  function insertarVariable(variable: string) {
    const marcador = `{${variable}}`
    const textarea = textareaRef.current

    if (!textarea) {
      onTextoChange(texto + marcador)
      return
    }

    const inicio = textarea.selectionStart ?? texto.length
    const fin = textarea.selectionEnd ?? texto.length
    const nuevoTexto = texto.slice(0, inicio) + marcador + texto.slice(fin)
    onTextoChange(nuevoTexto)

    const posicionCursor = inicio + marcador.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(posicionCursor, posicionCursor)
    })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-nombre`}>Nombre</Label>
        <Input
          id={`${idPrefix}-nombre`}
          value={nombre}
          onChange={(e) => onNombreChange(e.target.value)}
          maxLength={100}
          required
          disabled={disabled}
          placeholder="Primer contacto"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-texto`}>Texto</Label>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES_PLANTILLA.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insertarVariable(variable)}
              disabled={disabled}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              {`{${variable}}`}
            </button>
          ))}
        </div>
        <Textarea
          ref={textareaRef}
          id={`${idPrefix}-texto`}
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          maxLength={1000}
          required
          disabled={disabled}
          rows={4}
          placeholder="Hola {nombre}, soy {asesor} de Montana Realty…"
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Vista previa</Label>
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-600">
          {texto.trim()
            ? rellenarPlantilla(texto, CONTEXTO_EJEMPLO)
            : 'Escribe el texto para ver la vista previa…'}
        </p>
      </div>
    </div>
  )
}
