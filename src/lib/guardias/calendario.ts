/**
 * Helpers puros de calendario para las pantallas de guardias (admin y
 * asesor). Todo trabaja con claves de texto (YYYY-MM / YYYY-MM-DD) en UTC —
 * la zona horaria del negocio ya viene resuelta por quien pasa `hoy`
 * (fechaHoyMonterrey en el servidor).
 */

export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/

export function ultimoDiaDelMes(mes: string): string {
  const [anio, mesNum] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, '0')}`
}

export function mesRelativo(mes: string, delta: number): string {
  const [anio, mesNum] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(anio, mesNum - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Semanas del mes, lunes-primero; null = celda de relleno de otro mes. */
export function semanasDelMes(mes: string): (string | null)[][] {
  const [anio, mesNum] = mes.split('-').map(Number)
  const totalDias = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  const primerDia = new Date(Date.UTC(anio, mesNum - 1, 1))
  const offsetLunes = (primerDia.getUTCDay() + 6) % 7

  const celdas: (string | null)[] = Array(offsetLunes).fill(null)
  for (let dia = 1; dia <= totalDias; dia++) {
    celdas.push(`${mes}-${String(dia).padStart(2, '0')}`)
  }
  while (celdas.length % 7 !== 0) celdas.push(null)

  const semanas: (string | null)[][] = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))
  return semanas
}

export function nombreCorto(nombre: string): string {
  return nombre.split(' ')[0]
}

/** «9:00» a partir de un `time` de Postgres ('09:00:00') o un 'HH:mm'. */
export function horaCorta(hora: string): string {
  const [h, m] = hora.split(':')
  return `${Number(h)}:${m}`
}
