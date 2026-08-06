// @vitest-environment jsdom
/**
 * Tests TDD para HojaAgendarVisita (Task 3): bottom sheet «Agendar visita»
 * en la barra de acciones del lead, junto al botón de WhatsApp. Se mockea
 * '@/lib/visitas/acciones' porque arrastra 'server-only' (vía
 * usuarioActual -> createClient) — mismo motivo que
 * hoja-asignar-lead.test.tsx mockea '@/lib/leads/acciones'.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockAgendarVisita = vi.fn()
vi.mock('@/lib/visitas/acciones', () => ({
  agendarVisita: (...args: unknown[]) => mockAgendarVisita(...args),
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

import { HojaAgendarVisita } from '@/components/visitas/hoja-agendar-visita'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function abrirYLlenar() {
  fireEvent.click(screen.getByRole('button', { name: /^agendar visita$/i }))
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-15' } })
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '14:30' } })
}

describe('HojaAgendarVisita', () => {
  it('el botón «Agendar visita» abre la hoja con fecha, hora y duración', () => {
    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId={null}
        propiedadLeadTitulo={null}
        propiedades={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^agendar visita$/i }))

    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar visita/i })).toBeInTheDocument()
  })

  it('sin propiedad en el lead, ofrece el combobox de propiedad opcional', () => {
    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId={null}
        propiedadLeadTitulo={null}
        propiedades={[{ id: 'prop-1', titulo: 'Casa Bonita' }]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^agendar visita$/i }))
    expect(screen.getByLabelText(/propiedad \(opcional\)/i)).toBeInTheDocument()
  })

  it('con propiedad ya asignada al lead, NO pide propiedad', () => {
    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId="prop-1"
        propiedadLeadTitulo="Casa Bonita"
        propiedades={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /^agendar visita$/i }))
    expect(screen.queryByLabelText(/propiedad \(opcional\)/i)).not.toBeInTheDocument()
  })

  it('al enviar, llama a agendarVisita con leadId, propiedadId, duración y fecha convertida a ISO con offset', async () => {
    mockAgendarVisita.mockResolvedValue({ ok: true, visitaId: 'visita-1' })

    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId="prop-1"
        propiedadLeadTitulo="Casa Bonita"
        propiedades={[]}
      />
    )

    abrirYLlenar()
    fireEvent.click(screen.getByRole('button', { name: /confirmar visita/i }))

    await vi.waitFor(() => {
      expect(mockAgendarVisita).toHaveBeenCalledTimes(1)
    })

    const [datos] = mockAgendarVisita.mock.calls[0]
    expect(datos.leadId).toBe('lead-1')
    expect(datos.propiedadId).toBe('prop-1')
    expect(datos.duracionMin).toBe(60) // DURACION_MIN_DEFAULT

    // El input NO lleva offset: "2026-09-15" + "14:30" se interpretan como
    // hora de America/Monterrey (UTC-6, sin horario de verano), NUNCA como
    // hora del dispositivo que corre la prueba — literal fijo, no
    // recalculado con la misma fórmula de la implementación, para que un
    // regreso a "hora local del dispositivo" sí reviente este test.
    expect(datos.fecha).toBe('2026-09-15T20:30:00.000Z')
  })

  it('al agendar con éxito, el toast ofrece «Confirmar por WhatsApp» y refresca', async () => {
    mockAgendarVisita.mockResolvedValue({ ok: true, visitaId: 'visita-1' })

    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId="prop-1"
        propiedadLeadTitulo="Casa Bonita"
        propiedades={[]}
      />
    )

    abrirYLlenar()
    fireEvent.click(screen.getByRole('button', { name: /confirmar visita/i }))

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledTimes(1)
    })

    const [, opciones] = mockToastSuccess.mock.calls[0]
    expect(opciones.action.label).toBe('Confirmar por WhatsApp')

    // Tocar la acción del toast abre wa.me con el mensaje prellenado —
    // nunca se abre solo, siempre es una acción explícita del asesor.
    opciones.action.onClick()
    expect(mockOpen).toHaveBeenCalledTimes(1)
    const [url] = mockOpen.mock.calls[0]
    expect(url).toContain('https://wa.me/528100000000?text=')
    expect(decodeURIComponent(url.split('?text=')[1])).toContain('Casa Bonita')

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('sin teléfono, el toast de éxito no ofrece la acción de WhatsApp', async () => {
    mockAgendarVisita.mockResolvedValue({ ok: true, visitaId: 'visita-1' })

    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono={null}
        asesorNombre="Luis"
        propiedadLeadId="prop-1"
        propiedadLeadTitulo="Casa Bonita"
        propiedades={[]}
      />
    )

    abrirYLlenar()
    fireEvent.click(screen.getByRole('button', { name: /confirmar visita/i }))

    await vi.waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledTimes(1)
    })
    const [, opciones] = mockToastSuccess.mock.calls[0]
    expect(opciones.action).toBeUndefined()
  })

  it('si agendarVisita responde con error, lo muestra y NO cierra la hoja', async () => {
    mockAgendarVisita.mockResolvedValue({ error: 'La fecha debe ser futura' })

    render(
      <HojaAgendarVisita
        leadId="lead-1"
        leadNombre="Carla Gómez"
        telefono="528100000000"
        asesorNombre="Luis"
        propiedadLeadId="prop-1"
        propiedadLeadTitulo="Casa Bonita"
        propiedades={[]}
      />
    )

    abrirYLlenar()
    fireEvent.click(screen.getByRole('button', { name: /confirmar visita/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha debe ser futura')
    // La hoja sigue abierta: el campo de fecha sigue en el documento.
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })
})
