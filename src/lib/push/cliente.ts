/**
 * Helpers de push del lado del CLIENTE (navegador). NO lleva `'use server'`
 * — a diferencia de acciones.ts, este módulo corre en el navegador y usa
 * `window`/`navigator`. Comparte código entre RegistroPush (re-sync
 * silencioso en cada apertura, ver registro-push.tsx) y BannerInstalacion
 * (primer alta desde el pre-prompt de avisos, ver banner-instalacion.tsx):
 * ambos necesitan "suscribirse fresco y guardar", así que esa lógica vive
 * en un solo lugar.
 */

import { vapidPublicKey } from '@/lib/env'
import { guardarSuscripcion, type SuscripcionPush } from '@/lib/push/acciones'

/**
 * Convierte una clave VAPID en base64url (formato que exponen las
 * variables de entorno) al Uint8Array que `pushManager.subscribe` espera
 * como `applicationServerKey`. Helper estándar de la documentación de
 * Web Push.
 */
export function decodificarBase64Url(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

/** Suscribe fresco en `reg` y sube la nueva suscripción; devuelve el resultado de guardarSuscripcion. */
export async function suscribirYGuardar(reg: ServiceWorkerRegistration) {
  const nuevaSub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodificarBase64Url(vapidPublicKey()) as BufferSource,
  })
  return guardarSuscripcion(nuevaSub.toJSON() as unknown as SuscripcionPush, navigator.userAgent)
}

export type ResultadoActivarAvisos = { ok: true } | { ok: false; error: string }

/**
 * Flujo completo del botón «Activar avisos» del pre-prompt (paso 4 del
 * banner de instalación): pide permiso — el único punto de toda la app que
 * llama a `Notification.requestPermission()` fuera de RegistroPush, y ahí
 * solo se re-sincroniza cuando YA está concedido — y si se concede,
 * registra el service worker (por si el usuario nunca pasó por
 * RegistroPush), suscribe y guarda. Termina con `storage.persist()` para
 * resistir el desalojo de almacenamiento a los 7 días en iOS.
 */
export async function activarAvisos(): Promise<ResultadoActivarAvisos> {
  if (!('Notification' in window)) {
    return { ok: false, error: 'Este navegador no soporta notificaciones' }
  }

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') {
    return { ok: false, error: 'No se concedió el permiso de notificaciones' }
  }

  if (!('serviceWorker' in navigator)) {
    return { ok: false, error: 'Este navegador no soporta service workers' }
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    const reg = await navigator.serviceWorker.ready
    const resultado = await suscribirYGuardar(reg)
    if (resultado.error) {
      return { ok: false, error: resultado.error }
    }

    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        await navigator.storage.persist()
      } catch {
        // No crítico: si el navegador lo rechaza, la suscripción ya quedó guardada igual.
      }
    }

    return { ok: true }
  } catch (err) {
    console.error('activarAvisos: fallo al suscribir', err)
    return { ok: false, error: 'No se pudo activar las notificaciones' }
  }
}
