// @vitest-environment jsdom
/**
 * Test de componente para EtiquetaClasificacionEB (ver
 * src/components/leads/etiqueta-clasificacion-eb.tsx): los 3 valores del
 * enum clasificacion_lead_eb deben mostrar texto de NEGOCIO (nunca el
 * nombre técnico del enum) y `null`/`undefined` no deben pintar nada — es
 * "sin clasificar" (no viene de EasyBroker, o no se pudo resolver), no una
 * categoría propia del dominio.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'

afterEach(() => {
  cleanup()
})

describe('EtiquetaClasificacionEB', () => {
  it('cliente_directo: muestra "Cliente directo" (nunca el nombre técnico del enum)', () => {
    render(<EtiquetaClasificacionEB clasificacion="cliente_directo" />)

    expect(screen.getByText('Cliente directo')).toBeInTheDocument()
    expect(screen.queryByText(/cliente_directo/)).not.toBeInTheDocument()
  })

  it('co_broke: muestra "Corredor externo"', () => {
    render(<EtiquetaClasificacionEB clasificacion="co_broke" />)

    expect(screen.getByText('Corredor externo')).toBeInTheDocument()
    expect(screen.queryByText(/co_broke/)).not.toBeInTheDocument()
  })

  it('saliente: muestra "Gestión nuestra"', () => {
    render(<EtiquetaClasificacionEB clasificacion="saliente" />)

    expect(screen.getByText('Gestión nuestra')).toBeInTheDocument()
    expect(screen.queryByText(/saliente/)).not.toBeInTheDocument()
  })

  it('los tres tipos usan colores de fondo distinguibles entre sí', () => {
    const { container: c1 } = render(<EtiquetaClasificacionEB clasificacion="cliente_directo" />)
    const clase1 = c1.firstElementChild?.className ?? ''
    cleanup()

    const { container: c2 } = render(<EtiquetaClasificacionEB clasificacion="co_broke" />)
    const clase2 = c2.firstElementChild?.className ?? ''
    cleanup()

    const { container: c3 } = render(<EtiquetaClasificacionEB clasificacion="saliente" />)
    const clase3 = c3.firstElementChild?.className ?? ''

    expect(clase1).not.toBe(clase2)
    expect(clase2).not.toBe(clase3)
    expect(clase1).not.toBe(clase3)
  })

  it('clasificacion=null no renderiza nada', () => {
    const { container } = render(<EtiquetaClasificacionEB clasificacion={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clasificacion=undefined no renderiza nada', () => {
    const { container } = render(<EtiquetaClasificacionEB clasificacion={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
