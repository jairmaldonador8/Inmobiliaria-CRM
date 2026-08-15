'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
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
import { completarBienvenida, type TemaPluma } from '@/lib/bienvenida/acciones'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** El evento beforeinstallprompt (Chrome/Android): permite instalar con un botón. */
type EventoInstalacion = Event & { prompt: () => Promise<void> }

const PASOS = ['Bienvenida', 'Tu tema', 'Tus avisos', 'Listo'] as const

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
      router.replace('/asesor')
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* progreso: un punto por paso */}
        <div className="mb-6 flex items-center justify-center gap-2 pt-2" aria-hidden>
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
          <section className="flex flex-1 flex-col">
            <div className="flex justify-center pt-4">
              <Image
                src="/marca/gallo-camina.webp"
                alt="Klo, el gallo de Klo-Ser"
                width={150}
                height={150}
                priority
                unoptimized
                className="h-36 w-auto"
              />
            </div>
            <h1 className="mt-6 text-center text-3xl text-slate-900">
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
          <section className="flex flex-1 flex-col">
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
          <section className="flex flex-1 flex-col">
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

              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Y para tenerla como app
                </p>
                {promptInstalar ? (
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => void promptInstalar.prompt()}
                  >
                    Instalar Klo-Ser
                  </Button>
                ) : esIos ? (
                  <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                    <Share className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    En iPhone: toca Compartir y luego «Agregar a pantalla de inicio».
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    En el menú de tu navegador busca «Instalar aplicación».
                  </p>
                )}
              </div>
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
          <section className="flex flex-1 flex-col">
            <div className="flex justify-center pt-4">
              <Image
                src="/marca/gallo-voltea.webp"
                alt="Klo"
                width={130}
                height={130}
                unoptimized
                className="h-32 w-auto"
              />
            </div>
            <h1 className="mt-6 text-center text-3xl text-slate-900">Todo listo, {nombrePila}</h1>
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
