// @vitest-environment jsdom
/**
 * Tests TDD para HojaAsignarLead (Task FM7): botón píldora «Asignar» de la
 * bandeja móvil que abre un Sheet inferior con la lista de asesores activos
 * como filas táctiles. Adapta la lógica de <AsignarLead> (misma server
 * action `asignarLead`, mismo patrón de toast) a formato hoja.
 *
 * Se mockea '@/lib/leads/acciones' porque arrastra 'server-only' (vía
 * requireAdmin -> usuario-actual.ts) — mismo motivo que
 * banner-instalacion-componente.test.tsx mockea '@/lib/push/acciones'.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockAsignarLead = vi.fn()
vi.mock('@/lib/leads/acciones', () => ({
  asignarLead: (...args: unknown[]) => mockAsignarLead(...args),
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

import { HojaAsignarLead } from '@/components/leads/hoja-asignar-lead'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ASESORES = [
  { userId: 'asesor-1', nombre: 'Ana Pérez' },
  { userId: 'asesor-2', nombre: 'Bruno Ruiz' },
]

describe('HojaAsignarLead', () => {
  it('el botón «Asignar» abre la hoja con los asesores activos', async () => {
    render(<HojaAsignarLead leadId="lead-1" leadNombre="Carla Gómez" asesores={ASESORES} />)

    fireEvent.click(screen.getByRole('button', { name: /asignar carla gómez/i }))

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Bruno Ruiz')).toBeInTheDocument()
  })

  it('tocar un asesor llama a asignarLead con (leadId, asesorId)', async () => {
    mockAsignarLead.mockResolvedValue({ ok: true })
    render(<HojaAsignarLead leadId="lead-1" leadNombre="Carla Gómez" asesores={ASESORES} />)

    fireEvent.click(screen.getByRole('button', { name: /asignar carla gómez/i }))
    fireEvent.click(await screen.findByText('Ana Pérez'))

    expect(mockAsignarLead).toHaveBeenCalledWith('lead-1', 'asesor-1')
  })

  it('al asignar con éxito, muestra el toast y cierra la hoja', async () => {
    mockAsignarLead.mockResolvedValue({ ok: true })
    render(<HojaAsignarLead leadId="lead-1" leadNombre="Carla Gómez" asesores={ASESORES} />)

    fireEvent.click(screen.getByRole('button', { name: /asignar carla gómez/i }))
    fireEvent.click(await screen.findByText('Ana Pérez'))

    // La hoja se cierra: el texto del asesor deja de estar en el documento.
    await vi.waitFor(() => {
      expect(screen.queryByText('Bruno Ruiz')).not.toBeInTheDocument()
    })
    expect(mockToastSuccess).toHaveBeenCalledWith('Carla Gómez asignado a Ana Pérez')
  })

  it('si asignarLead responde con error, muestra el toast de error y NO cierra la hoja', async () => {
    mockAsignarLead.mockResolvedValue({ error: 'Este lead ya fue asignado' })
    render(<HojaAsignarLead leadId="lead-1" leadNombre="Carla Gómez" asesores={ASESORES} />)

    fireEvent.click(screen.getByRole('button', { name: /asignar carla gómez/i }))
    fireEvent.click(await screen.findByText('Ana Pérez'))

    await vi.waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Este lead ya fue asignado')
    })
    expect(screen.getByText('Bruno Ruiz')).toBeInTheDocument()
  })

  it('mientras la asignación está en curso, deshabilita las filas y muestra «Asignando…»; al resolver, se reactivan', async () => {
    // Se resuelve con error (en vez de éxito) a propósito: así la hoja NO
    // se cierra al resolver y se puede verificar que las filas vuelven a
    // estar habilitadas, en vez de que el caso quede oculto por el
    // desmontaje que provoca el camino de éxito.
    let resolverPromesa: (resultado: { error: string }) => void
    const promesaPendiente = new Promise<{ error: string }>((resolve) => {
      resolverPromesa = resolve
    })
    mockAsignarLead.mockReturnValue(promesaPendiente)

    render(<HojaAsignarLead leadId="lead-1" leadNombre="Carla Gómez" asesores={ASESORES} />)

    fireEvent.click(screen.getByRole('button', { name: /asignar carla gómez/i }))
    fireEvent.click(await screen.findByText('Ana Pérez'))

    // Mientras la promesa no resuelve: ambas filas deshabilitadas y la fila
    // tocada muestra «Asignando…».
    await vi.waitFor(() => {
      expect(screen.getByText('Ana Pérez').closest('button')).toBeDisabled()
    })
    expect(screen.getByText('Bruno Ruiz').closest('button')).toBeDisabled()
    expect(screen.getByText('Asignando…')).toBeInTheDocument()

    resolverPromesa!({ error: 'Este lead ya fue asignado' })

    // Al resolver, las filas se reactivan y el indicador desaparece.
    await vi.waitFor(() => {
      expect(screen.getByText('Ana Pérez').closest('button')).not.toBeDisabled()
    })
    expect(screen.getByText('Bruno Ruiz').closest('button')).not.toBeDisabled()
    expect(screen.queryByText('Asignando…')).not.toBeInTheDocument()
  })
})
