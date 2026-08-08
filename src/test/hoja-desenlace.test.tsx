// @vitest-environment jsdom
/**
 * Tests de `HojaDesenlace`: la hoja «¿Cómo te fue?» que aparece al volver de
 * WhatsApp. Lo que se fija aquí es CUÁNDO se abre y cuándo deja de abrirse,
 * porque esa decisión mezcla dos fuentes: el contacto pendiente que manda el
 * servidor en cada render y el «ahora no» que solo vive en el cliente.
 *
 * Se mockean '@/lib/contactos/acciones' y '@/lib/visitas/acciones' porque
 * arrastran 'server-only' (vía usuarioActual -> createClient) — mismo motivo
 * que hoja-agendar-visita.test.tsx.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockResolverContacto = vi.fn()
vi.mock('@/lib/contactos/acciones', () => ({
  resolverContacto: (...args: unknown[]) => mockResolverContacto(...args),
}))

const mockAgendarVisita = vi.fn()
vi.mock('@/lib/visitas/acciones', () => ({
  agendarVisita: (...args: unknown[]) => mockAgendarVisita(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { HojaDesenlace } from '@/components/contactos/hoja-desenlace'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function propsBase() {
  return {
    leadId: 'lead-1',
    leadNombre: 'Carla Gómez',
    telefono: '528100000000',
    asesorNombre: 'Luis',
    propiedadLeadId: null,
    propiedadLeadTitulo: null,
    propiedades: [],
  }
}

/** ¿Está abierta la hoja de desenlace? Se identifica por su título. */
function desenlaceVisible() {
  return screen.queryByText(/¿cómo te fue con carla\?/i) !== null
}

describe('HojaDesenlace', () => {
  it('sin contacto pendiente NO abre la hoja; cuando el servidor reporta uno, la abre', () => {
    const { rerender } = render(
      <HojaDesenlace contactoPendienteId={null} {...propsBase()} />
    )
    expect(desenlaceVisible()).toBe(false)

    // El asesor tocó WhatsApp y volvió: el refresh trae el contacto A.
    rerender(<HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />)
    expect(desenlaceVisible()).toBe(true)
  })

  it('«Ahora no» cierra la hoja y no la reabre mientras siga el MISMO pendiente', () => {
    const { rerender } = render(
      <HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />
    )
    expect(desenlaceVisible()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /ahora no/i }))
    expect(desenlaceVisible()).toBe(false)

    // Cada `visibilitychange` dispara un router.refresh(): el servidor sigue
    // reportando A, que continúa pendiente. No debe volver a preguntar.
    rerender(<HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />)
    expect(desenlaceVisible()).toBe(false)
  })

  it('cuando el pendiente se resuelve, la hoja se cierra y queda limpia para el siguiente', () => {
    const { rerender } = render(
      <HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />
    )
    expect(desenlaceVisible()).toBe(true)

    // A quedó resuelto (aquí, desde otra pestaña o por el propio asesor).
    rerender(<HojaDesenlace contactoPendienteId={null} {...propsBase()} />)
    expect(desenlaceVisible()).toBe(false)

    // Y el siguiente contacto sí vuelve a preguntar.
    rerender(<HojaDesenlace contactoPendienteId="contacto-b" {...propsBase()} />)
    expect(desenlaceVisible()).toBe(true)
  })

  it('REGRESIÓN: tras posponer A, un contacto B nuevo SÍ vuelve a preguntar aunque nunca deje de haber pendiente', () => {
    const { rerender } = render(
      <HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />
    )

    // 1) El asesor pospone A.
    fireEvent.click(screen.getByRole('button', { name: /ahora no/i }))
    expect(desenlaceVisible()).toBe(false)

    // 2) Pasan más de 5 min (la ventana de dedupe), el asesor vuelve a tocar
    //    WhatsApp: A se degrada a 'sin_reporte' y entra B como pendiente.
    //    Nunca hubo un instante sin pendiente — con un booleano no había
    //    flanco y la hoja se tragaba a B.
    rerender(<HojaDesenlace contactoPendienteId="contacto-b" {...propsBase()} />)
    expect(desenlaceVisible()).toBe(true)
  })

  it('al elegir un desenlace lo resuelve, cierra la hoja y refresca', async () => {
    mockResolverContacto.mockResolvedValue({ ok: true })

    render(<HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />)

    fireEvent.click(screen.getByRole('button', { name: /no me contestó/i }))

    await vi.waitFor(() => {
      expect(mockResolverContacto).toHaveBeenCalledWith('lead-1', 'no_contesto')
    })
    await vi.waitFor(() => {
      expect(desenlaceVisible()).toBe(false)
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('«Agendé una cita» NO resuelve nada todavía: solo abre el formulario de visita', () => {
    render(<HojaDesenlace contactoPendienteId="contacto-a" {...propsBase()} />)

    fireEvent.click(screen.getByRole('button', { name: /agendé una cita/i }))

    expect(mockResolverContacto).not.toHaveBeenCalled()
    expect(desenlaceVisible()).toBe(false)
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
  })
})
