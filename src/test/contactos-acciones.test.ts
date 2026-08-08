// @vitest-environment node
/**
 * Tests de `registrarSalidaWhatsapp` y `resolverContacto`
 * (src/lib/contactos/acciones.ts): las dos mitades del viaje a WhatsApp — la
 * salida y el reporte de cómo fue. Cubre el dedupe de 5 minutos, la
 * degradación de pendientes viejos a `sin_reporte`, el seguimiento que se
 * escribe SIEMPRE, el corte por rol y qué desenlace mueve (o no) la etapa.
 *
 * Mismo andamiaje de mocks que src/test/visitas-acciones.test.ts: se mockean
 * '@/lib/auth/usuario-actual' (el real importa 'server-only'),
 * '@/lib/supabase/server' y 'next/cache' — sin este último, revalidatePath()
 * lanza «Invariant: static generation store missing» fuera de un request de
 * Next y truenan TODOS los casos por más correcta que sea la lógica.
 *
 * `avanzarEtapaPorEvento` NO se mockea: es el código real, ejerciéndose
 * contra el mismo stub de Supabase, para que el avance quede probado de
 * punta a punta.
 *
 * `cambiarEtapa` SÍ se mockea: vive en un módulo 'use server' que llama a
 * requireAsesor(), el cual puede `redirect()`. Lo que importa aquí es que
 * `resolverContacto` la invoque con el destino correcto, no re-probar el
 * cierre (eso ya lo cubren los tests de acciones-asesor).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { usuarioActualMock } = vi.hoisted(() => ({
  usuarioActualMock: vi.fn(),
}))

vi.mock('@/lib/auth/usuario-actual', () => ({
  usuarioActual: usuarioActualMock,
}))

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const { revalidatePathMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

const { cambiarEtapaMock } = vi.hoisted(() => ({
  cambiarEtapaMock: vi.fn(),
}))

vi.mock('@/lib/leads/acciones-asesor', () => ({
  cambiarEtapa: cambiarEtapaMock,
}))

import { registrarSalidaWhatsapp, resolverContacto } from '@/lib/contactos/acciones'

interface ErrorFake {
  message: string
}

const USUARIO_ASESOR = {
  user_id: 'asesor-1',
  agencia_id: 'agencia-1',
  rol: 'asesor' as const,
  nombre: 'La Asesora',
  telefono: null,
  foto: null,
  activo: true,
}

const USUARIO_ADMIN = {
  ...USUARIO_ASESOR,
  user_id: 'admin-1',
  rol: 'admin' as const,
  nombre: 'El Admin',
}

const HACE_2_MIN = new Date(Date.now() - 2 * 60 * 1000).toISOString()
const HACE_2_HORAS = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

/**
 * Stub chainable del flujo completo de `registrarSalidaWhatsapp`:
 *   seguimientos:       insert()                      (awaited directo)
 *   contactos_whatsapp: select().eq().eq()            (awaited directo)
 *   contactos_whatsapp: update().eq().eq()            (awaited directo)
 *   contactos_whatsapp: insert()                      (awaited directo)
 *   leads:              select('etapa').eq().maybeSingle()
 *   leads:              update({etapa}).eq().eq().eq().select('id')  — avance
 */
