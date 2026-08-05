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
function decodificarBase64Url(base64Url: string): Uint8Array {
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
async function suscribirYGuardar(reg: ServiceWorkerRegistration) {
  const nuevaSub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodificarBase64Url(vapidPublicKey()) as BufferSource,
  })
  return guardarSuscripcion(nuevaSub.toJSON() as unknown as SuscripcionPush, navigator.userAgent)
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

        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        if (!('Notification' in window) || Notification.permission !== 'granted') return

        // Un solo handle de registration para todo lo que sigue: el de
        // `.ready`, no el que devuelve `.register()` (pueden no coincidir
        // si ya había un SW activo controlando la página).
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()

        if (!sub) {
          const resultado = await suscribirYGuardar(reg)
          if (resultado.error) {
            console.error('RegistroPush: no se pudo guardar la suscripción nueva', resultado.error)
          }
          return
        }

        const resultado = await guardarSuscripcion(sub.toJSON() as unknown as SuscripcionPush, navigator.userAgent)
        if (!resultado.error) return

        // El endpoint pertenece al navegador/dispositivo, no a la cuenta: si
        // la fila en el servidor es de otro usuario (dispositivo compartido
        // que quedó suscrito con otra sesión) o si la policy UPDATE de RLS
        // (migración 0007) todavía no está aplicada, no hay forma de
        // "arreglar" la fila ajena desde aquí. Autocuración: se libera el
        // endpoint actual y se crea uno nuevo y propio — la fila vieja
        // muere sola por la poda de suscripciones 404/410 en el siguiente
        // envío (ver src/lib/push/enviar.ts).
        console.error(
          'RegistroPush: no se pudo guardar la suscripción existente, se reintenta con una nueva',
          resultado.error
        )
        await sub.unsubscribe()
        const segundoResultado = await suscribirYGuardar(reg)
        if (segundoResultado.error) {
          console.error('RegistroPush: la autocuración también falló', segundoResultado.error)
        }
      } catch (err) {
        // El registro/re-sync de push NUNCA debe romper la app.
        console.error('RegistroPush: fallo el registro/re-sync', err)
      }
    }

    void registrar()
  }, [])

  return null
}
