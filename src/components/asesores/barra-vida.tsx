import { cn } from '@/lib/utils'
import { DIAS_FRESCO, DIAS_FRIO, type VidaLeads } from '@/lib/asesores/panorama'

/**
 * El «nivel de vida» de una cartera de leads: cuántos siguen calientes,
 * cuántos se están enfriando y cuántos ya se enfriaron.
 *
 * Es el diagrama que pidió Jair para ver de un vistazo si hay prioridades
 * por atender. Los colores no son decorativos: reutilizan el idioma que la
 * app ya habla — tinta para lo que está bien, ámbar para lo que avisa (el
 * badge «Sin notificaciones»), rojo para lo que quema (panel de leads en
 * riesgo). El número siempre acompaña al color: nadie tiene que distinguir
 * ámbar de rojo para leer el dato.
 */

const TRAMOS = [
  {
    clave: 'frescos' as const,
    etiqueta: 'Frescos',
    ayuda: `tocados en los últimos ${DIAS_FRESCO} días`,
    barra: 'bg-slate-900',
    punto: 'bg-slate-900',
  },
  {
    clave: 'tibios' as const,
    etiqueta: 'Tibios',
    ayuda: `entre ${DIAS_FRESCO} y ${DIAS_FRIO} días sin señales`,
    barra: 'bg-amber-400',
    punto: 'bg-amber-400',
  },
  {
    clave: 'frios' as const,
    etiqueta: 'Fríos',
    ayuda: `${DIAS_FRIO} días o más sin señales`,
    barra: 'bg-red-500',
    punto: 'bg-red-500',
  },
]

export function BarraVida({
  vida,
  conLeyenda = true,
  className,
}: {
  vida: VidaLeads
  conLeyenda?: boolean
  className?: string
}) {
  const total = vida.frescos + vida.tibios + vida.frios

  if (total === 0) {
    return <p className={cn('text-sm text-slate-500', className)}>Sin leads activos</p>
  }

  return (
    <div className={className}>
      <div
        className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={TRAMOS.map((t) => `${vida[t.clave]} ${t.etiqueta.toLowerCase()}`).join(', ')}
      >
        {TRAMOS.filter((tramo) => vida[tramo.clave] > 0).map((tramo) => (
          <div
            key={tramo.clave}
            className={cn('rounded-full', tramo.barra)}
            style={{ flexGrow: vida[tramo.clave] }}
          />
        ))}
      </div>

      {conLeyenda ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {TRAMOS.map((tramo) => (
            <li
              key={tramo.clave}
              title={tramo.ayuda}
              className="flex items-center gap-1.5 text-xs text-slate-500"
            >
              <span aria-hidden className={cn('size-2 rounded-full', tramo.punto)} />
              {tramo.etiqueta}{' '}
              <span className="font-semibold text-slate-900">{vida[tramo.clave]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
