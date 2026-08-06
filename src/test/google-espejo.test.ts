// @vitest-environment node
/**
 * Tests TDD para el espejo de visitas en Google Calendar (Task 8):
 * `src/lib/google/espejo.ts` — `idEventoDeVisita`, `construirEvento` y
 * `sincronizarVisita`.
 *
 * Google está TOTALMENTE mockeado: `sincronizarVisita` recibe el cliente de
 * Calendar por inyección de dependencias (`crearClienteCalendar`), así que
 * ni siquiera hace falta mockear el paquete `@googleapis/calendar` — se
 * inyecta un fake que expone solo `events.insert/patch/delete/update`. Mismo
 * criterio que `src/test/google-conexiones.test.ts`: se mockea
 * 'server-only' completo (revienta fuera de la condición "react-server") y
 * los módulos de los que depende `espejo.ts` (`@/lib/supabase/admin`,
 * `@/lib/google/conexiones`, `@/lib/google/oauth`, `@/lib/push/enviar`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}))

const {
  obtenerConexionMock,
  obtenerRefreshTokenDescifradoMock,
  marcarRevocadaMock,
} = vi.hoisted(() => ({
  obtenerConexionMock: vi.fn(),
  obtenerRefreshTokenDescifradoMock: vi.fn(),
  marcarRevocadaMock: vi.fn(),
}))
vi.mock('@/lib/google/conexiones', () => ({
  obtenerConexion: obtenerConexionMock,
  obtenerRefreshTokenDescifrado: obtenerRefreshTokenDescifradoMock,
  marcarRevocada: marcarRevocadaMock,
}))

// La clase se define dentro de vi.hoisted para poder usarla TANTO en la
// factory del mock COMO en los tests (que necesitan lanzar instancias) sin
// chocar con el TDZ de vi.mock.
const { ErrorGrantInvalidoFake, refrescarAccessTokenMock } = vi.hoisted(() => {
  class ErrorGrantInvalidoFake extends Error {
    constructor() {
      super('invalid_grant de prueba')
      this.name = 'ErrorGrantInvalido'
    }
  }
  return { ErrorGrantInvalidoFake, refrescarAccessTokenMock: vi.fn() }
})
vi.mock('@/lib/google/oauth', () => ({
  ErrorGrantInvalido: ErrorGrantInvalidoFake,
  refrescarAccessToken: refrescarAccessTokenMock,
}))

const { enviarPushMock } = vi.hoisted(() => ({
  enviarPushMock: vi.fn(),
}))
vi.mock('@/lib/push/enviar', () => ({
  enviarPush: enviarPushMock,
}))

import {
  construirEvento,
  idEventoDeVisita,
  sincronizarVisita,
  type ClienteCalendarMinimo,
} from '@/lib/google/espejo'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub chainable de `createAdminClient()` para la tabla `visitas`: select().eq().maybeSingle() y update().eq(). */
function crearSupabaseFake(visitaRow: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: visitaRow, error: null })
  const eqSelect = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqSelect }))

  const updateCalls: Record<string, unknown>[] = []
  const eqUpdate = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn((cambios: Record<string, unknown>) => {
    updateCalls.push(cambios)
    return { eq: eqUpdate }
  })

  const from = vi.fn((table: string) => {
    if (table !== 'visitas') throw new Error(`tabla inesperada en el stub: ${table}`)
    return { select, update }
  })

  return {
    supabase: { from } as unknown as ReturnType<typeof createAdminClientMock>,
    from,
    select,
    eqSelect,
    maybeSingle,
    update,
    eqUpdate,
    updateCalls,
  }
}

function crearClienteFake(): { events: ClienteCalendarMinimo['events'] } {
  return {
    events: {
      insert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  }
}

function errorConStatus(status: number): unknown {
  return { response: { status } }
}

const LEAD = { id: 'lead-1', nombre: 'Ana Pérez', telefono: '5599000001' }
const AHORA = new Date('2026-01-01T00:00:00.000Z')

function visitaAgendarSinEvento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'visita-1',
    fecha: '2026-03-10T20:00:00.000Z',
    duracion_min: 60,
    estado: 'agendada',
    asesor_id: 'asesor-1',
    gcal_event_id: null,
    lead: LEAD,
    propiedad: null,
    ...overrides,
  }
}

