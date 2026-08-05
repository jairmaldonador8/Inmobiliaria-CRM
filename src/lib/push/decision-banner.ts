/**
 * Lógica pura de decisión para `BannerInstalacion` (ver
 * src/components/push/banner-instalacion.tsx). Separada del componente a
 * propósito: la matriz DOM/UA (matchMedia, userAgent, Notification,
 * localStorage) es frágil de simular en jsdom, pero la decisión de QUÉ
 * banner mostrar es una función pura de un puñado de banderas — eso es lo
 * que se prueba exhaustivamente en src/test/banner-instalacion.test.ts.
 */

export type EstadoBanner =
  | 'ninguno'
  | 'instalar-android'
  | 'instalar-ios'
  | 'instalar-ios-navegador-no-soportado'
  | 'avisos'

export type PermisoNotificacion = NotificationPermission | 'no-soportado'

export interface EntradaDecisionBanner {
  /** `window.matchMedia('(display-mode: standalone)').matches` */
  standalone: boolean
  /** UA de iOS (iPhone/iPad/iPod, o iPadOS 13+ disfrazado de Mac). */
  ios: boolean
  /** Navegador embebido (WhatsApp/Instagram/Facebook/Line/etc.): sin PWA install ni push. */
  navegadorEnApp: boolean
  permiso: PermisoNotificacion
  /** true si ya se capturó (y se hizo preventDefault a) un evento `beforeinstallprompt`. */
  deferredPromptDisponible: boolean
  /** Timestamp (ms epoch) del último descarte del banner de instalar, o null si nunca. */
  descartadoInstalarEn: number | null
  /** Timestamp (ms epoch) del último descarte del banner de avisos, o null si nunca. */
  descartadoAvisosEn: number | null
  /** `Date.now()` — inyectado para que los tests no dependan del reloj real. */
  ahora: number
}

export const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

function fueDescartadoReciente(descartadoEn: number | null, ahora: number): boolean {
  return descartadoEn !== null && ahora - descartadoEn < SIETE_DIAS_MS
}

/**
 * Decide cuál de los banners (o ninguno) mostrar. Reglas (ver skill
 * pwa-web-push, sección «UX pattern»):
 *
 * 1. Standalone + permiso concedido → nada.
 * 2. Standalone + permiso aún no pedido (`default`) → solo el pre-prompt de
 *    avisos (paso 4). Denegado o no soportado → nada (no se insiste).
 * 3. No standalone + iOS → tarjeta de instalación manual (o el aviso de
 *    «ábrelo en Safari» si es un navegador embebido). Secuencia iOS: el
 *    pre-prompt de avisos NUNCA se muestra antes de standalone, así que
 *    mientras el banner de instalar siga vigente (no descartado) no se
 *    ofrece nada más.
 * 4. No standalone + Android con `beforeinstallprompt` capturado → banner
 *    de instalar. Push en Android funciona incluso sin instalar, así que
 *    si no hay prompt disponible (o ya se descartó) cae al pre-prompt de
 *    avisos igual que en el caso standalone.
 */
export function decidirBanner(entrada: EntradaDecisionBanner): EstadoBanner {
  const {
    standalone,
    ios,
    navegadorEnApp,
    permiso,
    deferredPromptDisponible,
    descartadoInstalarEn,
    descartadoAvisosEn,
    ahora,
  } = entrada

  if (standalone && permiso === 'granted') return 'ninguno'

  if (standalone) {
    if (permiso === 'default' && !fueDescartadoReciente(descartadoAvisosEn, ahora)) {
      return 'avisos'
    }
    return 'ninguno'
  }

  if (ios) {
    if (fueDescartadoReciente(descartadoInstalarEn, ahora)) return 'ninguno'
    return navegadorEnApp ? 'instalar-ios-navegador-no-soportado' : 'instalar-ios'
  }

  if (deferredPromptDisponible && !fueDescartadoReciente(descartadoInstalarEn, ahora)) {
    return 'instalar-android'
  }

  if (permiso === 'default' && !fueDescartadoReciente(descartadoAvisosEn, ahora)) {
    return 'avisos'
  }

  return 'ninguno'
}

/** Detecta iOS por UA: iPhone/iPad/iPod clásico, o iPadOS 13+ (se anuncia como Mac pero soporta multitouch). */
export function detectarIOS(userAgent: string, maxTouchPoints = 0): boolean {
  const esIOSClasico = /iPad|iPhone|iPod/.test(userAgent)
  const esIPadOS13Plus = /Macintosh/.test(userAgent) && maxTouchPoints > 1
  return esIOSClasico || esIPadOS13Plus
}

/** Detecta navegadores embebidos (WhatsApp, Instagram, Facebook, Line, WeChat) que no exponen instalación PWA. */
export function detectarNavegadorEnApp(userAgent: string): boolean {
  return /(WhatsApp|Instagram|FBAN|FBAV|Line\/|MicroMessenger)/i.test(userAgent)
}