function crearSupabaseFake(opts: {
  pendientes?: { id: string; creado_en: string }[]
  etapaLead?: string | null
  seguimientoError?: ErrorFake | null
  contactoError?: ErrorFake | null
  updateContactoError?: ErrorFake | null
  filasAvance?: { id: string }[]
}) {
  const insertSeguimiento = vi
    .fn<(valores: Record<string, unknown>) => Promise<{ error: ErrorFake | null }>>()
    .mockResolvedValue({ error: opts.seguimientoError ?? null })

  // select de pendientes: .select().eq().eq() → resuelve
  const eqSelectResultado = vi
    .fn()
    .mockResolvedValue({ data: opts.pendientes ?? [], error: null })
  const eqSelectLead = vi.fn(() => ({ eq: eqSelectResultado }))
  const selectContactos = vi.fn(() => ({ eq: eqSelectLead }))

  // update de pendientes viejos: .update().eq().eq() → resuelve
  const eqUpdateResultado = vi
    .fn()
    .mockResolvedValue({ data: null, error: opts.updateContactoError ?? null })
  const eqUpdateLead = vi.fn(() => ({ eq: eqUpdateResultado }))
  const updateContactos = vi.fn<
    (valores: Record<string, unknown>) => { eq: typeof eqUpdateLead }
  >(() => ({ eq: eqUpdateLead }))

  const insertContacto = vi
    .fn<(valores: Record<string, unknown>) => Promise<{ error: ErrorFake | null }>>()
    .mockResolvedValue({ error: opts.contactoError ?? null })

  // leads: select('etapa').eq('id').maybeSingle()
  const maybeSingleLead = vi.fn().mockResolvedValue({
    data:
      opts.etapaLead === null || opts.etapaLead === undefined ? null : { etapa: opts.etapaLead },
    error: null,
  })
  const eqLead = vi.fn(() => ({ maybeSingle: maybeSingleLead }))
  const selectLead = vi.fn(() => ({ eq: eqLead }))

  // Avance: leads.update({etapa}).eq('id').eq('archivado').eq('etapa').select('id')
  const selectAvance = vi
    .fn()
    .mockResolvedValue({ data: opts.filasAvance ?? [{ id: 'lead-1' }], error: null })
  const eqAvanceEtapa = vi.fn(() => ({ select: selectAvance }))
  const eqAvanceArchivado = vi.fn(() => ({ eq: eqAvanceEtapa }))
  const eqAvanceId = vi.fn(() => ({ eq: eqAvanceArchivado }))
  const updateLead = vi.fn<(valores: Record<string, unknown>) => { eq: typeof eqAvanceId }>(() => ({
    eq: eqAvanceId,
  }))

  const from = vi.fn((table: string) => {
    if (table === 'seguimientos') return { insert: insertSeguimiento }
    if (table === 'contactos_whatsapp')
      return { select: selectContactos, update: updateContactos, insert: insertContacto }
    if (table === 'leads') return { select: selectLead, update: updateLead }
    throw new Error(`tabla inesperada en el stub: ${table}`)
  })

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    insertSeguimiento,
    selectContactos,
    eqSelectLead,
    eqSelectResultado,
    updateContactos,
    eqUpdateLead,
    eqUpdateResultado,
    insertContacto,
    selectLead,
    updateLead,
    eqAvanceEtapa,
  }
}

beforeEach(() => {
  usuarioActualMock.mockReset()
  createClientMock.mockReset()
  revalidatePathMock.mockReset()
  cambiarEtapaMock.mockReset()
  usuarioActualMock.mockResolvedValue(USUARIO_ASESOR)
  cambiarEtapaMock.mockResolvedValue({ ok: true })
})

describe('registrarSalidaWhatsapp — dedupe de contactos', () => {
  it('con un pendiente de hace 2 minutos NO inserta otro contacto', async () => {
    const fake = crearSupabaseFake({
      pendientes: [{ id: 'contacto-1', creado_en: HACE_2_MIN }],
      etapaLead: 'contactado',
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ ok: true })
    expect(fake.insertContacto).not.toHaveBeenCalled()
    // Tampoco se degrada nada: ese pendiente sigue vivo y es el mismo contacto.
    expect(fake.updateContactos).not.toHaveBeenCalled()
  })

  it('con un pendiente de hace 2 horas inserta uno nuevo y degrada el viejo a sin_reporte', async () => {
    const fake = crearSupabaseFake({
      pendientes: [{ id: 'contacto-viejo', creado_en: HACE_2_HORAS }],
      etapaLead: 'contactado',
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ ok: true })

    // El viejo se degrada, filtrando por lead y por resultado='pendiente'
    // (en plural: puede haber más de uno por la carrera aceptada del spec).
    expect(fake.updateContactos).toHaveBeenCalledTimes(1)
    // Igual que el insert: el juego de columnas se fija EXACTO. El grant de
    // la tabla solo permite actualizar (resultado, resuelto_en); una tercera
    // columna truena en prod con «permission denied for column».
    const argumentoUpdate = fake.updateContactos.mock.calls[0][0]
    expect(argumentoUpdate).toEqual({
      resultado: 'sin_reporte',
      resuelto_en: expect.any(String),
    })
    expect(argumentoUpdate).not.toHaveProperty('id')
    expect(argumentoUpdate).not.toHaveProperty('lead_id')
    expect(argumentoUpdate).not.toHaveProperty('autor_id')
    expect(fake.eqUpdateLead).toHaveBeenCalledWith('lead_id', 'lead-1')
    expect(fake.eqUpdateResultado).toHaveBeenCalledWith('resultado', 'pendiente')

    // El nuevo contacto lleva SOLO (lead_id, autor_id).
    expect(fake.insertContacto).toHaveBeenCalledTimes(1)
    const argumentoInsert = fake.insertContacto.mock.calls[0][0]
    expect(argumentoInsert).toEqual({ lead_id: 'lead-1', autor_id: 'asesor-1' })
    // El grant de la tabla no incluye `resultado`: mandarlo truena en prod.
    expect(argumentoInsert).not.toHaveProperty('resultado')
    expect(argumentoInsert).not.toHaveProperty('id')
    expect(argumentoInsert).not.toHaveProperty('creado_en')
  })

  it('sin ningún pendiente inserta el contacto y no intenta degradar nada', async () => {
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'contactado' })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ ok: true })
    expect(fake.insertContacto).toHaveBeenCalledWith({ lead_id: 'lead-1', autor_id: 'asesor-1' })
    expect(fake.updateContactos).not.toHaveBeenCalled()
  })

  it('aunque el dedupe suprima el contacto, el seguimiento SÍ se escribe (el timeline no pierde el toque)', async () => {
    const fake = crearSupabaseFake({
      pendientes: [{ id: 'contacto-1', creado_en: HACE_2_MIN }],
      etapaLead: 'contactado',
    })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', {})

    expect(fake.insertContacto).not.toHaveBeenCalled()
    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        autor_id: 'asesor-1',
        tipo: 'whatsapp',
      })
    )
  })

  it('varios pendientes viejos: un solo update los degrada a todos por filtro, no de a uno', async () => {
    const fake = crearSupabaseFake({
      pendientes: [
        { id: 'contacto-a', creado_en: HACE_2_HORAS },
        { id: 'contacto-b', creado_en: HACE_2_HORAS },
      ],
      etapaLead: 'contactado',
    })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', {})

    expect(fake.updateContactos).toHaveBeenCalledTimes(1)
    expect(fake.insertContacto).toHaveBeenCalledTimes(1)
  })
})

