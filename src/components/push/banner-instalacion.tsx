'use client'

import { useCallback, useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'

import { activarAvisos } from '@/lib/push/cliente'
import {
  decidirBanner,
  detectarIOS,
  detectarNavegadorEnApp,
  type EstadoBanner,
  type PermisoNotificacion,
} from '@/lib/push/decision-banner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const CLAVE_STORAGE = 'kloser-push-banner'

interface Descartes {
  descartadoInstalarEn: number | null
  descartadoAvisosEn: number | null
}

const DESCARTES_VACIOS: Descartes = { descartadoInstalarEn: null, descartadoAvisosEn: null }

function leerDescartes(): Descartes {
  if (typeof window === 'undefined') return DESCARTES_VACIOS
  try {
    const crudo = window.localStorage.getItem(CLAVE_STORAGE)
    if (!crudo) return DESCARTES_VACIOS
    const datos = JSON.parse(crudo) as Partial<Record<keyof Descartes, unknown>>
    return {
      descartadoInstalarEn:
        typeof datos.descartadoInstalarEn === 'number' ? datos.descartadoInstalarEn : null,
      descartadoAvisosEn:
        typeof datos.descartadoAvisosEn === 'number' ? datos.descartadoAvisosEn : null,
    }
  } catch {
    return DESCARTES_VACIOS
  }
}

function guardarDescarte(campo: keyof Descartes): Descartes {
  const actuales = leerDescartes()
  const nuevos = { ...actuales, [campo]: Date.now() }
  window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(nuevos))
  return nuevos
}

/** Evento `beforeinstallprompt`: no forma parte del DOM lib estándar de TS. */
interface EventoAntesDeInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function permisoActual(): PermisoNotificacion {
  return 'Notification' in window ? Notification.permission : 'no-soportado'
}

/**
 * Banner de instalación PWA + pre-prompt de notificaciones (Task 8, plan
 * push-PWA Fase A). Ver skill `pwa-web-push`, sección «UX pattern», y la
 * lógica de decisión en src/lib/push/decision-banner.ts.
 *
 * Fijo al fondo de pantalla, discreto — NUNCA un modal — y con un único
 * botón de acción por estado: «Instalar» (Android), la tarjeta de pasos
 * manuales (iOS) o «Activar avisos» (pre-prompt de notificaciones). El
 * permiso nativo del navegador SOLO se pide al tocar «Activar avisos»
 * (ver activarAvisos en cliente.ts) — nunca al cargar la página.
 */
