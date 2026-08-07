'use client'

/**
 * DEMO DESECHABLE — no forma parte del producto.
 *
 * Tres conceptos de introducción para el primer ingreso del asesor, para
 * elegir uno antes de construir. Ruta pública (/demo-bienvenida): datos
 * falsos, nada toca la base. Borrar esta carpeta cuando se decida.
 */

import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Flame,
  Phone,
  Send,
  Smartphone,
  Sparkles,
  User,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wordmark } from '@/components/marca/wordmark'

const ASESOR = { nombre: 'Jair Maldonado', iniciales: 'JM' }
const PRIMER_NOMBRE = ASESOR.nombre.split(' ')[0]

const FONDO_CALIDO =
  'linear-gradient(150deg,#F5F1E8 0%,#F3DCC2 32%,#EBBF9A 62%,#DFA987 100%)'

/* ────────────────────────────────────────────────────────────────────
   Concepto A — Bienvenida a pantalla completa (3 pasos, una sola vez)
   ──────────────────────────────────────────────────────────────────── */

function ConceptoA() {
  const [paso, setPaso] = useState(0)

  if (paso === 3) return <DashboardFalso onReiniciar={() => setPaso(0)} />

  return (
    <div
      className="flex h-full flex-col px-6 pt-14 pb-8"
      style={{ background: FONDO_CALIDO }}
    >
      {/* Progreso: tres puntos, sin número de paso — no se siente formulario */}
      <div className="flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 rounded-full transition-all duration-300',
              i === paso ? 'w-6 bg-slate-800' : 'w-1.5 bg-slate-800/25'
            )}
          />
        ))}
      </div>

      {paso === 0 ? (
        <div className="flex flex-1 flex-col justify-center">
          <Wordmark className="text-[18px] text-slate-900" />
          <h1 className="mt-8 text-[2rem] leading-[1.15] font-semibold tracking-tight text-slate-900">
            Hola,
            <br />
            {PRIMER_NOMBRE}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
            Este es tu lugar de trabajo. Aquí llegan tus leads, agendas tus
            visitas y llevas tus números del mes — todo en un solo lugar.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            Son dos minutos para dejarlo a tu medida.
          </p>
        </div>
      ) : null}

      {paso === 1 ? (
        <div className="flex flex-1 flex-col justify-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Que te reconozcan
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Tu foto aparece cuando te asignan un lead y en tu ficha de asesor.
          </p>

          <button
            type="button"
            className="mt-7 flex items-center gap-4 self-start text-left"
          >
            <span className="relative flex size-20 items-center justify-center rounded-full bg-slate-800 text-2xl font-semibold text-white">
              {ASESOR.iniciales}
              <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full bg-white shadow-glass-sm ring-1 ring-black/5">
                <Camera aria-hidden className="size-3.5 text-slate-700" />
              </span>
            </span>
            <span className="text-sm font-medium text-slate-700 underline underline-offset-4">
              Subir una foto
            </span>
          </button>

          <div className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-apodo" className="text-slate-700">
                ¿Cómo te llamamos?
              </Label>
              <Input
                id="a-apodo"
                defaultValue={PRIMER_NOMBRE}
                className="h-11 border-white/80 bg-white/70"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-tel" className="text-slate-700">
                Tu WhatsApp
              </Label>
              <Input
                id="a-tel"
                inputMode="tel"
                placeholder="81 1234 5678"
                className="h-11 border-white/80 bg-white/70"
              />
            </div>
          </div>
        </div>
      ) : null}

      {paso === 2 ? (
        <div className="flex flex-1 flex-col justify-center">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Para no perderte nada
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Puedes cambiarlo después desde tu perfil.
          </p>

          <ul className="mt-7 flex flex-col gap-2.5">
            <FilaActivar
              icono={<Bell aria-hidden className="size-4" />}
              titulo="Avisos al instante"
              detalle="Te avisamos en cuanto te asignen un lead."
            />
            <FilaActivar
              icono={<Smartphone aria-hidden className="size-4" />}
              titulo="Instalar la app"
              detalle="Ábrela desde tu pantalla de inicio."
            />
            <FilaActivar
              icono={<CalendarDays aria-hidden className="size-4" />}
              titulo="Conectar tu calendario"
              detalle="Tus visitas se copian a Google Calendar."
            />
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          onClick={() => setPaso(paso + 1)}
          className="h-12 w-full text-[15px]"
        >
          {paso === 0 ? 'Empezar' : paso === 1 ? 'Continuar' : 'Entrar a Klo-Ser'}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
        <button
          type="button"
          onClick={() => setPaso(3)}
          className="text-center text-sm text-slate-600 underline underline-offset-4"
        >
          {paso === 2 ? 'Ahora no' : 'Saltar por ahora'}
        </button>
      </div>
    </div>
  )
}