describe('registrarSalidaWhatsapp — nota del seguimiento', () => {
  it('con plantilla escribe la nota con el nombre entre comillas', async () => {
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'contactado' })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', { nombrePlantilla: 'Primer contacto' })

    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({ nota: 'Se envió plantilla "Primer contacto"' })
    )
  })

  it('sin plantilla escribe la nota de mensaje directo', async () => {
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'contactado' })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', { nombrePlantilla: null })

    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({ nota: 'Mensaje directo por WhatsApp' })
    )
  })
})

describe('registrarSalidaWhatsapp — corte por rol', () => {
  it('un admin deja seguimiento pero NO crea contacto pendiente ni mueve la etapa', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO_ADMIN)
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'nuevo' })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ ok: true })
    expect(fake.insertSeguimiento).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'whatsapp', autor_id: 'admin-1' })
    )
    expect(fake.selectContactos).not.toHaveBeenCalled()
    expect(fake.insertContacto).not.toHaveBeenCalled()
    expect(fake.updateLead).not.toHaveBeenCalled()
  })
})

describe('registrarSalidaWhatsapp — avance de etapa y errores', () => {
  it('un lead «nuevo» avanza a «contactado» y queda registrado en el timeline', async () => {
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'nuevo' })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', {})

    expect(fake.updateLead).toHaveBeenCalledWith({ etapa: 'contactado' })
    // Guarda contra carreras: el update se ancla a la etapa que leímos.
    expect(fake.eqAvanceEtapa).toHaveBeenCalledWith('etapa', 'nuevo')
    // Dos seguimientos: el del WhatsApp y el del avance de etapa.
    expect(fake.insertSeguimiento).toHaveBeenCalledTimes(2)
    expect(fake.insertSeguimiento).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tipo: 'sistema',
        nota: 'Etapa movida a «Contactado» al enviar un WhatsApp',
      })
    )
  })

  it('un lead en «negociacion» no retrocede al mandarle WhatsApp', async () => {
    const fake = crearSupabaseFake({ pendientes: [], etapaLead: 'negociacion' })
    createClientMock.mockResolvedValue(fake.supabase)

    await registrarSalidaWhatsapp('lead-1', {})

    expect(fake.updateLead).not.toHaveBeenCalled()
    expect(fake.insertSeguimiento).toHaveBeenCalledTimes(1)
  })

  it('si el seguimiento falla, devuelve error y no toca los contactos', async () => {
    const fake = crearSupabaseFake({
      pendientes: [],
      etapaLead: 'nuevo',
      seguimientoError: { message: 'boom' },
    })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ error: 'No se pudo registrar el seguimiento' })
    expect(fake.selectContactos).not.toHaveBeenCalled()
    expect(fake.updateLead).not.toHaveBeenCalled()
  })

  it('si el insert del contacto falla, la salida a WhatsApp igual se reporta ok (best-effort)', async () => {
    const fake = crearSupabaseFake({
      pendientes: [],
      etapaLead: 'nuevo',
      contactoError: { message: 'permiso denegado' },
    })
    createClientMock.mockResolvedValue(fake.supabase)
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ ok: true })
    // El avance de etapa no se cancela por un contacto perdido.
    expect(fake.updateLead).toHaveBeenCalledWith({ etapa: 'contactado' })
    consola.mockRestore()
  })

  it('sin sesión válida no toca la base', async () => {
    usuarioActualMock.mockResolvedValue(null)
    const fake = crearSupabaseFake({ pendientes: [] })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await registrarSalidaWhatsapp('lead-1', {})

    expect(resultado).toEqual({ error: 'Tu sesión no es válida' })
    expect(fake.from).not.toHaveBeenCalled()
  })
})

