// @vitest-environment jsdom
/**
 * Test de regresión a nivel componente para BannerInstalacion (ver
 * src/components/push/banner-instalacion.tsx): el efecto de montaje
 * registra `alCambiarVisibilidad` una sola vez (deps `[recalcular]`,
 * memoizado con `[]`), así que si ese callback lee `deferredPrompt` del
 * closure de React en vez de una ref actualizada, queda congelado en el
 * valor que tenía AL MOMENTO DE MONTAR (null) para siempre — un
 * `visibilitychange` después de que `beforeinstallprompt` ya disparó
 * recalcula con `deferredPromptDisponible: false` y degrada/oculta el
 * banner de instalar aunque el prompt siga vivo en el estado real.
 *
 * jsdom no implementa `matchMedia` ni dispara `beforeinstallprompt`
 * nativamente — se simulan a mano, mismo patrón que registro-push.test.tsx.
 */
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Igual que registro-push.test.tsx: se mockean acciones.ts y env.ts para
// no arrastrar 'server-only' (vía usuario-actual.ts) a un módulo de
// cliente — BannerInstalacion no llama a guardarSuscripcion en este flujo,
// pero lo importa transitivamente a través de @/lib/push/cliente.
vi.mock('@/lib/push/acciones', () => ({
  guardarSuscripcion: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  vapidPublicKey: () => 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
}))

import BannerInstalacion from '@/components/push/banner-instalacion'

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

function instalarMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('standalone') ? standalone : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
    writable: true,
  })
}

function instalarUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function instalarNotification(permission: 'default' | 'granted' | 'denied') {
  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission: vi.fn() },
    configurable: true,
    writable: true,
  })
}

function dispararVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

interface EventoAntesDeInstalarFake extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function crearEventoBeforeInstallPrompt(): EventoAntesDeInstalarFake {
  const evento = new Event('beforeinstallprompt', { cancelable: true }) as EventoAntesDeInstalarFake
  evento.prompt = vi.fn().mockResolvedValue(undefined)
  evento.userChoice = Promise.resolve({ outcome: 'accepted', platform: '' })
  return evento
}

describe('BannerInstalacion — el deferred prompt sobrevive a un visibilitychange', () => {
  beforeEach(() => {
    window.localStorage.clear()
    instalarMatchMedia(false)
    instalarUserAgent(UA_ANDROID)
    instalarNotification('default')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('el banner de instalar Android sigue visible tras un ciclo hidden→visible', async () => {
    render(<BannerInstalacion />)

    // El cálculo inicial se difiere un microtask (ver el efecto de montaje).
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      window.dispatchEvent(crearEventoBeforeInstallPrompt())
    })

    expect(await screen.findByText('Instalar aplicación')).toBeInTheDocument()

    // La app pasa a segundo plano y vuelve — el prompt sigue vivo en el
    // estado real (el usuario no lo tocó), así que el banner NO debe
    // degradarse ni desaparecer.
    await act(async () => {
      dispararVisibilidad('hidden')
    })
    await act(async () => {
      dispararVisibilidad('visible')
    })

    expect(screen.getByText('Instalar aplicación')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument()
  })
})
