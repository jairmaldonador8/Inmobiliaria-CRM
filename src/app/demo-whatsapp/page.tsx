'use client'

/**
 * DEMO DESECHABLE — no forma parte del producto.
 *
 * Recorrido del flujo de «salida instrumentada a WhatsApp»
 * (docs/ultrapowers/specs/2026-08-07-salida-whatsapp-design.md) para verlo
 * antes de construirlo. Datos falsos, nada toca la base. Ruta pública.
 * Borrar esta carpeta cuando el flujo esté implementado.
 */

import { useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Flame,
  MessageCircle,
  NotebookPen,
  Phone,
  RotateCcw,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const LEAD = {
  nombre: 'Marisol Treviño',
  fuente: 'inmuebles24',
  antiguedad: 'hace 3 horas',
  propiedad: 'Casa en Cumbres Elite · $4,850,000',
}

const ASESOR = 'Jair'

/**
 * Registro formal y confiable, sin coloquialismos — es lo que el CLIENTE
 * recibe a nombre de Montana Realty. El tono cercano se reserva para la
 * interfaz interna del asesor.
 */
const PLANTILLAS = [
  {
    nombre: 'Primer contacto',
    texto: `Hola Marisol, soy ${ASESOR}, asesor de Montana Realty. Vi su interés en la Casa en Cumbres Elite. ¿Le comparto más fotos e información?`,
  },
  {
    nombre: 'Agendar visita',
    texto: 'Hola Marisol, ¿tiene disponibilidad esta semana para conocer la propiedad? Tengo espacio el jueves y el viernes.',
  },
  {
    nombre: 'Seguimiento',
    texto: 'Hola Marisol, ¿tuvo oportunidad de revisar la información que le envié? Quedo atento a sus comentarios.',
  },
]

/** Pasos del recorrido. */
type Paso =
  | 'ficha'
  | 'plantillas'
  | 'en-whatsapp'
  | 'desenlace'
  | 'hoja-visita'
  | 'resuelto'
  | 'cola'

type Desenlace = 'cita' | 'contesto' | 'no_contesto' | 'no_interesa' | 'ahora_no'

const ETAPA_TRAS_DESENLACE: Record<Desenlace, string> = {
  cita: 'Cita agendada',
  contesto: 'Contactado',
  no_contesto: 'Contactado',
  no_interesa: 'Cerrado perdido',
  ahora_no: 'Contactado',
}

/** ¿Sigue el lead en la lista «Sin respuesta» tras este desenlace? */
const SIGUE_SIN_RESPUESTA: Record<Desenlace, boolean> = {
  cita: false,
  contesto: false,
  no_contesto: true,
  no_interesa: false,
  ahora_no: true,
}

const ETIQUETA_DESENLACE: Record<Desenlace, string> = {
  cita: 'Agendé una cita',
  contesto: 'Me contestó',
  no_contesto: 'No me contestó',
  no_interesa: 'No le interesa',
  ahora_no: 'Ahora no',
}

function BadgeEtapa({ etapa }: { etapa: string }) {
  const clases: Record<string, string> = {
    Nuevo: 'bg-blue-100 text-blue-700',
    Contactado: 'bg-sky-100 text-sky-700',
    'Cita agendada': 'bg-violet-100 text-violet-700',
    'Cerrado perdido': 'bg-slate-200 text-slate-600',
  }
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium',
        clases[etapa] ?? 'bg-slate-100 text-slate-600'
      )}
    >
      {etapa}
    </span>
  )
}

/** Ficha del lead: la pantalla real, con la barra de acciones 2×2. */
function Ficha({
  etapa,
  pendiente,
  onWhatsApp,
}: {
  etapa: string
  pendiente: boolean
  onWhatsApp: () => void
}) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-slate-50 px-4 pt-6 pb-10">
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
        <ArrowLeft aria-hidden className="size-4" />
        Volver a leads
      </span>

      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{LEAD.nombre}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEtapa etapa={etapa} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {LEAD.fuente}
          </span>
          <span className="text-xs text-slate-400">{LEAD.antiguedad}</span>
        </div>
      </header>

      {pendiente ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
          <MessageCircle aria-hidden className="size-3.5 shrink-0" />
          Le escribiste por WhatsApp y todavía no dices cómo te fue.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <span className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-xs">
          <Phone aria-hidden className="size-5" />
          Llamar
        </span>
        <button
          type="button"
          onClick={onWhatsApp}
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-medium text-white active:translate-y-px"
        >
          <MessageCircle aria-hidden className="size-5" />
          WhatsApp
        </button>
        <span className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-xs">
          <NotebookPen aria-hidden className="size-5" />
          Seguimiento
        </span>
        <span className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 shadow-xs">
          <CalendarDays aria-hidden className="size-5" />
          Agendar visita
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs text-slate-500">Propiedad de interés</p>
        <p className="mt-0.5 text-sm font-medium text-slate-900">{LEAD.propiedad}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-700">Lead recibido de Inmuebles24</p>
          <p className="mt-0.5 text-xs text-slate-400">{LEAD.antiguedad}</p>
        </div>
      </div>
    </div>
  )
}

