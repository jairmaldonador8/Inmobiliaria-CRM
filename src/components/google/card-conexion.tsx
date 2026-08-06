'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarCheck2, CalendarOff, CalendarPlus } from 'lucide-react'

import { desconectarGoogle } from '@/lib/google/acciones'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type EstadoConexionGoogleUI = 'sin_conectar' | 'activa' | 'revocada'

/** Resultado del callback OAuth (`/asesor?gcal=…`), si el usuario acaba de volver de Google. */
export type AvisoConexionGoogle = 'conectado' | 'cancelado' | 'error'

type Props = {
  estado: EstadoConexionGoogleUI
  /** Email conectado (o el último conocido, si `estado === 'revocada'`). */
  googleEmail: string | null
  aviso?: AvisoConexionGoogle | null
}

const RUTA_CONECTAR = '/api/google/oauth/start'

const MENSAJE_AVISO: Record<AvisoConexionGoogle, { exito: boolean; texto: string }> = {
  conectado: { exito: true, texto: 'Google Calendar conectado' },
  cancelado: { exito: false, texto: 'Cancelaste la conexión con Google' },
  error: { exito: false, texto: 'No se pudo conectar con Google Calendar' },
}

/**
 * Card «Google Calendar» del dashboard del asesor (Task 7): tres estados —
 * sin conectar, conectada, revocada. Estilo slate/white del resto del
 * dashboard (NO glass — esta vista no lleva el kit fintech), mismo patrón
 * de tarjeta que «Próximas visitas»/«Atiende ahora» en
 * src/app/(asesor)/asesor/page.tsx.
 *
 * Confirmación de desconexión: mismo patrón (Dialog controlado + useTransition
 * + toast + router.refresh()) que `ListaVisitasLead` al cancelar una visita.
 */
export function CardConexionGoogle({ estado, googleEmail, aviso }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pendiente, iniciarTransicion] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const avisoMostrado = useRef(false)

  // Toast único al volver del callback OAuth (?gcal=conectado|cancelado|error);
  // luego limpia el query param para que un refresh no lo repita.
  useEffect(() => {
    if (!aviso || avisoMostrado.current) return
    avisoMostrado.current = true
    const mensaje = MENSAJE_AVISO[aviso]
    if (mensaje.exito) toast.success(mensaje.texto)
    else toast.error(mensaje.texto)
    router.replace(pathname)
  }, [aviso, pathname, router])

  function desconectar() {
    iniciarTransicion(async () => {
      const resultado = await desconectarGoogle()
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success('Google Calendar desconectado')
      setConfirmando(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {estado === 'activa' ? (
          <CalendarCheck2 aria-hidden className="size-4 text-emerald-600" />
        ) : estado === 'revocada' ? (
          <CalendarOff aria-hidden className="size-4 text-amber-500" />
        ) : (
          <CalendarPlus aria-hidden className="size-4 text-slate-500" />
        )}
        <h2 className="text-sm font-semibold text-slate-900">Google Calendar</h2>
      </div>

      {estado === 'activa' ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Conectado</p>
            <p className="truncate text-xs text-slate-500">{googleEmail}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirmando(true)}
          >
            Desconectar
          </Button>
        </div>
      ) : estado === 'revocada' ? (
        <a
          href={RUTA_CONECTAR}
          className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-xs ring-1 ring-amber-200 transition-colors active:bg-amber-50"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Reconecta tu Google Calendar</p>
            <p className="truncate text-xs text-slate-500">
              {googleEmail
                ? `La conexión con ${googleEmail} dejó de funcionar`
                : 'La conexión dejó de funcionar'}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-700">
            Reconectar
          </span>
        </a>
      ) : (
        <a
          href={RUTA_CONECTAR}
          className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 transition-colors active:bg-slate-50"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Conecta tu Google Calendar</p>
            <p className="text-xs text-slate-500">Tus visitas se agendarán también ahí</p>
          </div>
          <span className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white">
            Conectar
          </span>
        </a>
      )}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desconectar Google Calendar</DialogTitle>
            <DialogDescription>
              Tus próximas visitas dejarán de sincronizarse con tu calendario de Google. Puedes
              reconectar cuando quieras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pendiente} onClick={() => setConfirmando(false)}>
              Volver
            </Button>
            <Button variant="destructive" disabled={pendiente} onClick={desconectar}>
              {pendiente ? 'Desconectando…' : 'Sí, desconectar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
