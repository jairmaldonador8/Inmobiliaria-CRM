'use client'

import { useEffect } from 'react'

import { vapidPublicKey } from '@/lib/env'
import { guardarSuscripcion, type SuscripcionPush } from '@/lib/push/acciones'

/**
 * Convierte una clave VAPID en base64url (formato que exponen las
 * variables de entorno) al Uint8Array que `pushManager.subscribe` espera
 * como `applicationServerKey`. Helper estándar de la documentación de
 * Web Push.
 */
function base64UrlAUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const outputArray = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    outputArray[i] = raw.charCodeAt(i)
  }
  return outputArray
}

/**
 * Registra el service worker y re-sincroniza la suscripción push en CADA
 * apertura de la app. No renderiza nada: es un efecto de montaje puro.
 *
 * `pushsubscriptionchange` NO es confiable (Chrome casi nunca lo dispara al
 * expirar, iOS descarta suscripciones sin dispararlo) — el mecanismo real
 * es este re-sync al abrir: se compara lo que el navegador tiene contra
 * lo que debería tener y se sube (upsert barato) o se vuelve a suscribir.
 */
export default function RegistroPush() {
  useEffect(() => {
    async function registrar() {
      try {
        if (!('serviceWorker' in navigator)) return

        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        if (Notification.permission !== 'granted') return

        const listo = await navigator.serviceWorker.ready
        const sub = await listo.pushManager.getSubscription()

        if (sub) {
          await guardarSuscripcion(sub.toJSON() as unknown as SuscripcionPush, navigator.userAgent)
          return
        }

        const nuevaSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlAUint8Array(vapidPublicKey()) as BufferSource,
        })
        await guardarSuscripcion(nuevaSub.toJSON() as unknown as SuscripcionPush, navigator.userAgent)
      } catch (err) {
        // El registro/re-sync de push NUNCA debe romper la app.
        console.error('RegistroPush: fallo el registro/re-sync', err)
      }
    }

    void registrar()
  }, [])

  return null
}