/** Hoja inferior reutilizada por plantillas, desenlace y visita. */
function Hoja({ titulo, descripcion, children }: {
  titulo: string
  descripcion?: string
  children: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 flex flex-col justify-end bg-slate-900/40">
      <div className="max-h-[85%] overflow-y-auto rounded-t-2xl bg-white px-4 pt-4 pb-6">
        <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
        {descripcion ? <p className="mt-1 text-sm text-slate-500">{descripcion}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

/** Cola del día con la sección nueva. */
function ColaDelDia({ sinRespuesta }: { sinRespuesta: boolean }) {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Hola, {ASESOR}</h1>
        <p className="text-sm text-slate-500">Viernes, 7 de agosto de 2026</p>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Flame aria-hidden className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-900">Atiende ahora</h2>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            1
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs ring-1 ring-red-200">
          <div>
            <p className="text-sm font-medium text-slate-900">Carlos Ibarra</p>
            <p className="mt-0.5 text-xs text-slate-500">Asignado hace 1 hora</p>
          </div>
          <ChevronRight aria-hidden className="size-4 text-slate-400" />
        </div>
      </div>

      {/* La sección nueva */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle aria-hidden className="size-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900">Sin respuesta</h2>
          {sinRespuesta ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              1
            </span>
          ) : null}
        </div>
        {sinRespuesta ? (
          <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-xs ring-1 ring-emerald-200">
            <div>
              <p className="text-sm font-medium text-slate-900">{LEAD.nombre}</p>
              <p className="mt-0.5 text-xs text-slate-500">Le escribiste hace 5 minutos</p>
            </div>
            <ChevronRight aria-hidden className="size-4 text-slate-400" />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
            Nadie te quedó a deber respuesta 🎉
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 opacity-55">
        <h2 className="text-sm font-semibold text-slate-900">Necesitan seguimiento</h2>
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
          Ninguno lleva más de 24 h 🎉
        </p>
      </div>
    </div>
  )
}

/** Qué escribe el sistema en cada paso — el panel de la derecha. */
const NARRACION: Record<string, { titulo: string; puntos: string[]; nota?: string }> = {
  ficha: {
    titulo: 'Punto de partida',
    puntos: [
      'El lead está en «Nuevo» y aparece en «Atiende ahora».',
      'La barra de acciones 2×2 es la que ya existe hoy.',
    ],
    nota: 'Toca WhatsApp en el teléfono para empezar.',
  },
  plantillas: {
    titulo: 'Esto ya existe hoy',
    puntos: [
      'La hoja de plantillas y la vista previa rellenada ya están construidas.',
      'Las plantillas las administra el admin; viven en `plantillas_mensajes`.',
    ],
    nota: 'No se toca nada de esta pantalla. Lo que cambia es qué pasa al elegir.',
  },
  'en-whatsapp': {
    titulo: 'Al salir: tres escrituras',
    puntos: [
      'Se abre wa.me PRIMERO, de forma síncrona — si se hiciera después, el celular bloquea el popup.',
      'Se inserta el contacto con resultado «pendiente».',
      'Se escribe el seguimiento del timeline, conservando qué plantilla se usó.',
      'La etapa avanza de «Nuevo» a «Contactado» — solo desde «Nuevo», nunca hacia atrás.',
    ],
    nota: 'Nada de esto depende de que el asesor reporte algo.',
  },
  desenlace: {
    titulo: 'Al volver: una pregunta, un toque',
    puntos: [
      'El regreso se detecta con el evento de visibilidad del navegador.',
      'El lead ya está en «Contactado» y ya salió de «Atiende ahora».',
      'Mientras no conteste, vive en la lista «Sin respuesta».',
    ],
    nota: '«Contactado» aquí significa «le escribí», no «hablamos».',
  },
  'hoja-visita': {
    titulo: 'Agendé una cita: dos pasos',
    puntos: [
      'Se abre la hoja de agendar visita que ya existe.',
      'El contacto se marca como «cita» SOLO si la visita se guarda.',
      'Si abandonas el formulario, el lead sigue pendiente — porque no hubo cita.',
    ],
    nota: 'Prueba las dos salidas: guardar y abandonar.',
  },
  cola: {
    titulo: 'La lista nueva',
    puntos: [
      'Hoy, al escribir un seguimiento, el lead queda 24 h invisible entre las dos listas.',
      '«Sin respuesta» cierra esa ventana: el lead cambia de fila, no desaparece.',
      'Cubre los que no reportaste y los que reportaste como «no me contestó».',
    ],
  },
}

export default function PaginaDemoWhatsApp() {
  const [paso, setPaso] = useState<Paso>('ficha')
  const [etapa, setEtapa] = useState('Nuevo')
  const [pendiente, setPendiente] = useState(false)
  const [desenlace, setDesenlace] = useState<Desenlace | null>(null)
  const [plantilla, setPlantilla] = useState<string | null>(null)

  function reiniciar() {
    setPaso('ficha')
    setEtapa('Nuevo')
    setPendiente(false)
    setDesenlace(null)
    setPlantilla(null)
  }

  function elegirPlantilla(nombre: string | null) {
    setPlantilla(nombre)
    setEtapa('Contactado')
    setPendiente(true)
    setPaso('en-whatsapp')
  }

  function resolver(valor: Desenlace) {
    if (valor === 'cita') {
      setPaso('hoja-visita')
      return
    }
    setDesenlace(valor)
    setEtapa(ETAPA_TRAS_DESENLACE[valor])
    setPendiente(SIGUE_SIN_RESPUESTA[valor])
    setPaso('resuelto')
  }

  const narracion =
    NARRACION[paso] ??
    (paso === 'resuelto' && desenlace
      ? {
          titulo: `Reportaste: «${ETIQUETA_DESENLACE[desenlace]}»`,
          puntos: [
            `El lead quedó en «${ETAPA_TRAS_DESENLACE[desenlace]}».`,
            SIGUE_SIN_RESPUESTA[desenlace]
              ? 'Sigue en «Sin respuesta»: nadie ha contestado todavía.'
              : 'Salió de «Sin respuesta».',
            desenlace === 'no_interesa'
              ? 'El cierre pasa por cambiarEtapa, que deja la nota de cierre de la que dependen las métricas.'
              : 'El contacto queda resuelto, con su hora, y alimenta la tasa de respuesta.',
          ],
          nota: 'Mira la cola del día para ver dónde quedó.',
        }
      : NARRACION.ficha)

  return (
    <main className="min-h-dvh bg-background px-5 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Demo · no es producto
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Salida instrumentada a WhatsApp
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            El recorrido completo, tal como lo viviría un asesor. Toca dentro del
            teléfono; el panel de la derecha va explicando qué escribe el sistema
            en cada paso.
          </p>
        </header>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={reiniciar} className="h-9">
            <RotateCcw aria-hidden className="size-3.5" />
            Reiniciar
          </Button>
          <Button
            type="button"
            variant={paso === 'cola' ? 'default' : 'outline'}
            onClick={() => setPaso(paso === 'cola' ? 'ficha' : 'cola')}
            className="h-9"
          >
            {paso === 'cola' ? 'Volver a la ficha' : 'Ver la cola del día'}
          </Button>
        </div>

        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          <div className="shrink-0 self-center lg:self-start">
            <div className="relative h-[780px] w-[368px] overflow-hidden rounded-[2.75rem] border-[10px] border-slate-900 bg-white shadow-glass">
              {paso === 'cola' ? (
                <ColaDelDia sinRespuesta={pendiente} />
              ) : paso === 'en-whatsapp' ? (
                <div className="flex h-full flex-col items-center justify-center gap-5 bg-emerald-600 px-8 text-center">
                  <MessageCircle aria-hidden className="size-12 text-white" />
                  <div>
                    <p className="text-lg font-semibold text-white">Estás en WhatsApp</p>
                    <p className="mt-2 text-sm leading-relaxed text-emerald-50">
                      {plantilla
                        ? `Se abrió el chat con el mensaje de «${plantilla}» listo para enviar.`
                        : 'Se abrió el chat vacío para escribir libre.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setPaso('desenlace')}
                    className="h-12 bg-white text-emerald-700 hover:bg-emerald-50"
                  >
                    Volver a Klo-Ser
                  </Button>
                </div>
              ) : (
                <>
                  <Ficha
                    etapa={etapa}
                    pendiente={pendiente && paso !== 'plantillas'}
                    onWhatsApp={() => setPaso('plantillas')}
                  />

                  {paso === 'plantillas' ? (
                    <Hoja
                      titulo="Enviar WhatsApp"
                      descripcion="Elige una plantilla — se abre WhatsApp con el mensaje listo."
                    >
                      <ul className="flex flex-col gap-2">
                        {PLANTILLAS.map((p) => (
                          <li key={p.nombre}>
                            <button
                              type="button"
                              onClick={() => elegirPlantilla(p.nombre)}
                              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-emerald-50"
                            >
                              <p className="text-sm font-medium text-slate-900">{p.nombre}</p>
                              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">
                                {p.texto}
                              </p>
                            </button>
                          </li>
                        ))}
                        <li>
                          <button
                            type="button"
                            onClick={() => elegirPlantilla(null)}
                            className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left"
                          >
                            <p className="text-sm font-medium text-slate-700">Sin plantilla</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Abre el chat vacío para escribir libre
                            </p>
                          </button>
                        </li>
                      </ul>
                    </Hoja>
                  ) : null}

                  {paso === 'desenlace' ? (
                    <Hoja
                      titulo={`¿Cómo te fue con ${LEAD.nombre.split(' ')[0]}?`}
                      descripcion="Un toque y seguimos."
                    >
                      <div className="flex flex-col gap-2">
                        {(
                          ['cita', 'contesto', 'no_contesto', 'no_interesa'] as Desenlace[]
                        ).map((valor) => (
                          <button
                            key={valor}
                            type="button"
                            onClick={() => resolver(valor)}
                            className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 active:bg-slate-50"
                          >
                            {ETIQUETA_DESENLACE[valor]}
                            <ChevronRight aria-hidden className="size-4 text-slate-400" />
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => resolver('ahora_no')}
                          className="mt-1 py-2 text-center text-sm text-slate-600 underline underline-offset-4"
                        >
                          Ahora no
                        </button>
                      </div>
                    </Hoja>
                  ) : null}

                  {paso === 'hoja-visita' ? (
                    <Hoja
                      titulo="Agendar visita"
                      descripcion="La hoja que ya existe, abierta desde el desenlace."
                    >
                      <div className="flex flex-col gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Propiedad</p>
                          <p className="mt-0.5 text-sm text-slate-900">{LEAD.propiedad}</p>
                          <p className="mt-2 text-xs text-slate-500">Fecha y hora</p>
                          <p className="mt-0.5 text-sm text-slate-900">Jueves 13, 5:00 p.m.</p>
                        </div>
                        <Button
                          type="button"
                          className="h-12"
                          onClick={() => {
                            setDesenlace('cita')
                            setEtapa('Cita agendada')
                            setPendiente(false)
                            setPaso('resuelto')
                          }}
                        >
                          <Check aria-hidden className="size-4" />
                          Guardar visita
                        </Button>
                        <button
                          type="button"
                          onClick={() => setPaso('ficha')}
                          className="py-2 text-center text-sm text-slate-600 underline underline-offset-4"
                        >
                          Abandonar (el lead sigue pendiente)
                        </button>
                      </div>
                    </Hoja>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* Narración */}
          <div className="flex flex-1 flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {narracion.titulo}
              </h2>
            </div>

            <ul className="flex flex-col gap-2.5">
              {narracion.puntos.map((punto) => (
                <li key={punto} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
                  <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-slate-900" />
                  {punto}
                </li>
              ))}
            </ul>

            {narracion.nota ? (
              <p className="rounded-xl bg-white/60 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200">
                {narracion.nota}
              </p>
            ) : null}

            <div className="rounded-xl border border-dashed border-slate-300 p-4">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Estado actual
              </p>
              <dl className="mt-2.5 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Etapa del lead</dt>
                  <dd>
                    <BadgeEtapa etapa={etapa} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Contacto</dt>
                  <dd className="font-medium text-slate-900">
                    {desenlace ? ETIQUETA_DESENLACE[desenlace] : pendiente ? 'Pendiente' : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">En «Sin respuesta»</dt>
                  <dd className="font-medium text-slate-900">{pendiente ? 'Sí' : 'No'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
