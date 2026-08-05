// @vitest-environment jsdom
/**
 * Tests TDD para RegistroPush (ver src/components/push/registro-push.tsx):
 * el componente no renderiza nada, así que se prueban sus efectos —
 * registro del service worker, re-sync de la suscripción y, sobre todo,
 * que los errores de guardarSuscripcion queden visibles (antes eran
 * silenciosos) y que la autocuración (unsubscribe + subscribe + reintento)
 * funcione cuando el upsert de una suscripción existente falla.
 *
 * navigator.serviceWorker y Notification no existen en jsdom por defecto:
 * se definen a mano con Object.defineProperty en cada test.
 */
import '@testing-library/jest-dom/vitest'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { guardarSuscripcionMock } = vi.hoisted(() => ({
  guardarSuscripcionMock: vi.fn(),
}))

// Se mockea el módulo completo (no vi.importActual): el real importa, vía
// usuario-actual.ts, el paquete 'server-only', que revienta si se carga
// desde un módulo de cliente fuera de un bundler con la condición
// "react-server" (mismo motivo documentado en push-enviar.test.ts).
vi.mock('@/lib/push/acciones', () => ({
  guardarSuscripcion: guardarSuscripcionMock,
}))

vi.mock('@/lib/env', () => ({
  vapidPublicKey: () => 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
}))

import RegistroPush from '@/components/push/registro-push'

function subFake(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p-' + endpoint, auth: 'a-' + endpoint } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

/** Instala navigator.serviceWorker con register() y ready separados, para poder
 * verificar que el componente usa SIEMPRE el handle de `.ready`, no el de `.register()`. */
function instalarServiceWorker({
  getSubscription,
  subscribe,
}: {
  getSubscription: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}) {
  const registerPushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
  const readyPushManager = { getSubscription, subscribe }
  const registerMock = vi.fn().mockResolvedValue({ pushManager: registerPushManager })
  const readyReg = { pushManager: readyPushManager }

  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { register: registerMock, ready: Promise.resolve(readyReg) },
    configurable: true,
    writable: true,
  })

  return { registerMock, registerPushManager, readyPushManager }
}

function instalarNotification(permission: 'granted' | 'denied' | 'default') {
  Object.defineProperty(window, 'Notification', {
    value: { permission },
    configurable: true,
    writable: true,
  })
}

function quitarNotification() {
  Object.defineProperty(window, 'Notification', {
    value: undefined,
    configurable: true,
    writable: true,
  })
}

describe('RegistroPush', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    guardarSuscripcionMock.mockReset()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('renderiza null (sin UI)', () => {
    instalarNotification('default')
    const getSubscription = vi.fn().mockResolvedValue(null)
    const subscribe = vi.fn()
    instalarServiceWorker({ getSubscription, subscribe })

    const { container } = render(<RegistroPush />)

    expect(container).toBeEmptyDOMElement()
  })

  it('sin Notification en window, registra el SW pero no toca pushManager', async () => {
    quitarNotification()
    const getSubscription = vi.fn().mockResolvedValue(null)
    const subscribe = vi.fn()
    const { registerMock } = instalarServiceWorker({ getSubscription, subscribe })

    render(<RegistroPush />)

    await waitFor(() => expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' }))
    // Da tiempo a que, si el código estuviera mal, llamara a pushManager.
    await new Promise((r) => setTimeout(r, 0))
    expect(getSubscription).not.toHaveBeenCalled()
    expect(guardarSuscripcionMock).not.toHaveBeenCalled()
  })

  it('con permiso concedido y sin suscripción previa, se suscribe usando el handle de .ready (no el de .register)', async () => {
    instalarNotification('granted')
    const nuevaSub = subFake('https://push.example/nueva')
    const getSubscription = vi.fn().mockResolvedValue(null)
    const subscribe = vi.fn().mockResolvedValue(nuevaSub)
    const { registerPushManager, readyPushManager } = instalarServiceWorker({ getSubscription, subscribe })
    guardarSuscripcionMock.mockResolvedValue({})

    render(<RegistroPush />)

    await waitFor(() => expect(guardarSuscripcionMock).toHaveBeenCalledTimes(1))
    expect(readyPushManager.subscribe).toHaveBeenCalled()
    expect(registerPushManager.subscribe).not.toHaveBeenCalled()
    expect(guardarSuscripcionMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/nueva', keys: { p256dh: 'p-https://push.example/nueva', auth: 'a-https://push.example/nueva' } },
      expect.any(String)
    )
  })

  it('si guardarSuscripcion (suscripción ya existente) falla, el error queda visible en consola', async () => {
    instalarNotification('granted')
    const subExistente = subFake('https://push.example/existente')
    const getSubscription = vi.fn().mockResolvedValue(subExistente)
    const subscribe = vi.fn().mockResolvedValue(subFake('https://push.example/reintento'))
    instalarServiceWorker({ getSubscription, subscribe })
    guardarSuscripcionMock.mockResolvedValueOnce({ error: 'No se pudo guardar la suscripción' })
    guardarSuscripcionMock.mockResolvedValueOnce({})

    render(<RegistroPush />)

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled())
    expect(consoleErrorSpy.mock.calls[0][1]).toBe('No se pudo guardar la suscripción')
  })

  it('autocuración: si el upsert de la suscripción existente falla, se hace unsubscribe + subscribe fresco + se reintenta guardar', async () => {
    instalarNotification('granted')
    const subExistente = subFake('https://push.example/existente')
    const subNueva = subFake('https://push.example/nueva-tras-fallo')
    const getSubscription = vi.fn().mockResolvedValue(subExistente)
    const subscribe = vi.fn().mockResolvedValue(subNueva)
    instalarServiceWorker({ getSubscription, subscribe })
    guardarSuscripcionMock.mockResolvedValueOnce({ error: 'fila de otro usuario' })
    guardarSuscripcionMock.mockResolvedValueOnce({})

    render(<RegistroPush />)

    await waitFor(() => expect(guardarSuscripcionMock).toHaveBeenCalledTimes(2))
    expect(subExistente.unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(guardarSuscripcionMock).toHaveBeenNthCalledWith(
      2,
      { endpoint: 'https://push.example/nueva-tras-fallo', keys: expect.any(Object) },
      expect.any(String)
    )
  })

  it('autocuración fallida: si el reintento TAMBIÉN falla, se loguea y NO hay un tercer intento (no hay loop)', async () => {
    instalarNotification('granted')
    const subExistente = subFake('https://push.example/existente')
    const subNueva = subFake('https://push.example/nueva-tras-fallo')
    const getSubscription = vi.fn().mockResolvedValue(subExistente)
    const subscribe = vi.fn().mockResolvedValue(subNueva)
    instalarServiceWorker({ getSubscription, subscribe })
    guardarSuscripcionMock.mockResolvedValueOnce({ error: 'fila de otro usuario' })
    guardarSuscripcionMock.mockResolvedValueOnce({ error: 'sigue fallando' })

    render(<RegistroPush />)

    await waitFor(() => expect(guardarSuscripcionMock).toHaveBeenCalledTimes(2))
    // Margen para descartar una tercera llamada.
    await new Promise((r) => setTimeout(r, 0))
    expect(guardarSuscripcionMock).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
