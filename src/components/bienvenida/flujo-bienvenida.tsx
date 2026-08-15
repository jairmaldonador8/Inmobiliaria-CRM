'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  CircleCheck,
  History,
  Share,
  Zap,
} from 'lucide-react'

import { activarAvisos } from '@/lib/push/cliente'
import { Wordmark } from '@/components/marca/wordmark'
import { completarBienvenida, type TemaPluma } from '@/lib/bienvenida/acciones'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** El evento beforeinstallprompt (Chrome/Android): permite instalar con un botón. */
type EventoInstalacion = Event & { prompt: () => Promise<void> }

const PASOS = ['Bienvenida', 'Tu tema', 'Tus avisos', 'Listo'] as const

/**
 * Klo en chiquito, con la MISMA animación que ya vive en la pantalla de
 * carga (sprites de public/marca + clases .gallo-carga de globals.css):
 * camina durante los pasos y, al llegar al final, se voltea a verte.
 */
function KloAnfitrion({ volteado }: { volteado: boolean }) {
  return (
    <div aria-hidden className="relative mx-auto flex flex-col items-center">
      {/* Resplandor difuso (SIN contorno): invisible en claro; en oscuro le
          da piso de luz al gallo negro para que nunca desaparezca. */}
      <div className="absolute top-1 left-1/2 h-28 w-36 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(247_246_243/0.85),transparent)] blur-md" />
      <div className="relative h-28 w-28">
        {volteado ? (
          <span className="gallo-carga gallo-carga--voltea" />
        ) : (
          <>
            <span className="gallo-carga gallo-carga--camina" />
            <span className="gallo-carga gallo-carga--precarga" />
          </>
        )}
      </div>
      {/* La firma de la casa, como en la pantalla de carga */}
      <Wordmark className="relative mt-1 pl-[0.42em] text-[13px] text-slate-900" />
    </div>
  )
}

function aplicarTema(tema: TemaPluma) {
  document.documentElement.classList.toggle('dark', tema === 'negro')
  document.cookie = `tema=${tema}; path=/; max-age=31536000; samesite=lax`
}