describe('resolverContacto — validación y corte por rol', () => {
  it('un desenlace inventado no toca nada', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'lo_que_sea')

    expect(resultado).toEqual({ error: 'El desenlace no es válido' })
    expect(fake.from).not.toHaveBeenCalled()
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
  })

  it('«sin_reporte» tampoco es elegible: lo pone el sistema, no el asesor', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'sin_reporte')

    expect(resultado).toEqual({ error: 'El desenlace no es válido' })
    expect(fake.from).not.toHaveBeenCalled()
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
  })

  it('un admin no reporta por el asesor y no deja el dato a medias', async () => {
    usuarioActualMock.mockResolvedValue(USUARIO_ADMIN)
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'contesto')

    expect(resultado).toEqual({
      error: 'Solo el asesor del lead puede reportar cómo le fue',
    })
    expect(fake.from).not.toHaveBeenCalled()
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
  })

  it('sin sesión válida no toca la base', async () => {
    usuarioActualMock.mockResolvedValue(null)
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'contesto')

    expect(resultado).toEqual({ error: 'Tu sesión no es válida' })
    expect(fake.from).not.toHaveBeenCalled()
  })
})

describe('resolverContacto — desenlaces', () => {
  it('«contesto» resuelve los pendientes del lead y NO mueve la etapa', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'contesto')

    expect(resultado).toEqual({ ok: true })
    expect(fake.updateContactos).toHaveBeenCalledTimes(1)
    expect(fake.updateContactos.mock.calls[0][0]).toMatchObject({ resultado: 'contesto' })
    // Por LEAD y solo los pendientes: la carrera aceptada del dedupe puede
    // dejar dos filas y las dos tienen que quedar resueltas.
    expect(fake.eqUpdateLead).toHaveBeenCalledWith('lead_id', 'lead-1')
    expect(fake.eqUpdateResultado).toHaveBeenCalledWith('resultado', 'pendiente')
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
    expect(fake.updateLead).not.toHaveBeenCalled()
  })

  it('«no_contesto» tampoco mueve la etapa: el lead ya está en «Contactado»', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'no_contesto')

    expect(resultado).toEqual({ ok: true })
    expect(fake.updateContactos.mock.calls[0][0]).toMatchObject({ resultado: 'no_contesto' })
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
    expect(fake.updateLead).not.toHaveBeenCalled()
  })

  it('«cita» resuelve el contacto pero NO mueve la etapa: eso lo hace agendarVisita', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'cita')

    expect(resultado).toEqual({ ok: true })
    expect(fake.updateContactos.mock.calls[0][0]).toMatchObject({ resultado: 'cita' })
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
    expect(fake.updateLead).not.toHaveBeenCalled()
  })

  it('«no_interesa» resuelve el contacto y cierra el lead como perdido', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'no_interesa')

    expect(resultado).toEqual({ ok: true })
    expect(fake.updateContactos.mock.calls[0][0]).toMatchObject({ resultado: 'no_interesa' })
    // Vía cambiarEtapa y no vía el avance automático: 'cerrado_perdido' no es
    // columna del kanban y además hace falta la NOTA_CIERRE.
    expect(cambiarEtapaMock).toHaveBeenCalledWith('lead-1', 'cerrado_perdido')
  })

  it('si el cierre falla, «no_interesa» propaga el error', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)
    cambiarEtapaMock.mockResolvedValue({ error: 'No se pudo mover el lead' })

    const resultado = await resolverContacto('lead-1', 'no_interesa')

    expect(resultado).toEqual({ error: 'No se pudo mover el lead' })
  })

  it('si el update del contacto falla, devuelve error y no cierra el lead', async () => {
    const fake = crearSupabaseFake({ updateContactoError: { message: 'boom' } })
    createClientMock.mockResolvedValue(fake.supabase)

    const resultado = await resolverContacto('lead-1', 'no_interesa')

    expect(resultado).toEqual({ error: 'No se pudo registrar cómo te fue' })
    expect(cambiarEtapaMock).not.toHaveBeenCalled()
  })

  it('el update lleva SOLO (resultado, resuelto_en): el grant no permite más columnas', async () => {
    const fake = crearSupabaseFake({})
    createClientMock.mockResolvedValue(fake.supabase)

    await resolverContacto('lead-1', 'contesto')

    const argumento = fake.updateContactos.mock.calls[0][0]
    expect(argumento).toEqual({ resultado: 'contesto', resuelto_en: expect.any(String) })
    expect(argumento).not.toHaveProperty('id')
    expect(argumento).not.toHaveProperty('lead_id')
    expect(argumento).not.toHaveProperty('autor_id')
    expect(argumento).not.toHaveProperty('creado_en')
  })
})
