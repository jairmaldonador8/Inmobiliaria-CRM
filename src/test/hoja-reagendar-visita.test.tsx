// @vitest-environment jsdom
/**
 * Tests para HojaReagendarVisita (corrección post-cierre: antes de este
 * cambio `reagendarVisita` no la llamaba nadie — un error al teclear la
 * hora dejaba la visita agendada para siempre). Mismo patrón de mocks que
 * `hoja-agendar-visita.test.tsx`: se mockea '@/lib/visitas/acciones'
 * porque arrastra 'server-only'.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockReagendarVisita = vi.fn()
vi.mock('@/lib/visitas/acciones', () => ({
  reagendarVisita: (...args: unknown[]) => mockReagendarVisita(...args),
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const mockOpen = vi.fn()
vi.stubGlobal('open', mockOpen)

import { HojaReagendarVisita } from '@/components/visitas/hoja-reagendar-visita'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// 2026-09-10T20:30:00.000Z == 2026-09-10 14:30 en America/Monterrey (UTC-6,
// sin horario de verano) — misma fórmula fija que hoja-agendar-visita.test.tsx.
const FECHA_ACTUAL_ISO = '2026-09-10T20:30:00.000Z'

function render_(propsExtra: Partial<Parameters<typeof HojaReagendarVisita>[0]> = {}) {
  const onAbiertoChange = vi.fn()
  const utils = render(
    <HojaReagendarVisita
      visitaId="visita-1"
      leadNombre="Carla Gómez"
      telefono="528100000000"
      asesorNombre="Luis"
      propiedadTitulo="Casa Bonita"
      fechaActualIso={FECHA_ACTUAL_ISO}
      duracionActualMin={90}
      abierto
      onAbiertoChange={onAbiertoChange}
      {...propsExtra}
    />
  )
  return { ...utils, onAbiertoChange }
}

describe('HojaReagendarVisita', () => {
  it('precarga fecha, hora y duración con los valores actuales de la visita', () => {
    render_()

    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-10')
    expect(screen.getByLabelText('Hora')).toHaveValue('14:30')
    expect(screen.getByRole('button', { name: /confirmar cambio/i })).toBeInTheDocument()
  })

  it('al enviar, llama a reagendarVisita(visitaId, { fecha, duracionMin }) con la nueva fecha convertida a ISO', async () => {
    mockReagendarVisita.mockResolvedValue({ ok: true })
    render_()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar cambio/i }))

    await vi.waitFor(() => {
      expect(mockReagendarVisita).toHaveBeenCalledTimes(1)
    })

    const [visitaId, datos] = mockReagendarVisita.mock.calls[0]
    expect(visitaId).toBe('visita-1')
    expect(datos.duracionMin).toBe(90)
    expect(datos.fecha).toBe('2026-09-20T22:00:00.000Z')
  })

  it('al reagendar con éxito, cierra la hoja, muestra el toast y refresca', async () => {
    mockReagendarVisita.mockResolvedValue({ ok: true })
    const { onAbiertoChange } = render_()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar cambio/i }))

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Visita reagendada', expect.anything())
    })
    expect(onAbiertoChange).toHaveBeenCalledWith(false)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('si reagendarVisita responde con error, lo muestra y NO borra la fecha/hora tecleadas', async () => {
    mockReagendarVisita.mockResolvedValue({ error: 'No se pudo reagendar la visita' })
    render_()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar cambio/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo reagendar la visita')

    // Campos controlados: el error NO los resetea (a diferencia de un
    // <input> no controlado dentro de <form action>, que React 19 limpia
    // en cuanto la función retorna, incluso si hubo error).
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-20')
    expect(screen.getByLabelText('Hora')).toHaveValue('16:00')
  })
})
