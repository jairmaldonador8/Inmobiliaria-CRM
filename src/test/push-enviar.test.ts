// @vitest-environment node
/**
 * Tests TDD para enviarPush() — envío de Web Push a las suscripciones de un
 * destinatario (ver src/lib/push/enviar.ts).
 *
 * `src/lib/env-server.ts` importa 'server-only', que revienta (throw) al
 * cargarse fuera de un bundler con la condición "react-server" — por eso se
 * mockea el paquete completo. Los accessors de VAPID también se mockean
 * (@/lib/env y @/lib/env-server): un test unitario NO carga .env.local y los
 * accessors truenan si la variable falta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/env', () => ({
  vapidPublicKey: () => 'public-key-test',
}))

vi.mock('@/lib/env-server', () => ({
  vapidPrivateKey: () => 'private-key-test',
  vapidSubject: () => 'mailto:test@klo-ser.test',
}))

// vi.mock se hoistea sobre los imports; las variables que usa la factory
// deben venir de vi.hoisted() para no chocar con el TDZ.
const { sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}))

vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>()
  return {
    default: {
      setVapidDetails: setVapidDetailsMock,
      sendNotification: sendNotificationMock,
    },
    WebPushError: actual.WebPushError,
  }
})

import { enviarPush } from '@/lib/push/enviar'
import { WebPushError } from 'web-push'

interface FilaSuscripcion {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Stub chainable mínimo de SupabaseClient: cubre solo lo que enviarPush usa. */
function crearSupabaseFake(subs: FilaSuscripcion[]) {
  const eq = vi.fn().mockResolvedValue({ data: subs, error: null })
  const select = vi.fn(() => ({ eq }))
  const inMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const del = vi.fn(() => ({ in: inMock }))
  const from = vi.fn(() => ({ select, delete: del }))
  return { supabase: { from } as unknown as SupabaseClient, from, select, eq, del, inMock }
}

const DATOS = { titulo: 'Nuevo lead', cuerpo: 'Se te asignó un lead', url: '/bandeja' }

describe('enviarPush', () => {
  beforeEach(() => {
    sendNotificationMock.mockReset()
    setVapidDetailsMock.mockReset()
  })

  it('envía a TODAS las suscripciones del destinatario y ESPERA cada envío', async () => {
    const subs: FilaSuscripcion[] = [
      { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k2', auth: 'a2' },
    ]
    const { supabase, from, eq } = crearSupabaseFake(subs)

    // Resuelve en un microtask/timeout posterior: si enviarPush NO hiciera
    // await de los envíos, el resultado se calcularía antes de que esto
    // corriera y `resueltos` seguiría en 0.
    let resueltos = 0
    sendNotificationMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resueltos += 1
            resolve(undefined)
          }, 5)
        })
    )

    const resultado = await enviarPush(supabase, 'user-1', DATOS)

    expect(from).toHaveBeenCalledWith('push_suscripciones')
    expect(eq).toHaveBeenCalledWith('usuario_id', 'user-1')
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(resueltos).toBe(2) // probaría que sí se esperó cada envío
    expect(resultado).toEqual({ enviados: 2 })

    // Suscripción -> forma de PushSubscription que espera web-push.
    expect(sendNotificationMock).toHaveBeenNthCalledWith(
      1,
      { endpoint: 'https://push.example/1', keys: { p256dh: 'k1', auth: 'a1' } },
      expect.any(String)
    )
  })

  it.each([410, 404])(
    'borra la suscripción muerta (WebPushError %i) y NO lanza',
    async (statusCode) => {
      const subs: FilaSuscripcion[] = [
        { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
        { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k2', auth: 'a2' },
      ]
      const { supabase, del, inMock } = crearSupabaseFake(subs)

      sendNotificationMock
        .mockRejectedValueOnce(new WebPushError('gone', statusCode, {}, '', subs[0].endpoint))
        .mockResolvedValueOnce(undefined)

      const resultado = await enviarPush(supabase, 'user-1', DATOS)

      expect(resultado).toEqual({ enviados: 1 })
      expect(del).toHaveBeenCalledTimes(1)
      expect(inMock).toHaveBeenCalledWith('id', ['s1'])
    }
  )

  it('sin suscripciones devuelve enviados:0 sin lanzar', async () => {
    const { supabase, del } = crearSupabaseFake([])

    const resultado = await enviarPush(supabase, 'user-sin-subs', DATOS)

    expect(resultado).toEqual({ enviados: 0 })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('el payload incluye title, body y data.url', async () => {
    const subs: FilaSuscripcion[] = [
      { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
    ]
    const { supabase } = crearSupabaseFake(subs)
    sendNotificationMock.mockResolvedValue(undefined)

    await enviarPush(supabase, 'user-1', {
      titulo: 'Nuevo lead',
      cuerpo: 'Se te asignó un lead',
      url: '/bandeja',
    })

    const [, payloadJson] = sendNotificationMock.mock.calls[0]
    expect(JSON.parse(payloadJson as string)).toEqual({
      title: 'Nuevo lead',
      body: 'Se te asignó un lead',
      data: { url: '/bandeja' },
    })
  })

  it('sin url usa "/" como data.url por defecto', async () => {
    const subs: FilaSuscripcion[] = [
      { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
    ]
    const { supabase } = crearSupabaseFake(subs)
    sendNotificationMock.mockResolvedValue(undefined)

    await enviarPush(supabase, 'user-1', { titulo: 'T', cuerpo: 'C', url: null })

    const [, payloadJson] = sendNotificationMock.mock.calls[0]
    expect(JSON.parse(payloadJson as string).data).toEqual({ url: '/' })
  })
})
