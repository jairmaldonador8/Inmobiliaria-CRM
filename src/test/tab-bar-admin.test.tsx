// @vitest-environment jsdom
/**
 * Tests TDD para TabBarAdmin (Task FM5): tab bar inferior glass del admin,
 * modelada sobre NavAsesor (ver src/components/nav/nav-asesor.tsx) pero con
 * hoja «Más» para las rutas que no caben en los 4 slots fijos.
 *
 * Reglas duras de la skill fintech-muro-ui verificadas aquí:
 * - el wrapper `fixed` es TRANSPARENTE (sin backdrop-blur) y el blur real
 *   vive en el hijo (pill) — patrón anti-jank de iOS.
 * - el wrapper usa `max(..., env(safe-area-inset-bottom))` para el
 *   padding inferior.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockUsePathname = vi.fn<() => string>()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

import { TabBarAdmin } from '@/components/nav/tab-bar-admin'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TabBarAdmin — pestaña activa', () => {
  it('en /admin, Inicio está activo (match exacto) y aria-current="page"', () => {
    mockUsePathname.mockReturnValue('/admin')
    render(<TabBarAdmin />)

    const inicio = screen.getByRole('link', { name: /inicio/i })
    expect(inicio).toHaveAttribute('aria-current', 'page')

    const bandeja = screen.getByRole('link', { name: /bandeja/i })
    expect(bandeja).not.toHaveAttribute('aria-current')
  })

  it('en /admin/leads, Inicio NO está activo (exige match exacto)', () => {
    mockUsePathname.mockReturnValue('/admin/leads')
    render(<TabBarAdmin />)

    expect(screen.getByRole('link', { name: /inicio/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /^leads$/i })).toHaveAttribute('aria-current', 'page')
  })

  it('en /admin/leads/123, Leads sigue activo (prefix-match para subrutas)', () => {
    mockUsePathname.mockReturnValue('/admin/leads/123')
    render(<TabBarAdmin />)

    expect(screen.getByRole('link', { name: /^leads$/i })).toHaveAttribute('aria-current', 'page')
  })

  it('en /admin/propiedades/45, Propiedades está activo', () => {
    mockUsePathname.mockReturnValue('/admin/propiedades/45')
    render(<TabBarAdmin />)

    expect(screen.getByRole('link', { name: /propiedades/i })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })
})

describe('TabBarAdmin — hoja «Más»', () => {
  it('el botón «Más» abre una hoja con Asesores, Plantillas, Sugerencias, Notificaciones y Ajustes', async () => {
    mockUsePathname.mockReturnValue('/admin')
    render(<TabBarAdmin />)

    fireEvent.click(screen.getByRole('button', { name: /más/i }))

    expect(await screen.findByRole('link', { name: /asesores/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /plantillas/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sugerencias/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /notificaciones/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ajustes/i })).toBeInTheDocument()
  })
})

describe('TabBarAdmin — anti-jank del blur (wrapper transparente, hijo con glass)', () => {
  it('el wrapper fixed NO trae backdrop-blur/backdrop-filter', () => {
    mockUsePathname.mockReturnValue('/admin')
    const { container } = render(<TabBarAdmin />)

    const wrapper = container.querySelector('nav[aria-label="Navegación principal"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).not.toMatch(/backdrop-blur/)
    expect(wrapper?.className).not.toMatch(/backdrop-filter/)
  })

  it('el hijo (pill) SÍ trae backdrop-blur-glass, el -webkit- prefijado e isolate', () => {
    mockUsePathname.mockReturnValue('/admin')
    const { container } = render(<TabBarAdmin />)

    const wrapper = container.querySelector('nav[aria-label="Navegación principal"]')
    const pill = wrapper?.firstElementChild as HTMLElement | undefined
    expect(pill).toBeDefined()
    expect(pill?.className).toMatch(/backdrop-blur-glass/)
    expect(pill?.className).toMatch(/isolate/)
    expect(pill?.className).toMatch(/-webkit-backdrop-filter/)
  })
})

describe('TabBarAdmin — safe area inferior', () => {
  it('el wrapper usa max(..., env(safe-area-inset-bottom)) para el padding inferior', () => {
    mockUsePathname.mockReturnValue('/admin')
    const { container } = render(<TabBarAdmin />)

    const wrapper = container.querySelector('nav[aria-label="Navegación principal"]')
    expect(wrapper?.className).toMatch(/max\([^)]*env\(safe-area-inset-bottom\)\)/)
  })
})