function FilaActivar({
  icono,
  titulo,
  detalle,
}: {
  icono: React.ReactNode
  titulo: string
  detalle: string
}) {
  const [activo, setActivo] = useState(false)

  return (
    <li>
      <button
        type="button"
        onClick={() => setActivo(!activo)}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/80 bg-white/65 p-3.5 text-left shadow-glass-sm"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
          {icono}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">{titulo}</span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">
            {detalle}
          </span>
        </span>
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
            activo ? 'bg-slate-800 text-white' : 'border border-slate-300'
          )}
        >
          {activo ? <Check aria-hidden className="size-3.5" /> : null}
        </span>
      </button>
    </li>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Concepto B — Checklist de arranque (no bloquea, vive en el dashboard)
   ──────────────────────────────────────────────────────────────────── */

const TAREAS_INICIALES = [
  { id: 'foto', titulo: 'Sube tu foto', hecho: false },
  { id: 'tel', titulo: 'Confirma tu WhatsApp', hecho: false },
  { id: 'avisos', titulo: 'Activa los avisos', hecho: false },
  { id: 'app', titulo: 'Instala la app', hecho: true },
  { id: 'cal', titulo: 'Conecta tu calendario', hecho: false },
]

function ConceptoB() {
  const [tareas, setTareas] = useState(TAREAS_INICIALES)
  const hechas = tareas.filter((t) => t.hecho).length
  const completo = hechas === tareas.length

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Hola, {PRIMER_NOMBRE}
        </h1>
        <p className="text-sm text-slate-500">Viernes, 7 de agosto de 2026</p>
      </header>

      {/* La tarjeta de arranque: primera del muro, se va sola al llegar a 5/5 */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
            <Sparkles aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {completo ? '¡Todo listo!' : 'Termina de configurar tu cuenta'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {completo
                ? 'Esta tarjeta desaparece al recargar.'
                : `${hechas} de ${tareas.length} · te toma dos minutos`}
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-500"
            style={{ width: `${(hechas / tareas.length) * 100}%` }}
          />
        </div>

        <ul className="mt-3 flex flex-col">
          {tareas.map((tarea) => (
            <li key={tarea.id}>
              <button
                type="button"
                onClick={() =>
                  setTareas(
                    tareas.map((t) =>
                      t.id === tarea.id ? { ...t, hecho: !t.hecho } : t
                    )
                  )
                }
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full transition-colors',
                    tarea.hecho
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300'
                  )}
                >
                  {tarea.hecho ? <Check aria-hidden className="size-3" /> : null}
                </span>
                <span
                  className={cn(
                    'flex-1 text-sm',
                    tarea.hecho
                      ? 'text-slate-400 line-through'
                      : 'text-slate-700'
                  )}
                >
                  {tarea.titulo}
                </span>
                {!tarea.hecho ? (
                  <ChevronRight aria-hidden className="size-4 text-slate-400" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Contenido real del dashboard, atenuado: enseña que NO bloquea */}
      <div className="mt-6 flex flex-col gap-3 opacity-55">
        <div className="flex items-center gap-2">
          <Flame aria-hidden className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-900">Atiende ahora</h2>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            2
          </span>
        </div>
        {['Marisol Treviño', 'Carlos Ibarra'].map((nombre) => (
          <div
            key={nombre}
            className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs ring-1 ring-red-200"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{nombre}</p>
              <p className="mt-0.5 text-xs text-slate-500">Asignado hace 3 horas</p>
            </div>
            <ChevronRight aria-hidden className="size-4 text-slate-400" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────
   Concepto C — Conversacional (una pregunta a la vez)
   ──────────────────────────────────────────────────────────────────── */

const GUION = [
  {
    dice: `Hola, ${PRIMER_NOMBRE}. Soy Klo-Ser — de aquí en adelante trabajamos juntos.`,
    pregunta: '¿Cómo prefieres que te llame?',
    respuesta: PRIMER_NOMBRE,
    tipo: 'texto' as const,
  },
  {
    dice: 'Listo. Ahora, una foto tuya: es la que ven tus compañeros y la que va en tu ficha.',
    pregunta: null,
    respuesta: 'Subir foto',
    tipo: 'accion' as const,
  },
  {
    dice: 'Perfecto. ¿A qué número te llegan los WhatsApp de tus clientes?',
    pregunta: null,
    respuesta: '81 1234 5678',
    tipo: 'texto' as const,
  },
  {
    dice: 'Con eso basta para empezar. Te aviso en cuanto te caiga el primer lead.',
    pregunta: null,
    respuesta: 'Vamos',
    tipo: 'final' as const,
  },
]

function ConceptoC() {
  const [turno, setTurno] = useState(0)
  const [contestadas, setContestadas] = useState<string[]>([])

  if (turno >= GUION.length) {
    return <DashboardFalso onReiniciar={() => { setTurno(0); setContestadas([]) }} />
  }

  const actual = GUION[turno]

  return (
    <div
      className="flex h-full flex-col px-5 pt-14 pb-8"
      style={{ background: FONDO_CALIDO }}
    >
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto">
        {GUION.slice(0, turno + 1).map((linea, i) => (
          <div key={i} className="flex flex-col gap-3">
            {/* Lo que dice el sistema */}
            <div className="flex items-end gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
                KS
              </span>
              <p className="max-w-[80%] rounded-2xl rounded-bl-sm border border-white/80 bg-white/75 px-4 py-2.5 text-sm leading-relaxed text-slate-800 shadow-glass-sm">
                {linea.dice}
                {linea.pregunta ? (
                  <>
                    <br />
                    <span className="mt-1 block font-medium">{linea.pregunta}</span>
                  </>
                ) : null}
              </p>
            </div>

            {/* Lo que ya contestó el asesor */}
            {contestadas[i] ? (
              <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white">
                {contestadas[i]}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Compositor: cambia de forma según lo que se está pidiendo */}
      <div className="mt-5">
        {actual.tipo === 'texto' ? (
          <div className="flex items-center gap-2">
            <Input
              defaultValue={actual.respuesta}
              className="h-12 flex-1 border-white/80 bg-white/70"
            />
            <Button
              type="button"
              size="icon"
              className="size-12 shrink-0 rounded-full"
              aria-label="Enviar"
              onClick={() => {
                setContestadas([...contestadas, actual.respuesta])
                setTurno(turno + 1)
              }}
            >
              <Send aria-hidden className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="h-12 w-full text-[15px]"
            onClick={() => {
              setContestadas([...contestadas, actual.respuesta])
              setTurno(turno + 1)
            }}
          >
            {actual.tipo === 'accion' ? (
              <Camera aria-hidden className="size-4" />
            ) : null}
            {actual.respuesta}
          </Button>
        )}
        <button
          type="button"
          onClick={() => setTurno(GUION.length)}
          className="mt-3 w-full text-center text-sm text-slate-600 underline underline-offset-4"
        >
          Luego lo hago
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────── */

/** Aterrizaje común de A y C: se ve que la intro termina en el trabajo real. */
function DashboardFalso({ onReiniciar }: { onReiniciar: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
        {ASESOR.iniciales}
      </span>
      <div>
        <p className="text-lg font-semibold text-slate-900">Hola, {PRIMER_NOMBRE}</p>
        <p className="mt-1 text-sm text-slate-500">
          Aquí entra tu cola del día.
          <br />
          La bienvenida no se vuelve a mostrar.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onReiniciar} className="h-10">
        Ver de nuevo
      </Button>
    </div>
  )
}

const CONCEPTOS = [
  {
    id: 'a',
    nombre: 'Bienvenida',
    resumen: 'Toma la pantalla, 3 pasos, una sola vez.',
    favor: [
      'Momento memorable: es lo primero que ve del sistema.',
      'La tasa de completado es la más alta de las tres.',
      'Absorbe los 3 avisos que hoy compiten en el primer ingreso.',
    ],
    contra: [
      'Bloquea. Un asesor que entra corriendo entre citas lo va a saltar.',
      'Si se salta, no hay segunda oportunidad — necesita respaldo.',
    ],
    cuando: 'Si lo importante es que el asesor entienda qué es Klo-Ser antes de tocarlo.',
    render: <ConceptoA />,
  },
  {
    id: 'b',
    nombre: 'Checklist',
    resumen: 'No bloquea. Vive arriba del dashboard hasta completarse.',
    favor: [
      'Cero fricción: puede trabajar desde el segundo uno.',
      'Se retoma solo — no hay «me lo salté y ya».',
      'Convierte 3 banners flotantes en 1 lista ordenada.',
    ],
    contra: [
      'Se puede ignorar para siempre.',
      'El saludo es más tibio: no hay «bienvenida», hay una tarea más.',
    ],
    cuando: 'Si lo importante es no estorbarle y que la configuración se complete sola con el tiempo.',
    render: <ConceptoB />,
  },
  {
    id: 'c',
    nombre: 'Conversacional',
    resumen: 'El sistema pregunta, el asesor contesta. Una cosa a la vez.',
    favor: [
      'Es la que conecta con el «no somos robots» de las grabaciones.',
      'Una sola decisión por pantalla: nada se siente formulario.',
      'Sienta el tono para el one-on-one con datos que viene después.',
    ],
    contra: [
      'La más cara de construir y de mantener (el guion es contenido).',
      'Se hace lenta si algún día son 8 campos en vez de 3.',
    ],
    cuando: 'Si Klo-Ser va a tener voz propia y quieren que se note desde el minuto uno.',
    render: <ConceptoC />,
  },
]

export default function PaginaDemoBienvenida() {
  const [activo, setActivo] = useState('a')
  const concepto = CONCEPTOS.find((c) => c.id === activo)!

  return (
    <main className="min-h-dvh bg-background px-5 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Demo · no es producto
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Introducción al primer ingreso del asesor
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Tres formas de resolver el mismo encargo — saludar al asesor y
            dejarlo personalizar su perfil. Toca los conceptos y navega dentro
            del teléfono: los tres funcionan.
          </p>
        </header>

        <div className="mt-7 flex flex-wrap gap-2">
          {CONCEPTOS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActivo(c.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                c.id === activo
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          {/* Teléfono */}
          <div className="shrink-0 self-center lg:self-start">
            <div className="h-[780px] w-[368px] overflow-hidden rounded-[2.75rem] border-[10px] border-slate-900 bg-white shadow-glass">
              {/* key: reinicia el estado interno al cambiar de concepto */}
              <div key={concepto.id} className="h-full">
                {concepto.render}
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="flex flex-1 flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {concepto.nombre}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{concepto.resumen}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  A favor
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {concepto.favor.map((punto) => (
                    <li key={punto} className="flex gap-2 text-sm text-slate-700">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-900" />
                      {punto}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  En contra
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {concepto.contra.map((punto) => (
                    <li key={punto} className="flex gap-2 text-sm text-slate-700">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
                      {punto}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="rounded-xl bg-white/60 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200">
              <strong className="font-medium">Cuándo elegirla:</strong>{' '}
              {concepto.cuando}
            </p>

            <div className="rounded-xl border border-slate-300 border-dashed p-4">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Lo que hay que decidir aparte
              </p>
              <ul className="mt-2.5 flex flex-col gap-2.5 text-sm leading-relaxed text-slate-700">
                <li className="flex gap-2">
                  <User aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                  <span>
                    Hoy el perfil solo tiene <strong>nombre, teléfono y foto</strong>.
                    Cualquier otra cosa (apodo, zonas que trabaja, meta del mes)
                    son columnas nuevas.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Camera aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                  <span>
                    La foto <strong>no tiene dónde guardarse</strong> todavía: la
                    columna existe, pero falta el bucket de Storage.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Bell aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                  <span>
                    En el primer ingreso ya salen <strong>tres avisos</strong>{' '}
                    (instalar la app, activar avisos, conectar calendario). La
                    intro debería absorberlos, no sumarse a ellos.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Phone aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                  <span>
                    Para saber que es «la primera vez» hace falta una columna
                    nueva — hoy no hay forma de distinguirlo.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