beforeEach(() => {
  createAdminClientMock.mockReset()
  obtenerConexionMock.mockReset()
  obtenerRefreshTokenDescifradoMock.mockReset()
  marcarRevocadaMock.mockReset()
  refrescarAccessTokenMock.mockReset()
  enviarPushMock.mockReset()

  obtenerConexionMock.mockResolvedValue({
    googleEmail: 'asesor@gmail.com',
    estado: 'activa',
    creadaEn: '2026-01-01T00:00:00.000Z',
    actualizadaEn: '2026-01-01T00:00:00.000Z',
  })
  obtenerRefreshTokenDescifradoMock.mockResolvedValue('refresh-token-x')
  refrescarAccessTokenMock.mockResolvedValue('access-token-x')
  enviarPushMock.mockResolvedValue({ enviados: 1 })
})

// ---------------------------------------------------------------------------
// idEventoDeVisita
// ---------------------------------------------------------------------------

describe('idEventoDeVisita', () => {
  it('es determinista: el mismo visitaId siempre produce el mismo id', () => {
    const id1 = idEventoDeVisita('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    const id2 = idEventoDeVisita('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(id1).toBe(id2)
  })

  it('cumple el charset requerido por la API (base32hex minúscula, a-v0-9)', () => {
    const id = idEventoDeVisita('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')
    expect(id).toMatch(/^[a-v0-9]+$/)
    expect(id.length).toBeGreaterThanOrEqual(5)
    expect(id.length).toBeLessThanOrEqual(1024)
  })

  it('ids de visitas distintas producen ids de evento distintos', () => {
    const id1 = idEventoDeVisita('11111111-1111-1111-1111-111111111111')
    const id2 = idEventoDeVisita('22222222-2222-2222-2222-222222222222')
    expect(id1).not.toBe(id2)
  })
})

// ---------------------------------------------------------------------------
// construirEvento
// ---------------------------------------------------------------------------

describe('construirEvento', () => {
  const VISITA = { id: 'visita-1', fecha: '2026-03-10T20:00:00.000Z', duracionMin: 60 }

  it('start/end respetan la fecha, la duración y America/Monterrey como timeZone', () => {
    const evento = construirEvento(VISITA, LEAD, null)

    expect(evento.start).toEqual({ dateTime: '2026-03-10T20:00:00.000Z', timeZone: 'America/Monterrey' })
    expect(evento.end).toEqual({ dateTime: '2026-03-10T21:00:00.000Z', timeZone: 'America/Monterrey' })
  })

  it('summary incluye el nombre del lead', () => {
    const evento = construirEvento(VISITA, LEAD, null)
    expect(evento.summary).toBe('Visita — Ana Pérez')
  })

  it('la descripción incluye el teléfono del lead y el link a Klo-Ser (con www)', () => {
    const evento = construirEvento(VISITA, LEAD, null)
    expect(evento.description).toContain('5599000001')
    expect(evento.description).toContain('https://www.klo-ser.com/asesor/leads/lead-1')
  })

  it('con propiedad, la descripción la incluye', () => {
    const evento = construirEvento(VISITA, LEAD, { titulo: 'Casa en Cumbres' })
    expect(evento.description).toContain('Casa en Cumbres')
  })

  it('sin propiedad, la descripción no menciona propiedad y no deja renglones colgando', () => {
    const evento = construirEvento(VISITA, LEAD, null)
    expect(evento.description).not.toContain('Propiedad')
    expect(evento.description).not.toContain('\n\n')
    expect(evento.description?.endsWith('\n')).toBe(false)
  })

  it('sin teléfono, no deja un renglón "Teléfono: " vacío', () => {
    const evento = construirEvento(VISITA, { ...LEAD, telefono: null }, null)
    expect(evento.description).not.toContain('Teléfono')
  })

  it('extendedProperties.private.visitaId permite la búsqueda inversa', () => {
    const evento = construirEvento(VISITA, LEAD, null)
    expect(evento.extendedProperties?.private?.visitaId).toBe('visita-1')
  })

  it('nunca incluye attendees (es un espejo, no invita a nadie)', () => {
    const evento = construirEvento(VISITA, LEAD, null)
    expect(evento.attendees).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sincronizarVisita
// ---------------------------------------------------------------------------

describe('sincronizarVisita', () => {
  it('asesor sin conexión activa: marca sin_conexion y NO llama a Google', async () => {
    obtenerConexionMock.mockResolvedValue(null)
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sin_conexion' })
    expect(refrescarAccessTokenMock).not.toHaveBeenCalled()
    expect(cliente.events.insert).not.toHaveBeenCalled()
  })

  it('asesor con conexión revocada: también marca sin_conexion', async () => {
    obtenerConexionMock.mockResolvedValue({
      googleEmail: 'a@gmail.com',
      estado: 'revocada',
      creadaEn: '2026-01-01T00:00:00.000Z',
      actualizadaEn: '2026-01-01T00:00:00.000Z',
    })
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)

    await sincronizarVisita('visita-1', { ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sin_conexion' })
  })

  it('crear: insert exitoso guarda gcal_event_id y marca sincronizada', async () => {
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    const eventId = idEventoDeVisita('visita-1')
    expect(cliente.events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        requestBody: expect.objectContaining({ id: eventId }),
        sendUpdates: 'none',
      })
    )
    expect(fake.update).toHaveBeenCalledWith({
      gcal_sync_estado: 'sincronizada',
      gcal_ultimo_error: null,
      gcal_event_id: eventId,
    })
  })

  it('crear con 409 (ya existe): repone status confirmed vía update y lo trata como ÉXITO', async () => {
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()
    ;(cliente.events.insert as ReturnType<typeof vi.fn>).mockRejectedValue(errorConStatus(409))

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    const eventId = idEventoDeVisita('visita-1')
    expect(cliente.events.update).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        eventId,
        requestBody: expect.objectContaining({ status: 'confirmed' }),
        sendUpdates: 'none',
      })
    )
    expect(fake.update).toHaveBeenCalledWith({
      gcal_sync_estado: 'sincronizada',
      gcal_ultimo_error: null,
      gcal_event_id: eventId,
    })
  })

  it('reagendar: hace patch del evento existente y marca sincronizada', async () => {
    const fake = crearSupabaseFake(
      visitaAgendarSinEvento({ gcal_event_id: 'visita-evento-1', fecha: '2026-04-01T15:00:00.000Z' })
    )
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(cliente.events.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        eventId: 'visita-evento-1',
        requestBody: expect.objectContaining({
          start: { dateTime: '2026-04-01T15:00:00.000Z', timeZone: 'America/Monterrey' },
        }),
        sendUpdates: 'none',
      })
    )
    expect(cliente.events.insert).not.toHaveBeenCalled()
    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sincronizada', gcal_ultimo_error: null })
  })

  it('cancelar con evento existente: delete exitoso marca sincronizada', async () => {
    const fake = crearSupabaseFake(
      visitaAgendarSinEvento({ estado: 'cancelada', gcal_event_id: 'visita-evento-1' })
    )
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(cliente.events.delete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'visita-evento-1',
      sendUpdates: 'none',
    })
    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sincronizada', gcal_ultimo_error: null })
  })

  it.each([404, 410])(
    'cancelar: delete que responde %i (evento ya no existe) se trata como ÉXITO',
    async (status) => {
      const fake = crearSupabaseFake(
        visitaAgendarSinEvento({ estado: 'cancelada', gcal_event_id: 'visita-evento-1' })
      )
      createAdminClientMock.mockReturnValue(fake.supabase)
      const cliente = crearClienteFake()
      ;(cliente.events.delete as ReturnType<typeof vi.fn>).mockRejectedValue(errorConStatus(status))

      await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

      expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sincronizada', gcal_ultimo_error: null })
    }
  )

  it('cancelada que nunca llegó a sincronizarse (sin gcal_event_id): marca sincronizada SIN llamar a Google', async () => {
    const fake = crearSupabaseFake(visitaAgendarSinEvento({ estado: 'cancelada', gcal_event_id: null }))
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sincronizada', gcal_ultimo_error: null })
    expect(obtenerConexionMock).not.toHaveBeenCalled()
    expect(cliente.events.delete).not.toHaveBeenCalled()
  })

  it('reagendar con 404 en el patch (el asesor borró el evento a mano): limpia gcal_event_id y queda pendiente para recrear', async () => {
    const fake = crearSupabaseFake(
      visitaAgendarSinEvento({ gcal_event_id: 'visita-evento-fantasma', fecha: '2026-04-01T15:00:00.000Z' })
    )
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()
    ;(cliente.events.patch as ReturnType<typeof vi.fn>).mockRejectedValue(errorConStatus(404))

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith({
      gcal_event_id: null,
      gcal_sync_estado: 'pendiente',
      gcal_proximo_intento: new Date(AHORA.getTime() + 60_000).toISOString(),
      gcal_ultimo_error: expect.any(String),
    })
    // No es un fallo agotado (no confundir con dead letter del cron): sigue pendiente, no error.
    expect(fake.updateCalls.some((c) => c.gcal_sync_estado === 'error')).toBe(false)
  })

  it('fallo de red al refrescar el access token: marca pendiente con próximo intento ~1 min después', async () => {
    refrescarAccessTokenMock.mockRejectedValue(new Error('ECONNRESET'))
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)

    await sincronizarVisita('visita-1', { ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith({
      gcal_sync_estado: 'pendiente',
      gcal_proximo_intento: new Date(AHORA.getTime() + 60_000).toISOString(),
      gcal_ultimo_error: 'ECONNRESET',
    })
  })

  it('fallo 5xx/429 al llamar a la Calendar API: marca pendiente (no ErrorGrantInvalido)', async () => {
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)
    const cliente = crearClienteFake()
    ;(cliente.events.insert as ReturnType<typeof vi.fn>).mockRejectedValue(errorConStatus(500))

    await sincronizarVisita('visita-1', { crearClienteCalendar: () => cliente, ahora: AHORA })

    expect(fake.update).toHaveBeenCalledWith(
      expect.objectContaining({ gcal_sync_estado: 'pendiente', gcal_proximo_intento: expect.any(String) })
    )
    expect(marcarRevocadaMock).not.toHaveBeenCalled()
  })

  it('ErrorGrantInvalido al refrescar: terminal — marca revocada, notifica por push y deja la visita sin_conexion (NO reintenta)', async () => {
    refrescarAccessTokenMock.mockRejectedValue(new ErrorGrantInvalidoFake())
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)

    await sincronizarVisita('visita-1', { ahora: AHORA })

    expect(marcarRevocadaMock).toHaveBeenCalledWith('asesor-1')
    expect(enviarPushMock).toHaveBeenCalledWith(
      expect.anything(),
      'asesor-1',
      expect.objectContaining({ titulo: expect.any(String), cuerpo: expect.any(String) })
    )
    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sin_conexion' })
    // Nunca queda "pendiente": es terminal, no se reintenta.
    expect(fake.updateCalls.some((c) => c.gcal_sync_estado === 'pendiente')).toBe(false)
  })

  it('el refresh token no se puede descifrar (token perdido/corrupto): mismo tratamiento terminal', async () => {
    obtenerRefreshTokenDescifradoMock.mockRejectedValue(new Error('token corrupto'))
    const fake = crearSupabaseFake(visitaAgendarSinEvento())
    createAdminClientMock.mockReturnValue(fake.supabase)

    await sincronizarVisita('visita-1', { ahora: AHORA })

    expect(marcarRevocadaMock).toHaveBeenCalledWith('asesor-1')
    expect(enviarPushMock).toHaveBeenCalled()
    expect(fake.update).toHaveBeenCalledWith({ gcal_sync_estado: 'sin_conexion' })
  })
})
