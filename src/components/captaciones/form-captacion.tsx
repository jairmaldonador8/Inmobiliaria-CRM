'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ImagePlus, Loader2, Send, Trash2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { evaluarCaptacion } from '@/lib/captaciones/score'
import {
  eliminarCaptacion,
  enviarCaptacion,
  guardarCaptacion,
  type CamposCaptacion,
} from '@/lib/captaciones/acciones'
import type { Captacion, FotoCaptacion } from '@/lib/captaciones/consultas'
import { AnilloScore } from '@/components/captaciones/anillo-score'
import { ChecklistScore } from '@/components/captaciones/checklist-score'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Nombres en español tal cual los acepta EasyBroker (su POST /properties
 * acepta names además de symbols, verificado en el research 2026-08-14).
 * «Terreno» activa el perfil sin interiores del score.
 */
const TIPOS = [
  'Casa',
  'Departamento',
  'Casa en condominio',
  'Terreno',
  'Oficina',
  'Local comercial',
  'Bodega comercial',
  'Quinta',
  'Rancho',
] as const

const MAX_FOTOS = 50
const MAX_BYTES_FOTO = 6 * 1024 * 1024 // límite duro de EasyBroker por imagen

function camposDesde(captacion: Captacion | null): CamposCaptacion {
  return {
    titulo: captacion?.titulo ?? '',
    descripcion: captacion?.descripcion ?? '',
    tipo: captacion?.tipo ?? null,
    operacion: captacion?.operacion ?? null,
    precio: captacion?.precio ?? null,
    moneda: captacion?.moneda ?? 'MXN',
    colonia: captacion?.colonia ?? null,
    ciudad: captacion?.ciudad ?? 'San Pedro Garza García',
    entidad: captacion?.entidad ?? 'Nuevo León',
    calle: captacion?.calle ?? null,
    numero_exterior: captacion?.numero_exterior ?? null,
    codigo_postal: captacion?.codigo_postal ?? null,
    lat: captacion?.lat ?? null,
    lng: captacion?.lng ?? null,
    mostrar_ubicacion_exacta: captacion?.mostrar_ubicacion_exacta ?? false,
    recamaras: captacion?.recamaras ?? null,
    banos: captacion?.banos ?? null,
    medios_banos: captacion?.medios_banos ?? null,
    estacionamientos: captacion?.estacionamientos ?? null,
    antiguedad: captacion?.antiguedad ?? null,
    m2_construccion: captacion?.m2_construccion ?? null,
    m2_terreno: captacion?.m2_terreno ?? null,
    video_url: captacion?.video_url ?? null,
    tour_url: captacion?.tour_url ?? null,
    fotos: captacion?.fotos ?? [],
  }
}

