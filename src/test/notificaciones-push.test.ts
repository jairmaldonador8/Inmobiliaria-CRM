// @vitest-environment node
/**
 * Tests TDD para el enganche de Web Push al seam de notificaciones
 * (ver src/lib/notificaciones/crear.ts). `enviarPush` se mockea completo:
 * así no hace falta mockear 'server-only' ni las variables de entorno VAPID
 * que carga @/lib/push/enviar transitivamente (ver src/test/push-enviar.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { enviarPushMock } = vi.hoisted(() => ({
  enviarPushMock: vi.fn(),
}))

vi.mock('@/lib/push/enviar', () => ({
  enviarPush: enviarPushMock,
}))

import { crearNotificacion, notificarAdmins, notificarDesarrollador } from '@/lib/notificaciones/crear'

interface ErrorFake {
  message: string
}

/** Stub chainable mínimo para crearNotificacion: solo insert en 'notificaciones'. */
function crearSupabaseFake(insertResult: { error: ErrorFake | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  const from = vi.fn(() => ({ insert }))
  return { supabase: { from } as unknown as SupabaseClient, from, insert }
}

/** Stub chainable para notificarAdmins: select en 'usuarios' + insert en 'notificaciones'. */
function crearSupabaseFakeAdmins(
  admins: { user_id: string }[],
  insertResult: { error: ErrorFake | null } = { error: null }
) {
  const eqActivo = vi.fn().mockResolvedValue({ data: admins, error: null })
  const eqRol = vi.fn(() => ({ eq: eqActivo }))
  const select = vi.fn(() => ({ eq: eqRol }))
  const insert = vi.fn().mockResolvedValue(insertResult)
  const from = vi.fn((tabla: string) => (tabla === 'usuarios' ? { select } : { insert }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eqRol, eqActivo, insert }
}

/**
 * Stub para notificarDesarrollador: select en 'configuracion' (clave
 * desarrollador_user_id), select en 'usuarios' (fallback a admins) e insert
 * en 'notificaciones'.
 */
function crearSupabaseFakeDesarrollador(
  valorConfig: unknown,
  admins: { user_id: string }[] = []
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { valor: valorConfig }, error: null })
  const eqClave = vi.fn(() => ({ maybeSingle }))
  const selectConfig = vi.fn(() => ({ eq: eqClave }))
  const eqActivo = vi.fn().mockResolvedValue({ data: admins, error: null })
  const eqRol = vi.fn(() => ({ eq: eqActivo }))
  const selectUsuarios = vi.fn(() => ({ eq: eqRol }))
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn((tabla: string) => {
    if (tabla === 'configuracion') return { select: selectConfig }
    if (tabla === 'usuarios') return { select: selectUsuarios }
    return { insert }
  })
  return { supabase: { from } as unknown as SupabaseClient, insert }
}

const DATOS = { destinatarioId: 'user-1', tipo: 'lead_asignado', texto: 'Se te asignó un lead', url: '/bandeja' }

describe('crearNotificacion + push', () => {
  beforeEach(() => {
    enviarPushMock.mockReset()
  })

  it('llama a enviarPush tras un insert exitoso, con el mismo cliente, destinatario y payload', async () => {
    const { supabase } = crearSupabaseFake()
    enviarPushMock.mockResolvedValue({ enviados: 1 })

    await crearNotificacion(supabase, DATOS)

    expect(enviarPushMock).toHaveBeenCalledTimes(1)
    expect(enviarPushMock).toHaveBeenCalledWith(supabase, 'user-1', {
      titulo: 'Klo-Ser',
      cuerpo: 'Se te asignó un lead',
      url: '/bandeja',
    })
  })

  it('si enviarPush rechaza, crearNotificacion NO lanza y el insert cuenta como éxito', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase, insert } = crearSupabaseFake()
    enviarPushMock.mockRejectedValue(new Error('push boom'))

    await expect(crearNotificacion(supabase, DATOS)).resolves.toBeUndefined()

    expect(insert).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('si el INSERT falla, lanza (comportamiento actual) y NO llama a enviarPush', async () => {
    const { supabase } = crearSupabaseFake({ error: { message: 'boom' } })

    await expect(crearNotificacion(supabase, DATOS)).rejects.toThrow()

    expect(enviarPushMock).not.toHaveBeenCalled()
  })
})

