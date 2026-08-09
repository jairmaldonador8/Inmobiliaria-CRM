'use client'

/**
 * Configuración de guardias/VIP/escalamiento (sección de la pantalla Admin →
 * Guardias). Guarda todo junto con guardarConfiguracionGuardias; la
 * validación fuerte vive en la server action — aquí solo tipos de input.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { guardarConfiguracionGuardias } from '@/lib/guardias/acciones'
import type { ConfiguracionGuardias } from '@/lib/guardias/consultas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface UsuarioOpcion {
  userId: string
  nombre: string
  rol: string
}

export function ConfiguracionGuardiasForm({
  config,
  usuarios,
}: {
  config: ConfiguracionGuardias
  usuarios: UsuarioOpcion[]
}) {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()

  const [umbral, setUmbral] = useState(config.umbralVipMxn?.toString() ?? '')
  const [dueno, setDueno] = useState(config.duenoUserId ?? '')
  const [correo, setCorreo] = useState(config.correoDueno ?? '')
  const [minutos, setMinutos] = useState({
    recordatorio: String(config.escalamientoMin.recordatorio),
    abierto: String(config.escalamientoMin.abierto),
    dueno: String(config.escalamientoMin.dueno),
  })
  const [manana, setManana] = useState(config.turnoManana)
  const [tarde, setTarde] = useState(config.turnoTarde)

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await guardarConfiguracionGuardias({
        umbralVipMxn: umbral.trim() === '' ? null : Number(umbral),
        duenoUserId: dueno === '' ? null : dueno,
        correoDueno: correo.trim() === '' ? null : correo.trim(),
        escalamientoMin: {
          recordatorio: Number(minutos.recordatorio),
          abierto: Number(minutos.abierto),
          dueno: Number(minutos.dueno),
        },
        turnoManana: manana,
        turnoTarde: tarde,
      })
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Configuración guardada')
      router.refresh()
    })
  }

  const campoHora = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900'

  return (
    <form onSubmit={guardar} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="text-base font-semibold text-slate-900">Configuración</h2>
      <p className="mt-1 text-sm text-slate-500">
        Regla VIP, tiempos de escalamiento y horarios default de los turnos
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-900">Dueño (recibe los VIP)</span>
          <select
            value={dueno}
            onChange={(e) => setDueno(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="">Sin configurar (regla VIP apagada)</option>
            {usuarios.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.nombre}
                {u.rol === 'admin' ? ' (admin)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-900">Correo del dueño</span>
          <Input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="dueno@ejemplo.com"
            className="min-h-11"
          />
          <span className="text-[11px] text-slate-500">Solo se usa en el aviso de 2 horas</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-900">Umbral VIP (MXN)</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={umbral}
            onChange={(e) => setUmbral(e.target.value)}
            placeholder="Ej. 8000000"
            className="min-h-11"
          />
          <span className="text-[11px] text-slate-500">
            Vacío = solo las propiedades marcadas «Exclusiva» son VIP
          </span>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-slate-900">Escalamiento (minutos)</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['recordatorio', 'Recordar'],
                ['abierto', 'Abrir'],
                ['dueno', 'Dueño'],
              ] as const
            ).map(([clave, etiqueta]) => (
              <label key={clave} className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">{etiqueta}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={minutos[clave]}
                  onChange={(e) => setMinutos((m) => ({ ...m, [clave]: e.target.value }))}
                  className="min-h-11"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {(
          [
            ['Turno mañana', manana, setManana],
            ['Turno tarde', tarde, setTarde],
          ] as const
        ).map(([titulo, valor, setValor]) => (
          <fieldset key={titulo} className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-slate-900">{titulo}</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">Inicio</span>
                <input
                  type="time"
                  value={valor.inicio}
                  onChange={(e) => setValor({ ...valor, inicio: e.target.value })}
                  className={campoHora}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">Fin</span>
                <input
                  type="time"
                  value={valor.fin}
                  onChange={(e) => setValor({ ...valor, fin: e.target.value })}
                  className={campoHora}
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        «00:00» como fin de turno significa medianoche. Los cambios de horario aplican a guardias
        NUEVAS; las ya capturadas conservan su horario.
      </p>

      <Button type="submit" disabled={guardando} className="mt-4 min-h-11 w-full sm:w-auto">
        {guardando ? 'Guardando…' : 'Guardar configuración'}
      </Button>
    </form>
  )
}