export default function BannerInstalacion() {
  const [estado, setEstado] = useState<EstadoBanner>('ninguno')
  const [deferredPrompt, setDeferredPrompt] = useState<EventoAntesDeInstalar | null>(null)
  const [activando, setActivando] = useState(false)
  const [errorActivar, setErrorActivar] = useState<string | null>(null)

  const recalcular = useCallback(
    (promptDisponible: boolean, descartes: Descartes) => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
      const ua = navigator.userAgent
      const ios = detectarIOS(ua, navigator.maxTouchPoints)
      const navegadorEnApp = detectarNavegadorEnApp(ua)

      setEstado(
        decidirBanner({
          standalone,
          ios,
          navegadorEnApp,
          permiso: permisoActual(),
          deferredPromptDisponible: promptDisponible,
          descartadoInstalarEn: descartes.descartadoInstalarEn,
          descartadoAvisosEn: descartes.descartadoAvisosEn,
          ahora: Date.now(),
        })
      )
    },
    []
  )

  useEffect(() => {
    // queueMicrotask: el cálculo inicial lee window/navigator (matchMedia,
    // userAgent, Notification.permission), pero react-hooks/set-state-in-effect
    // no permite un setState síncrono como primera línea del efecto — solo
    // dentro de un callback (evento, promesa, suscripción). Diferirlo un
    // microtask satisface esa regla sin cambiar el comportamiento real: en
    // la práctica se resuelve en el mismo ciclo, antes del primer paint.
    queueMicrotask(() => recalcular(false, leerDescartes()))

    function alBeforeInstallPrompt(evento: Event) {
      evento.preventDefault()
      const bip = evento as EventoAntesDeInstalar
      setDeferredPrompt(bip)
      recalcular(true, leerDescartes())
    }

    // El permiso o el modo de visualización pueden cambiar mientras la
    // pestaña está en segundo plano (p. ej. el usuario instala la app y
    // vuelve); se recalcula al retomar el foco.
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') {
        recalcular(deferredPrompt !== null, leerDescartes())
      }
    }

    window.addEventListener('beforeinstallprompt', alBeforeInstallPrompt)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      window.removeEventListener('beforeinstallprompt', alBeforeInstallPrompt)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
    // Deliberado: solo al montar/desmontar. `deferredPrompt` se lee dentro
    // del closure de alCambiarVisibilidad vía clausura mutable de React no
    // aplica aquí (usamos el valor capturado al registrar el listener),
    // pero como el listener se reinstala solo una vez, para el caso de uso
    // real (visibilitychange tras volver de instalar) basta con el estado
    // del localStorage, que sí se relee siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcular])

  async function alTocarInstalar() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    recalcular(false, leerDescartes())
  }

  function alDescartarInstalar() {
    recalcular(deferredPrompt !== null, guardarDescarte('descartadoInstalarEn'))
  }

  async function alTocarActivarAvisos() {
    setActivando(true)
    setErrorActivar(null)
    const resultado = await activarAvisos()
    setActivando(false)
    if (!resultado.ok) {
      setErrorActivar(resultado.error)
      return
    }
    recalcular(deferredPrompt !== null, leerDescartes())
  }

  function alDescartarAvisos() {
    recalcular(deferredPrompt !== null, guardarDescarte('descartadoAvisosEn'))
  }

  if (estado === 'ninguno') return null

  return (
    <div
      role="region"
      aria-label="Aviso de instalación y notificaciones"
      className={cn(
        // bottom-20: por encima de la barra inferior del asesor (h-16) y
        // deliberadamente por encima (z-50) del botón «+ Registrar lead»
        // del kanban del asesor (también bottom-20, ver sheet-captura-rapida)
        // — mientras este aviso está visible tapa ese FAB, se libera al
        // descartarlo o activarlo. En escritorio (solo admin) se corre a
        // bottom-24 para no montarse sobre BotonSugerencia (bottom-6).
        'fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground shadow-lg',
        'lg:inset-x-auto lg:right-6 lg:left-auto lg:bottom-24 lg:w-96'
      )}
    >
      {estado === 'instalar-android' ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <SquarePlus aria-hidden className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Instalar aplicación</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Agrégala a tu pantalla de inicio para abrirla más rápido, como cualquier otra app.
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button type="button" size="sm" onClick={alTocarInstalar}>
                Instalar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={alDescartarInstalar}>
                Ahora no
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={alDescartarInstalar}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      {estado === 'instalar-ios' ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Instalar aplicación</p>
            <ol className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">1.</span> Toca{' '}
                <Share aria-hidden className="inline size-3.5" /> <strong>Compartir</strong> en
                Safari
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span>{' '}
                <strong>Agregar a pantalla de inicio</strong>
              </li>
              <li>
                <span className="font-medium text-foreground">3.</span> Toca{' '}
                <strong>Agregar</strong>
              </li>
            </ol>
          </div>
          <button
            type="button"
            onClick={alDescartarInstalar}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      {estado === 'instalar-ios-navegador-no-soportado' ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Ábrelo en Safari para instalar</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Este enlace se abrió dentro de otra app. Para instalarla, toca el botón de
              “…” y elige <strong>Abrir en Safari</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={alDescartarInstalar}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      {estado === 'avisos' ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Activa los avisos</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Entérate al instante cuando te asignen un lead.
            </p>
            {errorActivar ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errorActivar}
              </p>
            ) : null}
            <div className="mt-2.5 flex gap-2">
              <Button type="button" size="sm" onClick={alTocarActivarAvisos} disabled={activando}>
                {activando ? 'Activando…' : 'Activar avisos'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={alDescartarAvisos}>
                Ahora no
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={alDescartarAvisos}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