describe('notificarDesarrollador', () => {
  beforeEach(() => {
    enviarPushMock.mockReset()
  })

  it('con desarrollador configurado, notifica SOLO a ese usuario (los demás admins no)', async () => {
    const { supabase, insert } = crearSupabaseFakeDesarrollador('dev-1', [
      { user_id: 'admin-1' },
      { user_id: 'admin-2' },
    ])
    enviarPushMock.mockResolvedValue({ enviados: 1 })

    const total = await notificarDesarrollador(supabase, {
      tipo: 'sugerencia',
      texto: '💡 idea',
      url: '/admin/sugerencias',
    })

    expect(total).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      destinatario_id: 'dev-1',
      tipo: 'sugerencia',
      texto: '💡 idea',
      url: '/admin/sugerencias',
    })
    expect(enviarPushMock).toHaveBeenCalledTimes(1)
    expect(enviarPushMock).toHaveBeenCalledWith(supabase, 'dev-1', {
      titulo: 'Klo-Ser',
      cuerpo: '💡 idea',
      url: '/admin/sugerencias',
    })
  })

  it('sin desarrollador configurado (null), cae al aviso a todos los admins', async () => {
    const { supabase } = crearSupabaseFakeDesarrollador(null, [
      { user_id: 'admin-1' },
      { user_id: 'admin-2' },
    ])
    enviarPushMock.mockResolvedValue({ enviados: 1 })

    const total = await notificarDesarrollador(supabase, {
      tipo: 'sugerencia',
      texto: '💡 idea',
      url: '/admin/sugerencias',
    })

    expect(total).toBe(2)
    expect(enviarPushMock).toHaveBeenCalledTimes(2)
  })
})

describe('notificarAdmins + push', () => {
  beforeEach(() => {
    enviarPushMock.mockReset()
  })

  it('pushea a CADA admin activo notificado', async () => {
    const admins = [{ user_id: 'admin-1' }, { user_id: 'admin-2' }]
    const { supabase } = crearSupabaseFakeAdmins(admins)
    enviarPushMock.mockResolvedValue({ enviados: 1 })

    const total = await notificarAdmins(supabase, {
      tipo: 'aviso',
      texto: 'Nueva solicitud',
      url: '/admin',
    })

    expect(total).toBe(2)
    expect(enviarPushMock).toHaveBeenCalledTimes(2)
    expect(enviarPushMock).toHaveBeenNthCalledWith(1, supabase, 'admin-1', {
      titulo: 'Klo-Ser',
      cuerpo: 'Nueva solicitud',
      url: '/admin',
    })
    expect(enviarPushMock).toHaveBeenNthCalledWith(2, supabase, 'admin-2', {
      titulo: 'Klo-Ser',
      cuerpo: 'Nueva solicitud',
      url: '/admin',
    })
  })

  it('si el push al primer admin rechaza, el segundo admin igual recibe su push (aislamiento)', async () => {
    const admins = [{ user_id: 'admin-1' }, { user_id: 'admin-2' }]
    const { supabase } = crearSupabaseFakeAdmins(admins)
    enviarPushMock.mockRejectedValueOnce(new Error('push boom')).mockResolvedValueOnce({ enviados: 1 })

    const total = await notificarAdmins(supabase, {
      tipo: 'aviso',
      texto: 'Nueva solicitud',
      url: '/admin',
    })

    expect(total).toBe(2)
    expect(enviarPushMock).toHaveBeenCalledTimes(2)
    expect(enviarPushMock).toHaveBeenNthCalledWith(1, supabase, 'admin-1', {
      titulo: 'Klo-Ser',
      cuerpo: 'Nueva solicitud',
      url: '/admin',
    })
    expect(enviarPushMock).toHaveBeenNthCalledWith(2, supabase, 'admin-2', {
      titulo: 'Klo-Ser',
      cuerpo: 'Nueva solicitud',
      url: '/admin',
    })
  })

  it('si el INSERT masivo falla, lanza y NO llama a enviarPush', async () => {
    const admins = [{ user_id: 'admin-1' }, { user_id: 'admin-2' }]
    const { supabase } = crearSupabaseFakeAdmins(admins, { error: { message: 'boom' } })

    await expect(
      notificarAdmins(supabase, { tipo: 'aviso', texto: 'Nueva solicitud', url: '/admin' })
    ).rejects.toThrow()

    expect(enviarPushMock).not.toHaveBeenCalled()
  })
})
