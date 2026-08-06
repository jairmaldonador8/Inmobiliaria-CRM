// @vitest-environment jsdom
/**
 * Tests para ListaVisitasLead (corrección post-cierre): antes de este
 * cambio no existía ninguna pantalla que listara las visitas de un lead,
 * y `reagendarVisita`/`cancelarVisita` no las llamaba nadie. Cubre:
 *  - diferencia visual agendada vs. historial (cancelada/realizada),
 *  - Reagendar abre la hoja compartida y llama a reagendarVisita,
 *  - Cancelar EXIGE confirmación antes de llamar a cancelarVisita.
 *
 * Se mockea '@/lib/visitas/acciones' porque arrastra 'server-only' (mismo
 * motivo que hoja-agendar-visita.test.tsx).
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VisitaLead } from '@/lib/visitas/consultas'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockCancelarVisita = vi.fn()
const mockReagendarVisita = vi.fn()
vi.mock('@/lib/visitas/acciones', () => ({
  cancelarVisita: (...args: unknown[]) => mockCancelarVisita(...args),
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

import { ListaVisitasLead } from '@/components/visitas/lista-visitas-lead'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const VISITA_AGENDADA: VisitaLead = {
  id: 'visita-agendada',
  fecha: '2026-09-10T20:30:00.000Z',
  duracionMin: 60,
  estado: 'agendada',
  propiedadTitulo: 'Casa Bonita',
}

const VISITA_CANCELADA: VisitaLead = {
  id: 'visita-cancelada',
  fecha: '2026-08-01T20:30:00.000Z',
  duracionMin: 30,
  estado: 'cancelada',
  propiedadTitulo: null,
}

function renderLista(visitas: VisitaLead[]) {
  return render(
    <ListaVisitasLead
      leadNombre="Carla Gómez"
      telefono="528100000000"
      asesorNombre="Luis"
      visitas={visitas}
    />
  )
}

describe('ListaVisitasLead', () => {
  it('sin visitas, muestra el estado vacío', () => {
    renderLista([])
    expect(screen.getByText(/sin visitas agendadas/i)).toBeInTheDocument()
  })

  it('distingue agendadas (con acciones) de canceladas (sin acciones)', () => {
    renderLista([VISITA_AGENDADA, VISITA_CANCELADA])

    const filaAgendada = screen.getByText('Casa Bonita').closest('li')!
    expect(within(filaAgendada).getByRole('button', { name: /reagendar/i })).toBeInTheDocument()
    expect(within(filaAgendada).getByRole('button', { name: /^cancelar$/i })).toBeInTheDocument()
    expect(filaAgendada).toHaveAttribute('data-visita', 'agendada')

    const filas = screen.getAllByRole('listitem')
    const filaCancelada = filas.find((f) => f.getAttribute('data-visita') === 'cancelada')!
    expect(filaCancelada).toBeInTheDocument()
    expect(within(filaCancelada).queryByRole('button', { name: /reagendar/i })).not.toBeInTheDocument()
    expect(within(filaCancelada).queryByRole('button', { name: /^cancelar$/i })).not.toBeInTheDocument()
  })

  it('cancelar EXIGE confirmación: tocar «Cancelar» no llama a cancelarVisita hasta confirmar', async () => {
    mockCancelarVisita.mockResolvedValue({ ok: true })
    renderLista([VISITA_AGENDADA])

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))

    // El diálogo de confirmación aparece; la action NO se ha llamado todavía.
    expect(await screen.findByRole('heading', { name: /^cancelar visita$/i })).toBeInTheDocument()
    expect(mockCancelarVisita).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar visita/i }))

    await vi.waitFor(() => {
      expect(mockCancelarVisita).toHaveBeenCalledWith('visita-agendada')
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Visita cancelada')
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('«Volver» en el diálogo de confirmación NO cancela la visita', async () => {
    renderLista([VISITA_AGENDADA])

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(await screen.findByRole('button', { name: /volver/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /volver/i }))

    expect(mockCancelarVisita).not.toHaveBeenCalled()
  })

  it('«Reagendar» abre la hoja compartida precargada y llama a reagendarVisita al confirmar', async () => {
    mockReagendarVisita.mockResolvedValue({ ok: true })
    renderLista([VISITA_AGENDADA])

    fireEvent.click(screen.getByRole('button', { name: /reagendar/i }))

    expect(await screen.findByRole('heading', { name: /reagendar visita/i })).toBeInTheDocument()
    // Precargada con la fecha/hora ACTUAL de la visita (2026-09-10T20:30:00.000Z
    // == 2026-09-10 14:30 en America/Monterrey).
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-10')
    expect(screen.getByLabelText('Hora')).toHaveValue('14:30')

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-25' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar cambio/i }))

    await vi.waitFor(() => {
      expect(mockReagendarVisita).toHaveBeenCalledTimes(1)
    })
    const [visitaId, datos] = mockReagendarVisita.mock.calls[0]
    expect(visitaId).toBe('visita-agendada')
    expect(datos.duracionMin).toBe(60)
  })
})
