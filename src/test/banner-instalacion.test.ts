/**
 * TDD para la lógica pura de `BannerInstalacion` (ver
 * src/lib/push/decision-banner.ts). El componente en sí mezcla
 * matchMedia/userAgent/Notification/localStorage — una matriz DOM frágil
 * de simular en jsdom — así que lo que se prueba a fondo aquí es la
 * función `decidirBanner` (dado standalone?, iOS?, navegador embebido?,
 * estado del permiso, disponibilidad del deferred prompt y descartes →
 * qué banner mostrar) y los detectores de UA que la alimentan.
 */
import { describe, expect, it } from 'vitest'

import {
  decidirBanner,
  detectarIOS,
  detectarNavegadorEnApp,
  SIETE_DIAS_MS,
  type EntradaDecisionBanner,
} from '@/lib/push/decision-banner'

const AHORA = 1_800_000_000_000 // fijo, arbitrario

function entrada(overrides: Partial<EntradaDecisionBanner> = {}): EntradaDecisionBanner {
  return {
    standalone: false,
    ios: false,
    navegadorEnApp: false,
    permiso: 'default',
    deferredPromptDisponible: false,
    descartadoInstalarEn: null,
    descartadoAvisosEn: null,
    ahora: AHORA,
    ...overrides,
  }
}

describe('decidirBanner', () => {
  it('standalone + permiso concedido → nada (todo resuelto)', () => {
    expect(decidirBanner(entrada({ standalone: true, permiso: 'granted' }))).toBe('ninguno')
  })

  it('standalone + permiso aún no pedido → solo el pre-prompt de avisos', () => {
    expect(decidirBanner(entrada({ standalone: true, permiso: 'default' }))).toBe('avisos')
  })

  it('standalone + permiso denegado → nada (no se insiste tras un rechazo)', () => {
    expect(decidirBanner(entrada({ standalone: true, permiso: 'denied' }))).toBe('ninguno')
  })

  it('standalone + Notification no soportada → nada', () => {
    expect(decidirBanner(entrada({ standalone: true, permiso: 'no-soportado' }))).toBe('ninguno')
  })

  it('standalone + permiso no pedido pero avisos descartado hace menos de 7 días → nada', () => {
    expect(
      decidirBanner(
        entrada({ standalone: true, permiso: 'default', descartadoAvisosEn: AHORA - 1000 })
      )
    ).toBe('ninguno')
  })

  it('standalone + permiso no pedido y el descarte de avisos ya pasó 7 días → vuelve a ofrecer avisos', () => {
    expect(
      decidirBanner(
        entrada({
          standalone: true,
          permiso: 'default',
          descartadoAvisosEn: AHORA - SIETE_DIAS_MS - 1,
        })
      )
    ).toBe('avisos')
  })

  it('Android no standalone con beforeinstallprompt capturado → banner de instalar Android', () => {
    expect(
      decidirBanner(entrada({ standalone: false, ios: false, deferredPromptDisponible: true }))
    ).toBe('instalar-android')
  })

  it('Android no standalone, instalar descartado hace menos de 7 días → no reinsiste con instalar, cae a avisos', () => {
    expect(
      decidirBanner(
        entrada({
          standalone: false,
          ios: false,
          deferredPromptDisponible: true,
          descartadoInstalarEn: AHORA - 1000,
          permiso: 'default',
        })
      )
    ).toBe('avisos')
  })

  it('Android no standalone sin deferredPrompt (no disponible) y permiso no pedido → pre-prompt de avisos', () => {
    expect(
      decidirBanner(
        entrada({ standalone: false, ios: false, deferredPromptDisponible: false, permiso: 'default' })
      )
    ).toBe('avisos')
  })

  it('Android no standalone sin deferredPrompt y permiso ya concedido → nada', () => {
    expect(
      decidirBanner(
        entrada({ standalone: false, ios: false, deferredPromptDisponible: false, permiso: 'granted' })
      )
    ).toBe('ninguno')
  })

  it('Android no standalone sin deferredPrompt y permiso denegado → nada', () => {
    expect(
      decidirBanner(
        entrada({ standalone: false, ios: false, deferredPromptDisponible: false, permiso: 'denied' })
      )
    ).toBe('ninguno')
  })

  it('iOS no standalone → tarjeta de instalación manual', () => {
    expect(decidirBanner(entrada({ standalone: false, ios: true }))).toBe('instalar-ios')
  })

  it('iOS no standalone en navegador embebido (WhatsApp/Instagram) → aviso de abrir en Safari', () => {
    expect(decidirBanner(entrada({ standalone: false, ios: true, navegadorEnApp: true }))).toBe(
      'instalar-ios-navegador-no-soportado'
    )
  })

  it('iOS no standalone con instalar ya descartado recientemente → nada (secuencia: avisos espera a standalone)', () => {
    expect(
      decidirBanner(
        entrada({
          standalone: false,
          ios: true,
          permiso: 'default',
          descartadoInstalarEn: AHORA - 1000,
        })
      )
    ).toBe('ninguno')
  })

  it('iOS no standalone, descarte de instalar ya pasó 7 días → vuelve a ofrecer la tarjeta de instalar', () => {
    expect(
      decidirBanner(
        entrada({
          standalone: false,
          ios: true,
          descartadoInstalarEn: AHORA - SIETE_DIAS_MS - 1,
        })
      )
    ).toBe('instalar-ios')
  })

  it('iOS ya standalone, permiso no pedido → ahora sí, pre-prompt de avisos', () => {
    expect(decidirBanner(entrada({ standalone: true, ios: true, permiso: 'default' }))).toBe(
      'avisos'
    )
  })
})

describe('detectarIOS', () => {
  const UA_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const UA_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  const UA_MAC_DESKTOP =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

  it('detecta iPhone clásico', () => {
    expect(detectarIOS(UA_IPHONE)).toBe(true)
  })

  it('no detecta Android', () => {
    expect(detectarIOS(UA_ANDROID)).toBe(false)
  })

  it('no confunde un Mac de escritorio (sin multitouch) con iOS', () => {
    expect(detectarIOS(UA_MAC_DESKTOP, 0)).toBe(false)
  })

  it('detecta iPadOS 13+ (UA de Mac pero con multitouch)', () => {
    expect(detectarIOS(UA_MAC_DESKTOP, 5)).toBe(true)
  })
})

describe('detectarNavegadorEnApp', () => {
  it('detecta el navegador embebido de WhatsApp', () => {
    expect(detectarNavegadorEnApp('Mozilla/5.0 ... WhatsApp/2.24 ...')).toBe(true)
  })

  it('detecta el navegador embebido de Instagram', () => {
    expect(detectarNavegadorEnApp('Mozilla/5.0 ... Instagram 312.0.0 ...')).toBe(true)
  })

  it('detecta el navegador embebido de Facebook (FBAN/FBAV)', () => {
    expect(detectarNavegadorEnApp('Mozilla/5.0 ... FBAN/FB4A;FBAV/450.0 ...')).toBe(true)
  })

  it('no marca Safari normal como navegador embebido', () => {
    expect(
      detectarNavegadorEnApp(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false)
  })

  it('no marca Chrome de Android normal como navegador embebido', () => {
    expect(
      detectarNavegadorEnApp(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
      )
    ).toBe(false)
  })
})
