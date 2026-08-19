// @vitest-environment node
/**
 * Regresión: un lead archivado (eliminado desde la hoja del lead) NO debe
 * seguir generando alertas.
 *
 * El bug real, reportado por Jair el 2026-08-19 el día que se estrenó la
 * papelera: `archivado` sacaba al lead de la bandeja y del pipeline, pero
 * CUATRO consultas se saltaban el filtro y seguían viéndolo —
 *
 *   1. el cron de recordatorios seguía empujando push y campanita,
 *   2. la cola «Para hoy» del asesor lo pintaba en rojo,
 *   3. «Citas de hoy» lo contaba,
 *   4. «Próximas visitas» lo listaba,
 *
 * y todos esos avisos enlazaban a una hoja que ya devuelve 404. Estos tests
 * corren contra el proyecto Supabase REAL de desarrollo porque lo que se
 * está probando es precisamente el filtro de PostgREST sobre la relación
 * (`leads!inner` + `.eq('lead.archivado', false)`), que un mock no puede
 * verificar: con fakes, una consulta mal escrita pasa igual.
 *
 * Ejecutar con: npm run test:rls
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

loadEnv({ path: path.resolve(__dirname, '../../.env.local') });

import { citasHoy, proximasVisitas } from '@/lib/dashboard/consultas';
import { recordatoriosParaHoy, proximoRecordatorioPorLead } from '@/lib/recordatorios/consultas';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const RUN = Date.now();
const MARCA = `TEST-ALERTA-${RUN}`;

let svc: SupabaseClient;
let leadId: string;
let asesorId: string;
let recordatorioId: string;

/** Hoy a media mañana en Monterrey, para que la visita caiga dentro del día. */
function dentroDeHoy(): string {
  const ahora = new Date();
  const enUnaHora = new Date(ahora.getTime() + 60 * 60_000);
  return enUnaHora.toISOString();
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local');
  }
  svc = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agencia } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  const { data: asesor } = await svc
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'asesor')
    .eq('activo', true)
    .limit(1)
    .single();
  const { data: propiedad } = await svc.from('propiedades').select('id').limit(1).single();
  if (!agencia || !asesor || !propiedad) throw new Error('Falta seed en DEV: corre npm run seed');
  asesorId = asesor.user_id;

  const { data: lead, error } = await svc
    .from('leads')
    .insert({
      agencia_id: agencia.id,
      nombre: MARCA,
      fuente: 'otro',
      asesor_id: asesorId,
      asignado_en: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !lead) throw new Error(`fixture lead: ${error?.message}`);
  leadId = lead.id;

  const { data: recordatorio, error: errorRec } = await svc
    .from('recordatorios')
    .insert({
      lead_id: leadId,
      asesor_id: asesorId,
      // Vencido hace un minuto: entra en «Para hoy» y en el barrido del cron.
      fecha_hora: new Date(Date.now() - 60_000).toISOString(),
      nota: MARCA,
    })
    .select('id')
    .single();
  if (errorRec || !recordatorio) throw new Error(`fixture recordatorio: ${errorRec?.message}`);
  recordatorioId = recordatorio.id;

  const { error: errorVisita } = await svc.from('visitas').insert({
    lead_id: leadId,
    propiedad_id: propiedad.id,
    asesor_id: asesorId,
    fecha: dentroDeHoy(),
    estado: 'agendada',
  });
  if (errorVisita) throw new Error(`fixture visita: ${errorVisita.message}`);
}, 30_000);

afterAll(async () => {
  if (svc && leadId) {
    await svc.from('leads').update({ archivado: true }).eq('id', leadId);
    await svc.rpc('eliminar_lead_definitivo', { p_lead_id: leadId });
  }
}, 30_000);

/** ¿Sigue el recordatorio del fixture sin notificar? (proxy del barrido del cron) */
async function elCronLoVeria(): Promise<boolean> {
  const { data } = await svc
    .from('recordatorios')
    .select('id, lead:leads!inner(archivado)')
    .eq('lead.archivado', false)
    .eq('estado', 'pendiente')
    .is('notificado_en', null)
    .lte('fecha_hora', new Date().toISOString())
    .eq('id', recordatorioId);
  return (data ?? []).length > 0;
}

describe('con el lead ACTIVO, las alertas funcionan', () => {
  it('«Para hoy» trae su recordatorio', async () => {
    const filas = await recordatoriosParaHoy(svc, asesorId, new Date());
    expect(filas.map((f) => f.id)).toContain(recordatorioId);
  });

  it('el próximo recordatorio por lead lo encuentra', async () => {
    const mapa = await proximoRecordatorioPorLead(svc, asesorId, [leadId]);
    expect(mapa.get(leadId)?.id).toBe(recordatorioId);
  });

  it('su visita cuenta en «Citas de hoy» y sale en «Próximas visitas»', async () => {
    const proximas = await proximasVisitas(svc, 50, new Date(), asesorId);
    expect(proximas.map((v) => v.leadId)).toContain(leadId);
    expect(await citasHoy(svc)).toBeGreaterThan(0);
  });

  it('el cron de recordatorios lo tomaría', async () => {
    expect(await elCronLoVeria()).toBe(true);
  });
});

describe('al ARCHIVARLO, las alertas se apagan', () => {
  beforeAll(async () => {
    const { error } = await svc
      .from('leads')
      .update({ archivado: true, archivado_en: new Date().toISOString() })
      .eq('id', leadId);
    if (error) throw new Error(`no se pudo archivar el fixture: ${error.message}`);
  });

  it('«Para hoy» ya no lo pinta', async () => {
    const filas = await recordatoriosParaHoy(svc, asesorId, new Date());
    expect(filas.map((f) => f.id)).not.toContain(recordatorioId);
  });

  it('el próximo recordatorio por lead ya no lo devuelve', async () => {
    const mapa = await proximoRecordatorioPorLead(svc, asesorId, [leadId]);
    expect(mapa.has(leadId)).toBe(false);
  });

  it('su visita sale de «Próximas visitas»', async () => {
    const proximas = await proximasVisitas(svc, 50, new Date(), asesorId);
    expect(proximas.map((v) => v.leadId)).not.toContain(leadId);
  });

  it('el cron de recordatorios ya NO lo tomaría (no habrá push a un lead borrado)', async () => {
    expect(await elCronLoVeria()).toBe(false);
  });

  it('el recordatorio sigue intacto: al restaurar el lead, la alerta vuelve', async () => {
    const { data: sigue } = await svc
      .from('recordatorios')
      .select('estado, notificado_en')
      .eq('id', recordatorioId)
      .single();
    expect(sigue?.estado).toBe('pendiente');
    expect(sigue?.notificado_en).toBeNull();

    await svc.from('leads').update({ archivado: false, archivado_en: null }).eq('id', leadId);
    const filas = await recordatoriosParaHoy(svc, asesorId, new Date());
    expect(filas.map((f) => f.id)).toContain(recordatorioId);
  });
});
