// @vitest-environment jsdom
/**
 * Tests TDD para los componentes base del kit «Fintech Muro» (ver
 * src/components/fintech/*): fondo con gradiente + orbes, tarjeta de
 * cristal (fake glass por defecto, blur real solo si se pide), tarjeta de
 * tinta (dark) con CTA opcional, y la tarjeta de estadística (KPI) con
 * tendencia. Se prueba sobre todo la regla dura del presupuesto de blur:
 * TarjetaGlass NO debe traer backdrop-blur por defecto.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import FondoFintech from '@/components/fintech/fondo-fintech'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'
import TarjetaTinta from '@/components/fintech/tarjeta-tinta'
import StatCard from '@/components/fintech/stat-card'

// vitest.config.ts corre sin `globals: true`, así que el auto-cleanup de
// @testing-library/react (que depende de un `afterEach` global) no se
// registra solo — este archivo renderiza varias veces por describe, así
// que hay que desmontar a mano entre tests para no arrastrar el DOM.
afterEach(() => {
  cleanup()
})

describe('TarjetaGlass', () => {
  it('por defecto NO trae ninguna clase backdrop-blur (cristal fingido)', () => {
    render(<TarjetaGlass data-testid="tarjeta">contenido</TarjetaGlass>)

    const tarjeta = screen.getByTestId('tarjeta')
    expect(tarjeta.className).not.toMatch(/backdrop-blur/)
    expect(tarjeta.className).not.toMatch(/backdrop-filter/)
  })

  it('con conBlur SÍ trae backdrop-blur-glass e isolate', () => {
    render(
      <TarjetaGlass conBlur data-testid="tarjeta">
        contenido
      </TarjetaGlass>
    )

    const tarjeta = screen.getByTestId('tarjeta')
    expect(tarjeta.className).toMatch(/backdrop-blur-glass/)
    expect(tarjeta.className).toMatch(/isolate/)
  })
})

describe('StatCard', () => {
  it('renderiza la etiqueta en mayúsculas estilizadas y el valor', () => {
    render(<StatCard etiqueta="Leads · 30 días" valor="24" />)

    const etiqueta = screen.getByText('Leads · 30 días')
    expect(etiqueta.className).toMatch(/uppercase/)
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('tendencia positiva muestra ▲ y data-tendencia="sube"', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: 12 }} />)

    const tendencia = screen.getByText(/▲/)
    expect(tendencia.textContent).toContain('▲')
    expect(tendencia).toHaveAttribute('data-tendencia', 'sube')
  })

  it('tendencia negativa muestra ▼ y data-tendencia="baja"', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: -8 }} />)

    const tendencia = screen.getByText(/▼/)
    expect(tendencia.textContent).toContain('▼')
    expect(tendencia).toHaveAttribute('data-tendencia', 'baja')
  })

  it('sin tendencia (o delta 0) no renderiza flecha alguna', () => {
    render(<StatCard etiqueta="Leads" valor="24" />)

    expect(screen.queryByText(/▲/)).not.toBeInTheDocument()
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument()
  })

  it('la tendencia trae texto sr-only con la dirección semántica (subió/bajó)', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: 12 }} />)
    expect(screen.getByText('subió')).toHaveClass('sr-only')

    cleanup()

    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: -8 }} />)
    expect(screen.getByText('bajó')).toHaveClass('sr-only')
  })

  it('el sufijo de la tendencia es configurable (por defecto "%", pero admite deltas absolutos)', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: 3, sufijo: ' leads' }} />)

    const tendencia = screen.getByText(/▲/)
    // El texto sr-only ("subió") es hermano/anidado pero no visible — se
    // comprueba que el sufijo personalizado aparezca, sin exigir igualdad
    // exacta con el textContent completo (que también incluye el sr-only).
    expect(tendencia.textContent?.replace(/\s+/g, ' ').trim()).toContain('▲ 3 leads')
  })

  it('acepta className (fusionada) y reenvía props estándar de div', () => {
    render(<StatCard etiqueta="Leads" valor="24" className="mi-clase-extra" data-testid="stat" />)

    const tarjeta = screen.getByTestId('stat')
    expect(tarjeta.className).toMatch(/mi-clase-extra/)
    expect(tarjeta.className).toMatch(/rounded-2xl/)
  })
})

describe('TarjetaTinta', () => {
  it('renderiza el CTA como enlace (<a>) cuando se le pasa href', () => {
    render(
      <TarjetaTinta etiqueta="Cierres del mes" cta={{ texto: 'Ver todo', href: '/admin/reportes' }}>
        $4.2M
      </TarjetaTinta>
    )

    const enlace = screen.getByRole('link', { name: 'Ver todo' })
    expect(enlace).toHaveAttribute('href', '/admin/reportes')
  })

  it('sin cta, no renderiza ningún enlace', () => {
    render(<TarjetaTinta etiqueta="Cierres del mes">$4.2M</TarjetaTinta>)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('acepta className (fusionada) y reenvía props estándar de div', () => {
    render(
      <TarjetaTinta etiqueta="Cierres del mes" className="mi-clase-extra" data-testid="tinta">
        $4.2M
      </TarjetaTinta>
    )

    const tarjeta = screen.getByTestId('tinta')
    expect(tarjeta.className).toMatch(/mi-clase-extra/)
    expect(tarjeta.className).toMatch(/rounded-2xl/)
  })
})

describe('FondoFintech', () => {
  it('renderiza 2 orbes aria-hidden y envuelve a los hijos', () => {
    const { container } = render(
      <FondoFintech>
        <p>hijo de prueba</p>
      </FondoFintech>
    )

    const orbes = container.querySelectorAll('[aria-hidden="true"]')
    expect(orbes).toHaveLength(2)
    expect(screen.getByText('hijo de prueba')).toBeInTheDocument()
  })
})
