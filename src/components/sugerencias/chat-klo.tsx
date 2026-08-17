'use client'

import { useRef, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { SendHorizontal } from 'lucide-react'

import { crearSugerencia } from '@/lib/sugerencias/acciones'
import { VERSION, NOMBRE_VERSION } from '@/lib/version'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

type Mensaje = { de: 'klo' | 'yo'; texto: string }

const SALUDO =
  '¡Hola! Soy Klo 🐓 Este es nuestro canal directo: sugerencias, dudas, mejoras, lo que te estorbe o lo que te encantaría que existiera. Todo lo que escribas aquí le llega a la dirección tal cual. ¿Qué traes en mente?'

const GRACIAS_PRIMERA = `¡Muchas gracias! Tu comentario ya quedó registrado y la dirección lo va a leer hoy mismo. Estás usando la versión ${VERSION} de Klo-Ser, «${NOMBRE_VERSION}» — la primerititita de todas. Aquí comienza la historia, y con ideas como la tuya vamos a hacer de este sistema el mejor compañero que un asesor haya tenido. Sigue escribiéndome cuando quieras 🐓`

const GRACIAS_SIGUIENTES = [
  '¡Anotado también! Cada idea de estas es un ladrillo más. Sigo aquí 🐓',
  'Recibido y registrado. Me encanta que no te guardes nada 🐓',
  '¡Va para adentro! La dirección lo ve hoy mismo 🐓',
]

/**
 * Klo de frente, quieto: el último cuadro de la tira del giro. Mismo asset
 * de la pantalla de carga; el fondo SIEMPRE claro porque el gallo es negro
 * (mismo criterio que pantalla-carga.tsx — la marca no se invierte).
 */
function KloQuieto({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block bg-[url('/marca/gallo-voltea.webp')] bg-no-repeat [background-position-x:100%] [background-size:auto_100%]",
        className
      )}
    />
  )
}

/**
 * El chat de sugerencias con Klo (pedido de Jair 2026-08-17): sustituye al
 * foquito flotante. Cada mensaje del usuario es una fila de `sugerencias`
 * (mismo motor y misma bandeja /admin/sugerencias de siempre) y dispara la
 * campanita + push a la dirección; Klo agradece en automático y presume la
 * versión. No es (todavía) el chatbot con IA — es su puerta: los asesores
 * se acostumbran a hablarle a Klo desde hoy.
 */
export function ChatKlo({ className }: { className?: string }) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: 'klo', texto: SALUDO }])
  const [texto, setTexto] = useState('')
  const [enviadas, setEnviadas] = useState(0)
  const [pendiente, iniciarTransicion] = useTransition()
  const finRef = useRef<HTMLDivElement>(null)

  function bajarAlFinal() {
    // Tras el render del mensaje nuevo; el chat vive en un contenedor con
    // overflow propio, así que esto no mueve la página de atrás.
    requestAnimationFrame(() => {
      finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }

  function alEnviar() {
    const limpio = texto.trim()
    if (!limpio || pendiente) return

    setMensajes((previos) => [...previos, { de: 'yo', texto: limpio }])
    setTexto('')
    bajarAlFinal()

    iniciarTransicion(async () => {
      const resultado = await crearSugerencia(pathname, limpio)

      if ('error' in resultado) {
        // El mensaje se queda pintado pero NO registrado: devolverlo al
        // input para que el reintento sea un toque, no una re-escritura.
        toast.error(resultado.error)
        setMensajes((previos) => previos.filter((m) => !(m.de === 'yo' && m.texto === limpio)))
        setTexto(limpio)
        return
      }

      const respuesta =
        enviadas === 0
          ? GRACIAS_PRIMERA
          : GRACIAS_SIGUIENTES[(enviadas - 1) % GRACIAS_SIGUIENTES.length]
      setEnviadas((n) => n + 1)
      setMensajes((previos) => [...previos, { de: 'klo', texto: respuesta }])
      bajarAlFinal()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger
        aria-label="Habla con Klo: sugerencias, dudas y mejoras"
        className={cn(
          // Misma pila flotante que ocupaba el foquito (ver el comentario
          // largo en los layouts): encima de la barra de pestañas y del
          // botón «Registrar lead» del asesor en móvil; bottom-6 en lg lo
          // pone cada layout. Fondo claro FIJO: el gallo es negro.
          'fixed right-4 bottom-[calc(var(--alto-nav,4rem)+4.5rem)] z-40 flex size-12 items-center justify-center overflow-hidden rounded-full bg-[#F7F6F3] shadow-lg ring-1 ring-slate-900/10 transition-transform hover:scale-105 active:scale-95',
          className
        )}
      >
        <KloQuieto className="h-9 w-9" />
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-w-md gap-0 rounded-t-2xl p-0 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="flex-row items-center gap-3 border-b border-slate-200 px-4 py-3">
          {/* Punto de marca: siempre claro, como la pantalla de carga. */}
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F7F6F3] ring-1 ring-slate-900/10">
            <KloQuieto className="h-8 w-8" />
          </span>
          <div className="flex flex-col text-left">
            <SheetTitle className="text-base">Klo</SheetTitle>
            <SheetDescription className="text-xs">
              Sugerencias, dudas y mejoras · v{VERSION} «{NOMBRE_VERSION}»
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex max-h-[45dvh] min-h-48 flex-col gap-2.5 overflow-y-auto px-4 py-3">
          {mensajes.map((mensaje, i) => (
            <p
              key={i}
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap animate-in fade-in slide-in-from-bottom-2 duration-300',
                mensaje.de === 'klo'
                  ? 'self-start rounded-bl-md bg-slate-100 text-slate-900'
                  : 'self-end rounded-br-md bg-slate-900 text-slate-50'
              )}
            >
              {mensaje.texto}
            </p>
          ))}
          {pendiente ? (
            <p className="self-start rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-400">
              Klo está escribiendo…
            </p>
          ) : null}
          <div ref={finRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-slate-200 px-4 pt-3 pb-2">
          <Textarea
            rows={1}
            placeholder="Escríbele a Klo…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter manda (el teclado del teléfono trae su propio salto de
              // línea; en escritorio, Shift+Enter).
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                alEnviar()
              }
            }}
            maxLength={2000}
            className="min-h-11 flex-1 resize-none"
          />
          <Button
            type="button"
            size="icon-lg"
            aria-label="Enviar"
            onClick={alEnviar}
            disabled={pendiente || !texto.trim()}
            className="shrink-0"
          >
            <SendHorizontal aria-hidden />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
