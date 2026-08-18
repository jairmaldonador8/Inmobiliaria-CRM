import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, MapPin, MessageCircle } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import {
  etiquetaOperacion,
  formatearPrecio,
  formatearSuperficie,
} from '@/lib/propiedades/formato'
import { mensajeFichaTecnica } from '@/lib/propiedades/compartir'
import { BotonCompartirFotos } from '@/components/propiedades/boton-compartir-fotos'
import { GaleriaFotos } from '@/components/propiedades/galeria-fotos'
import {
  BarraAccionesMovil,
  BotonVolverFlotante,
  DatosEnCeldas,
  DescripcionPlegable,
  type CeldaDato,
} from '@/components/propiedades/ficha-movil'
import { ChipEstatus } from '@/components/propiedades/tarjeta-propiedad'
import { cn } from '@/lib/utils'

/** Fila de la ficha técnica de escritorio; se omite si no hay valor. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-slate-900">{valor}</dd>
    </div>
  )
}

export default async function PaginaDetallePropiedadAsesor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireAsesor()
  const { id } = await params
  const supabase = await createClient()

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!propiedad) notFound()

  const fotos = (propiedad.fotos ?? []) as string[]
  const zona = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')
  const esTuya = propiedad.asesor_id === usuario.user_id

  // Ficha técnica formal para el cliente (ronda 2, ver compartir.ts). Sin
  // teléfono: el asesor elige el contacto al abrir WhatsApp.
  const textoCompartir = mensajeFichaTecnica(propiedad)
  const enlaceWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoCompartir)}`
  const botonFotos = (
    <BotonCompartirFotos
      fotos={fotos}
      titulo={propiedad.titulo}
      urlPublica={propiedad.url_publica}
      className="h-12 flex-1"
    />
  )

  // Los mismos datos de la lista de escritorio, en celdas para el teléfono.
  // Sin «Zona»: es la única de texto largo (se cortaba a «Del Valle, San
  // Pe…») y además ya sale completa sobre la foto, en el velo.
  const celdas: CeldaDato[] = [
    { etiqueta: 'Recámaras', valor: propiedad.recamaras != null ? String(propiedad.recamaras) : null },
    { etiqueta: 'Baños', valor: propiedad.banos != null ? String(propiedad.banos) : null },
    { etiqueta: 'Estac.', valor: propiedad.estacionamientos != null ? String(propiedad.estacionamientos) : null },
    { etiqueta: 'Construcción', valor: formatearSuperficie(propiedad.superficie_construccion) },
    { etiqueta: 'Terreno', valor: formatearSuperficie(propiedad.superficie_terreno) },
  ].filter((c): c is CeldaDato => c.valor != null)

  return (
    <section className="flex flex-col gap-4">
      {/* El enlace de volver de escritorio. En el teléfono lo sustituye el
          botón redondo que flota sobre la foto (ver `accionSuperior`): con la
          foto a sangre arriba, un renglón de texto encima la desperdiciaría. */}
      <div className="hidden lg:block">
        <Link
          href="/asesor/propiedades"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a propiedades
        </Link>
      </div>

      {/*
        Dos columnas desde `lg` (mismo patrón que admin/propiedades/[id]):
        galería + WhatsApp + descripción a la izquierda, ficha técnica a la
        derecha. En una sola columna estirada a ~1100px la galería quedaría
        gigantesca y la ficha técnica un cuadro angosto flotando en un mar
        de espacio vacío.

        `min-w-0` en las dos columnas: un item de rejilla no baja de su
        tamaño mínimo automático, así que CUALQUIER contenido ancho de
        adentro (la tira de miniaturas, un enlace largo en la descripción)
        estira la columna y con ella la página entera en el teléfono. Con
        `min-w-0` el desborde se queda dentro del elemento que lo causa.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <GaleriaFotos
            fotos={fotos}
            titulo={propiedad.titulo}
            accionSuperior={
              <BotonVolverFlotante href="/asesor/propiedades" etiqueta="Volver a propiedades" />
            }
            velo={
              /* Operación, precio y zona sobre la foto: en el teléfono son lo
                 primero que se pregunta y así no gastan una pantalla propia. */
              <>
                <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-medium tracking-wide uppercase">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-white',
                      propiedad.operacion === 'rental' ? 'bg-blue-600' : 'bg-emerald-600'
                    )}
                  >
                    {etiquetaOperacion(propiedad.operacion)}
                  </span>
                  {esTuya ? (
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-900">Tuya</span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatearPrecio(propiedad.precio, propiedad.moneda)}
                </p>
                {propiedad.ubicacion || zona ? (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-white/85">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 break-words">{propiedad.ubicacion ?? zona}</span>
                  </p>
                ) : null}
              </>
            }
          />

          <div className="flex flex-col gap-2">
            {/* Los chips y el precio ya salieron en el velo del teléfono. */}
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
                  propiedad.operacion === 'rental' ? 'bg-blue-600' : 'bg-emerald-600'
                )}
              >
                {etiquetaOperacion(propiedad.operacion)}
              </span>
              <ChipEstatus estatus={propiedad.estatus} />
              {esTuya ? (
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Tuya
                </span>
              ) : null}
            </div>

            <p className="hidden text-3xl font-semibold tracking-tight text-slate-900 lg:block">
              {formatearPrecio(propiedad.precio, propiedad.moneda)}
            </p>

            <h1 className="text-base leading-snug font-medium text-slate-800">{propiedad.titulo}</h1>

            {propiedad.ubicacion || zona ? (
              <p className="hidden items-start gap-1.5 text-sm text-slate-500 lg:flex">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>{propiedad.ubicacion ?? zona}</span>
              </p>
            ) : null}
          </div>

          <DatosEnCeldas datos={celdas} />

          {/* En el teléfono estas acciones viven en la barra fija de abajo. */}
          <div className="hidden gap-2 lg:flex">
            <a
              href={enlaceWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:translate-y-px"
            >
              <MessageCircle aria-hidden className="size-4" />
              Mandar ficha por WhatsApp
            </a>
            <BotonCompartirFotos
              fotos={fotos}
              titulo={propiedad.titulo}
              urlPublica={propiedad.url_publica}
              className="h-11 px-6"
            />
          </div>

          {propiedad.descripcion ? <DescripcionPlegable texto={propiedad.descripcion} /> : null}
        </div>

        {/* Ficha técnica en lista: solo escritorio. En el teléfono son las
            celdas de arriba — la misma información, mejor leída. */}
        <div className="hidden min-w-0 rounded-xl bg-white p-5 ring-1 ring-slate-200 lg:block">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Ficha técnica</h2>
          <dl className="divide-y divide-slate-100">
            <Dato etiqueta="Recámaras" valor={propiedad.recamaras != null ? String(propiedad.recamaras) : null} />
            <Dato etiqueta="Baños" valor={propiedad.banos != null ? String(propiedad.banos) : null} />
            <Dato etiqueta="Estacionamientos" valor={propiedad.estacionamientos != null ? String(propiedad.estacionamientos) : null} />
            <Dato etiqueta="Construcción" valor={formatearSuperficie(propiedad.superficie_construccion)} />
            <Dato etiqueta="Terreno" valor={formatearSuperficie(propiedad.superficie_terreno)} />
            <Dato etiqueta="Zona" valor={zona || null} />
          </dl>
          {propiedad.url_publica ? (
            <a
              href={propiedad.url_publica}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
            >
              Ver en EasyBroker
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      {/* Se coloca sola encima de la barra de pestañas leyendo `--alto-nav`
          del layout del asesor. */}
      <BarraAccionesMovil
        enlaceWhatsApp={enlaceWhatsApp}
        urlPublica={propiedad.url_publica}
        accionFotos={fotos.length > 0 ? botonFotos : undefined}
      />
    </section>
  )
}