/** Formulario de captación del asesor, con el score calculándose en vivo. */
export function FormCaptacion({
  captacion,
  userId,
}: {
  captacion: Captacion | null
  userId: string
}) {
  const router = useRouter()
  const inputFotos = useRef<HTMLInputElement>(null)
  const [id, setId] = useState<string | null>(captacion?.id ?? null)
  const [campos, setCampos] = useState<CamposCaptacion>(() => camposDesde(captacion))
  const [subiendo, setSubiendo] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const score = useMemo(
    () =>
      evaluarCaptacion({
        titulo: campos.titulo,
        descripcion: campos.descripcion,
        tipo: campos.tipo,
        operacion: campos.operacion,
        precio: campos.precio,
        colonia: campos.colonia,
        ciudad: campos.ciudad,
        calle: campos.calle,
        lat: campos.lat,
        lng: campos.lng,
        recamaras: campos.recamaras,
        banos: campos.banos,
        medios_banos: campos.medios_banos,
        estacionamientos: campos.estacionamientos,
        antiguedad: campos.antiguedad,
        m2_construccion: campos.m2_construccion,
        m2_terreno: campos.m2_terreno,
        video_url: campos.video_url,
        tour_url: campos.tour_url,
        fotos: campos.fotos.length,
        mostrar_ubicacion_exacta: campos.mostrar_ubicacion_exacta,
      }),
    [campos]
  )

  function setCampo<K extends keyof CamposCaptacion>(clave: K, valor: CamposCaptacion[K]) {
    setCampos((prev) => ({ ...prev, [clave]: valor }))
  }

  function numeroDesde(valor: string): number | null {
    if (valor.trim() === '') return null
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
  }

  async function alSeleccionarFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const archivos = Array.from(lista)
    if (campos.fotos.length + archivos.length > MAX_FOTOS) {
      toast.error(`Máximo ${MAX_FOTOS} fotos (EasyBroker no acepta más).`)
      return
    }

    setSubiendo(true)
    const supabase = createClient()
    const nuevas: FotoCaptacion[] = []
    for (const archivo of archivos) {
      if (archivo.size > MAX_BYTES_FOTO) {
        toast.error(`«${archivo.name}» pasa de 6MB; comprímela y vuelve a subirla.`)
        continue
      }
      const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
      const ruta = `${userId}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage
        .from('captaciones')
        .upload(ruta, archivo, { contentType: archivo.type || 'image/jpeg' })
      if (error) {
        toast.error(`No se pudo subir «${archivo.name}»: ${error.message}`)
        continue
      }
      const { data } = supabase.storage.from('captaciones').getPublicUrl(ruta)
      nuevas.push({ url: data.publicUrl, path: ruta })
    }
    if (nuevas.length > 0) {
      setCampos((prev) => ({ ...prev, fotos: [...prev.fotos, ...nuevas] }))
    }
    setSubiendo(false)
    if (inputFotos.current) inputFotos.current.value = ''
  }

  async function quitarFoto(foto: FotoCaptacion) {
    setCampos((prev) => ({ ...prev, fotos: prev.fotos.filter((f) => f.path !== foto.path) }))
    // Limpieza best-effort del bucket; si falla, la foto huérfana no estorba.
    try {
      await createClient().storage.from('captaciones').remove([foto.path])
    } catch {
      /* sin drama */
    }
  }

  function guardar(luegoEnviar: boolean) {
    iniciarTransicion(async () => {
      const resultado = await guardarCaptacion(id, campos)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      setId(resultado.id)

      if (!luegoEnviar) {
        toast.success('Captación guardada')
        if (!id) router.replace(`/asesor/captaciones/${resultado.id}`)
        router.refresh()
        return
      }

      const envio = await enviarCaptacion(resultado.id)
      if ('error' in envio) {
        toast.error(envio.error)
        return
      }
      toast.success('Captación enviada a revisión — te avisamos cuando el admin la vea')
      router.push('/asesor/captaciones')
      router.refresh()
    })
  }

  function eliminar() {
    if (!id) return
    if (!window.confirm('¿Eliminar este borrador? Las fotos también se borran.')) return
    iniciarTransicion(async () => {
      const resultado = await eliminarCaptacion(id)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success('Borrador eliminado')
      router.push('/asesor/captaciones')
      router.refresh()
    })
  }

  const ocupado = pendiente || subiendo

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/asesor/captaciones"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Captaciones
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {captacion ? 'Editar captación' : 'Nueva captación'}
        </h1>
        {captacion?.estado === 'regresada' ? <Badge className="bg-amber-100 text-amber-700">Regresada</Badge> : null}
      </header>

      {captacion?.estado === 'regresada' && captacion.comentario_admin ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Comentarios del administrador</p>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-700">{captacion.comentario_admin}</p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {/* ── Lo esencial ── */}
          <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Lo esencial</h2>

            <div className="grid gap-2">
              <Label htmlFor="titulo">Título del anuncio</Label>
              <Input
                id="titulo"
                value={campos.titulo}
                onChange={(e) => setCampo('titulo', e.target.value)}
                placeholder="Casa en venta en Del Valle, San Pedro"
                disabled={ocupado}
              />
              <p className="text-xs text-slate-400">
                {campos.titulo.trim().length} caracteres — la fórmula: tipo + operación + zona
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Tipo de propiedad</Label>
                <Select
                  value={campos.tipo ?? ''}
                  onValueChange={(valor) => setCampo('tipo', valor || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elige el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Operación</Label>
                <Select
                  value={campos.operacion ?? ''}
                  onValueChange={(valor) =>
                    setCampo('operacion', valor === 'sale' || valor === 'rental' ? valor : null)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="¿Venta o renta?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">Venta</SelectItem>
                    <SelectItem value="rental">Renta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="precio">Precio</Label>
                <Input
                  id="precio"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={campos.precio ?? ''}
                  onChange={(e) => setCampo('precio', numeroDesde(e.target.value))}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label>Moneda</Label>
                <Select value={campos.moneda} onValueChange={(valor) => setCampo('moneda', valor ?? 'MXN')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                rows={8}
                value={campos.descripcion}
                onChange={(e) => setCampo('descripcion', e.target.value)}
                placeholder="Describe la propiedad: espacios, acabados, amenidades, el entorno… y cierra invitando a agendar una visita. Sin teléfonos ni correos: los portales lo penalizan."
                disabled={ocupado}
              />
              <p className="text-xs text-slate-400">
                {campos.descripcion.trim().length} caracteres — tus iniciales se agregan solas al cargar
              </p>
            </div>
          </div>

          {/* ── Ubicación ── */}
          <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Ubicación</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="colonia">Colonia</Label>
                <Input
                  id="colonia"
                  value={campos.colonia ?? ''}
                  onChange={(e) => setCampo('colonia', e.target.value || null)}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ciudad">Ciudad</Label>
                <Input
                  id="ciudad"
                  value={campos.ciudad ?? ''}
                  onChange={(e) => setCampo('ciudad', e.target.value || null)}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="calle">Calle</Label>
                <Input
                  id="calle"
                  value={campos.calle ?? ''}
                  onChange={(e) => setCampo('calle', e.target.value || null)}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="numero">Número exterior</Label>
                <Input
                  id="numero"
                  value={campos.numero_exterior ?? ''}
                  onChange={(e) => setCampo('numero_exterior', e.target.value || null)}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cp">Código postal</Label>
                <Input
                  id="cp"
                  inputMode="numeric"
                  value={campos.codigo_postal ?? ''}
                  onChange={(e) => setCampo('codigo_postal', e.target.value || null)}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entidad">Estado</Label>
                <Input
                  id="entidad"
                  value={campos.entidad}
                  onChange={(e) => setCampo('entidad', e.target.value || 'Nuevo León')}
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lat">Latitud</Label>
                <Input
                  id="lat"
                  type="number"
                  step="any"
                  value={campos.lat ?? ''}
                  onChange={(e) => setCampo('lat', numeroDesde(e.target.value))}
                  placeholder="25.6573"
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lng">Longitud</Label>
                <Input
                  id="lng"
                  type="number"
                  step="any"
                  value={campos.lng ?? ''}
                  onChange={(e) => setCampo('lng', numeroDesde(e.target.value))}
                  placeholder="-100.4023"
                  disabled={ocupado}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Tip: en Google Maps, clic derecho sobre la propiedad → el primer renglón son latitud y
              longitud.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 accent-slate-900"
                checked={campos.mostrar_ubicacion_exacta}
                onChange={(e) => setCampo('mostrar_ubicacion_exacta', e.target.checked)}
                disabled={ocupado}
              />
              Mostrar la ubicación exacta en los portales
            </label>
          </div>

          {/* ── La propiedad ── */}
          <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">La propiedad</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(
                [
                  ['recamaras', 'Recámaras'],
                  ['banos', 'Baños'],
                  ['medios_banos', 'Medios baños'],
                  ['estacionamientos', 'Estacionamientos'],
                  ['antiguedad', 'Antigüedad (años)'],
                  ['m2_construccion', 'M² construcción'],
                  ['m2_terreno', 'M² terreno'],
                ] as const
              ).map(([clave, etiqueta]) => (
                <div key={clave} className="grid gap-2">
                  <Label htmlFor={clave}>{etiqueta}</Label>
                  <Input
                    id={clave}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="any"
                    value={campos[clave] ?? ''}
                    onChange={(e) => setCampo(clave, numeroDesde(e.target.value))}
                    disabled={ocupado}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Extras ── */}
          <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Extras que suben el score</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="video">Video (URL)</Label>
                <Input
                  id="video"
                  type="url"
                  value={campos.video_url ?? ''}
                  onChange={(e) => setCampo('video_url', e.target.value || null)}
                  placeholder="https://youtu.be/…"
                  disabled={ocupado}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tour">Tour virtual (URL)</Label>
                <Input
                  id="tour"
                  type="url"
                  value={campos.tour_url ?? ''}
                  onChange={(e) => setCampo('tour_url', e.target.value || null)}
                  placeholder="https://…"
                  disabled={ocupado}
                />
              </div>
            </div>
          </div>

          {/* ── Fotos ── */}
          <div className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Fotos <span className="font-normal text-slate-400">({campos.fotos.length})</span>
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputFotos.current?.click()}
                disabled={ocupado}
              >
                {subiendo ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <ImagePlus data-icon="inline-start" />
                )}
                {subiendo ? 'Subiendo…' : 'Agregar fotos'}
              </Button>
              <input
                ref={inputFotos}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                multiple
                className="hidden"
                onChange={(e) => alSeleccionarFotos(e.target.files)}
              />
            </div>
            <p className="text-xs text-slate-400">
              La primera foto es la portada (idealmente la fachada). Mínimo 6 para enviar, 10+ para
              un buen score. Máx 6MB por foto.
            </p>
            {campos.fotos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {campos.fotos.map((foto, indice) => (
                  <li key={foto.path} className="group relative">
                    <Image
                      src={foto.url}
                      alt={`Foto ${indice + 1}`}
                      width={200}
                      height={150}
                      className="h-24 w-full rounded-lg object-cover ring-1 ring-slate-200"
                    />
                    {indice === 0 ? (
                      <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
                        Portada
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Quitar foto ${indice + 1}`}
                      onClick={() => quitarFoto(foto)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 opacity-0 shadow transition-opacity hover:text-rose-600 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* ── Acciones ── */}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => guardar(false)} disabled={ocupado}>
              {pendiente ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button
              type="button"
              onClick={() => guardar(true)}
              disabled={ocupado || !score.publicable}
              title={score.publicable ? undefined : 'Completa los requisitos del checklist'}
            >
              <Send data-icon="inline-start" />
              Enviar a revisión
            </Button>
            {id && (!captacion || captacion.estado === 'borrador') ? (
              <Button type="button" variant="ghost" onClick={eliminar} disabled={ocupado}>
                <Trash2 data-icon="inline-start" />
                Eliminar borrador
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Score en vivo ── */}
        <aside className="top-4 flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200 lg:sticky">
          <AnilloScore porcentaje={score.porcentaje} publicable={score.publicable} />
          <ChecklistScore score={score} />
        </aside>
      </div>
    </section>
  )
}