/** Mini-vista previa de un tema: una tarjetita con barras, en miniatura. */
function VistaTema({
  tema,
  elegido,
  alElegir,
}: {
  tema: TemaPluma
  elegido: boolean
  alElegir: () => void
}) {
  const oscuro = tema === 'negro'
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-pressed={elegido}
      className={cn(
        'group relative flex-1 rounded-2xl p-4 text-left transition-all',
        oscuro ? 'bg-[#0B0B0C]' : 'bg-[#F7F6F3]',
        elegido
          ? 'ring-2 ring-slate-900 shadow-lg'
          : 'ring-1 ring-slate-200 hover:ring-slate-400'
      )}
    >
      <div
        className={cn(
          'rounded-xl p-3',
          oscuro ? 'bg-[#151517] shadow-[inset_0_0_0_1px_rgb(252_252_250/0.14)]' : 'bg-white shadow-sm'
        )}
      >
        <div className={cn('h-1.5 w-10 rounded-full', oscuro ? 'bg-[#3A3A3F]' : 'bg-[#D0CEC7]')} />
        <div
          className={cn(
            'mt-2 font-logo text-2xl font-light',
            oscuro ? 'text-[#F5F4F2]' : 'text-[#141414]'
          )}
          style={{ fontFamily: 'var(--font-logo)' }}
        >
          12
        </div>
        <div className="mt-2 flex items-end gap-1">
          {[40, 65, 90, 50].map((h, i) => (
            <span
              key={i}
              style={{ height: `${h * 0.3}px` }}
              className={cn(
                'w-2 rounded-sm',
                i === 2
                  ? oscuro
                    ? 'bg-[#F5F4F2]'
                    : 'bg-[#141414]'
                  : oscuro
                    ? 'bg-[#2A2A2E]'
                    : 'bg-[#E3E1DB]'
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={cn('text-sm font-medium', oscuro ? 'text-[#F5F4F2]' : 'text-[#141414]')}>
          {oscuro ? 'Negro grafito' : 'Blanco galería'}
        </span>
        {elegido ? (
          <CircleCheck className={cn('size-5', oscuro ? 'text-[#F5F4F2]' : 'text-[#141414]')} aria-hidden />
        ) : null}
      </div>
    </button>
  )
}

export function FlujoBienvenida({
  nombre,
  temaInicial,
}: {
  nombre: string
  temaInicial: TemaPluma
}) {
  const router = useRouter()
  const [paso, setPaso] = useState(0)
  const [tema, setTema] = useState<TemaPluma>(temaInicial)
  const [estadoAvisos, setEstadoAvisos] = useState<'pendiente' | 'activando' | 'ok' | 'error'>(
    'pendiente'
  )
  const [errorAvisos, setErrorAvisos] = useState<string | null>(null)
  const [promptInstalar, setPromptInstalar] = useState<EventoInstalacion | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const nombrePila = useMemo(() => nombre.trim().split(/\s+/)[0] ?? nombre, [nombre])
  const esIos = useMemo(
    () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent),
    []
  )

  // Chrome/Android avisa cuando la app es instalable: lo guardamos para
  // ofrecer el botón real de instalar en el paso de avisos.
  useEffect(() => {
    function capturar(e: Event) {
      e.preventDefault()
      setPromptInstalar(e as EventoInstalacion)
    }
    window.addEventListener('beforeinstallprompt', capturar)
    return () => window.removeEventListener('beforeinstallprompt', capturar)
  }, [])

  function elegirTema(nuevo: TemaPluma) {
    setTema(nuevo)
    aplicarTema(nuevo) // en vivo: la pantalla entera cambia al tocar
  }

  async function alActivarAvisos() {
    setEstadoAvisos('activando')
    setErrorAvisos(null)
    const resultado = await activarAvisos()
    if (resultado.ok) {
      setEstadoAvisos('ok')
      toast.success('Avisos activados — cuando te toque un lead, te suena')
    } else {
      setEstadoAvisos('error')
      setErrorAvisos(resultado.error)
    }
  }

  function terminar() {
    iniciarTransicion(async () => {
      const resultado = await completarBienvenida(tema)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      // La bienvenida YA pidió avisos e instalación: los banners antiguos
      // del área del asesor quedan descartados para no pedir doble.
      try {
        window.localStorage.setItem(
          'kloser-push-banner',
          JSON.stringify({ descartadoInstalarEn: Date.now(), descartadoAvisosEn: Date.now() })
        )
      } catch {
        /* almacenamiento bloqueado: el banner viejo sabrá comportarse */
      }
      router.replace('/asesor')
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Klo, el anfitrión — la animación que ya vivía en el sistema */}
        <div className="pt-2">
          <KloAnfitrion volteado={paso === 3} />
        </div>

        {/* progreso: un punto por paso */}
        <div className="mt-2 mb-5 flex items-center justify-center gap-2" aria-hidden>
          {PASOS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === paso ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-300'
              )}
            />
          ))}
        </div>

        {/* ── Paso 0: el saludo ── */}
        {paso === 0 ? (
          <section
            key="p0"
            className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h1 className="mt-2 text-center text-3xl text-slate-900">
              Hola, {nombrePila}
            </h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              Bienvenido a Klo-Ser — aquí viven tus leads, tus visitas y tus números. Tres
              promesas antes de empezar:
            </p>

            <ul className="mt-6 grid gap-3">
              {[
                {
                  Icono: Zap,
                  titulo: 'No se te cae un lead',
                  detalle: 'Cada persona interesada llega aquí al instante, con su historia completa.',
                },
                {
                  Icono: Building2,
                  titulo: 'El inventario en tu bolsillo',
                  detalle: 'Todas las propiedades, con fotos y datos, listas para compartir.',
                },
                {
                  Icono: History,
                  titulo: 'Tu historial te respalda',
                  detalle: 'Lo que registras es tuyo: tu trabajo queda contado y defendido.',
                },
              ].map(({ Icono, titulo, detalle }) => (
                <li
                  key={titulo}
                  className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-content-center rounded-lg bg-slate-900 text-white">
                    <Icono className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{titulo}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detalle}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <Button size="lg" className="w-full" onClick={() => setPaso(1)}>
                Empezar
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : null}

        {/* ── Paso 1: el tema ── */}
        {paso === 1 ? (
          <section
            key="p1"
            className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h1 className="mt-4 text-center text-3xl text-slate-900">¿Cómo prefieres trabajar?</h1>
            <p className="mt-2 text-center text-sm text-slate-500">
              Toca uno y míralo en vivo — lo puedes cambiar cuando quieras con la luna 🌙 de la
              barra.
            </p>

            <div className="mt-8 flex gap-3">
              <VistaTema tema="blanco" elegido={tema === 'blanco'} alElegir={() => elegirTema('blanco')} />
              <VistaTema tema="negro" elegido={tema === 'negro'} alElegir={() => elegirTema('negro')} />
            </div>

            <div className="mt-auto pt-8">
              <Button size="lg" className="w-full" onClick={() => setPaso(2)}>
                Continuar
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : null}

        {/* ── Paso 2: los avisos ── */}
        {paso === 2 ? (
          <section
            key="p2"
            className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h1 className="mt-4 text-center text-3xl text-slate-900">Que te suene el teléfono</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              Cuando estés de guardia y entre un lead, Klo-Ser te avisa al momento. Sin esto, la
              mitad del sistema se queda muda.
            </p>

            <div className="mt-8 rounded-xl bg-white p-5 ring-1 ring-slate-200">
              {estadoAvisos === 'ok' ? (
                <div className="flex items-center gap-3 text-slate-900">
                  <span className="grid size-9 place-content-center rounded-full bg-slate-900 text-white">
                    <Check className="size-4" aria-hidden />
                  </span>
                  <p className="text-sm font-semibold">Avisos activados ✓</p>
                </div>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={alActivarAvisos}
                    disabled={estadoAvisos === 'activando'}
                  >
                    <BellRing data-icon="inline-start" />
                    {estadoAvisos === 'activando' ? 'Activando…' : 'Activar notificaciones'}
                  </Button>
                  {estadoAvisos === 'error' && errorAvisos ? (
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      {errorAvisos} — puedes continuar y activarlas después desde tu Perfil.
                    </p>
                  ) : null}
                </>
              )}

            </div>

            <div className="mt-3 rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-900">Instala Klo-Ser como app</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Así vive en tu pantalla de inicio, abre al instante y los avisos llegan como de
                cualquier app.
              </p>
              {promptInstalar ? (
                <Button size="lg" className="mt-3 w-full" onClick={() => void promptInstalar.prompt()}>
                  Instalar Klo-Ser
                </Button>
              ) : esIos ? (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
                  <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
                  En iPhone: toca el botón Compartir de Safari y elige «Agregar a pantalla de
                  inicio».
                </p>
              ) : (
                <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
                  En el menú de tu navegador (⋮) busca «Instalar aplicación» o «Agregar a
                  pantalla de inicio».
                </p>
              )}
            </div>

            <div className="mt-auto pt-8">
              <Button size="lg" className="w-full" onClick={() => setPaso(3)}>
                Continuar
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : null}

        {/* ── Paso 3: listo ── */}
        {paso === 3 ? (
          <section
            key="p3"
            className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h1 className="mt-2 text-center text-3xl text-slate-900">Todo listo, {nombrePila}</h1>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
              Tema {tema === 'negro' ? 'negro grafito' : 'blanco galería'}
              {estadoAvisos === 'ok' ? ' y avisos activados' : ''}. Una última cosa: lo que no
              está en Klo-Ser, no existe — registra todo y el sistema trabaja para ti.
            </p>

            <div className="mt-auto pt-8">
              <Button size="lg" className="w-full" onClick={terminar} disabled={pendiente}>
                {pendiente ? 'Abriendo…' : 'Entrar a Klo-Ser'}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </section>
        ) : null}

        {paso > 0 ? (
          <button
            type="button"
            onClick={() => setPaso(paso - 1)}
            className="mx-auto mt-4 text-xs text-slate-400 underline-offset-4 hover:text-slate-600 hover:underline"
          >
            Volver
          </button>
        ) : null}
      </main>
    </div>
  )
}
