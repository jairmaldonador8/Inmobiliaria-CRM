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
import GraficaLinea from '@/components/fintech/grafica-linea'

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

    // El glifo va envuelto en su propio aria-hidden (ver StatCard) — el
    // atributo data-tendencia vive en el span contenedor, no en el glifo.
    const glifo = screen.getByText(/▲/)
    expect(glifo.textContent).toContain('▲')
    expect(glifo.closest('[data-tendencia]')).toHaveAttribute('data-tendencia', 'sube')
  })

  it('tendencia negativa muestra ▼ y data-tendencia="baja"', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: -8 }} />)

    const glifo = screen.getByText(/▼/)
    expect(glifo.textContent).toContain('▼')
    expect(glifo.closest('[data-tendencia]')).toHaveAttribute('data-tendencia', 'baja')
  })

  it('el glifo ▲/▼ va marcado aria-hidden (la semántica ya la da el sr-only)', () => {
    render(<StatCard etiqueta="Leads" valor="24" tendencia={{ delta: 12 }} />)

    const glifo = screen.getByText(/▲/)
    expect(glifo).toHaveAttribute('aria-hidden', 'true')
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

    // El texto sr-only ("subió") es hermano/anidado pero no visible — se
    // comprueba que el sufijo personalizado aparezca, sin exigir igualdad
    // exacta con el textContent completo (que también incluye el sr-only).
    const contenedor = screen.getByText(/▲/).closest('[data-tendencia]')
    expect(contenedor?.textContent?.replace(/\s+/g, ' ').trim()).toContain('▲ 3 leads')
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

describe('GraficaLinea', () => {
  it('dos instancias montadas a la vez tienen ids de gradiente DISTINTOS', () => {
    const { container } = render(
      <>
        <GraficaLinea datos={[1, 5, 3, 8]} />
        <GraficaLinea datos={[2, 4, 1, 6]} />
      </>
    )

    const ids = Array.from(container.querySelectorAll('linearGradient')).map((el) => el.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    // Cada <path> de relleno debe referenciar su propio gradiente (no un id fijo).
    const urls = Array.from(container.querySelectorAll('path[fill^="url(#"]')).map((el) =>
      el.getAttribute('fill')
    )
    expect(urls).toEqual([`url(#${ids[0]})`, `url(#${ids[1]})`])
  })

  it('con datos vacíos no renderiza nada y no truena', () => {
    const { container } = render(<GraficaLinea datos={[]} />)

    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })

  it('con una serie plana (todos los valores iguales) no hay NaN en los `d` de los paths', () => {
    const { container } = render(<GraficaLinea datos={[5, 5, 5, 5]} />)

    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
    paths.forEach((path) => {
      expect(path.getAttribute('d')).not.toMatch(/NaN/)
    })
  })

  it('sin etiquetaAccesible, el SVG es decorativo (aria-hidden + focusable="false")', () => {
    const { container } = render(<GraficaLinea datos={[1, 5, 3, 8]} />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg?.querySelector('title')).not.toBeInTheDocument()
  })

  it('con etiquetaAccesible, el SVG expone role="img" y un <title> como primer hijo', () => {
    const { container } = render(
      <GraficaLinea datos={[1, 5, 3, 8]} etiquetaAccesible="Leads subieron 12% en 30 días" />
    )

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(svg?.firstElementChild?.tagName.toLowerCase()).toBe('title')
    expect(svg?.querySelector('title')).toHaveTextContent('Leads subieron 12% en 30 días')
  })
})
