// @vitest-environment node
/**
 * Tests de integracion RLS de la ronda 2 (migraciones 0025 y 0026):
 * `recordatorios` y `lead_reclasificaciones`.
 *
 * Mismas convenciones que guardias-rls.integration.test.ts: proyecto
 * Supabase REAL de desarrollo, JWTs reales de los usuarios seed.
 *
 * Recordatorio de formas de denegacion:
 *   - policy USING (select/update/delete sobre fila vetada) -> 0 filas, SIN error.
 *   - policy WITH CHECK (insert que no cumple)              -> error 42501.
 *   - grant de columna/tabla ausente                        -> error 42501.
 *
 * Higiene de fixtures: el lead NO se puede borrar (trigger de inmutabilidad
 * de lead_eventos, ver 0016) — se ARCHIVA en afterAll; recordatorios y
 * reclasificaciones si se borran a mano con service role.
 *
 * Ejecutar con: npm run test:rls
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const PASSWORD = 'Password123!';
const RUN = Date.now();
const MARK_LEAD = `TEST-REC-${RUN}-lead`;
const TEL_LEAD = '5599000031';
const EN_UNA_HORA = new Date(Date.now() + 60 * 60_000).toISOString();

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let asesor2: SupabaseClient;
let svc: SupabaseClient;

let asesor1Id: string;
let asesor2Id: string;
let agenciaId: string;
let leadId: string; // asignado a asesor1, activo

beforeAll(async () => {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    throw new Error(
      'Faltan variables en .env.local: se requieren NEXT_PUBLIC_SUPABASE_URL, ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY'
    );
  }

  admin = makeClient(PUBLISHABLE_KEY);
  asesor1 = makeClient(PUBLISHABLE_KEY);
  asesor2 = makeClient(PUBLISHABLE_KEY);
  svc = makeClient(SECRET_KEY);

  const logins = await Promise.all([
    admin.auth.signInWithPassword({ email: 'admin@montana.test', password: PASSWORD }),
    asesor1.auth.signInWithPassword({ email: 'asesor1@montana.test', password: PASSWORD }),
    asesor2.auth.signInWithPassword({ email: 'asesor2@montana.test', password: PASSWORD }),
  ]);
  for (const login of logins) {
    if (login.error || !login.data.session) {
      throw new Error(
        `Login de usuario seed fallo: ${login.error?.message ?? 'sin sesion'}. Corre npm run seed.`
      );
    }
  }
  asesor1Id = logins[1].data.session!.user.id;
  asesor2Id = logins[2].data.session!.user.id;

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia: ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  const { data: lead, error: leadError } = await svc
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: MARK_LEAD,
      telefono: TEL_LEAD,
      fuente: 'otro',
      asesor_id: asesor1Id,
      asignado_en: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (leadError || !lead) throw new Error(`No se pudo crear el lead fixture: ${leadError?.message}`);
  leadId = lead.id;
}, 30_000);

afterAll(async () => {
  if (svc && leadId) {
    const { error: recError } = await svc.from('recordatorios').delete().eq('lead_id', leadId);
    if (recError) throw new Error(`limpieza de recordatorios: ${recError.message}`);
    const { error: reclaError } = await svc
      .from('lead_reclasificaciones')
      .delete()
      .eq('lead_id', leadId);
    if (reclaError) throw new Error(`limpieza de reclasificaciones: ${reclaError.message}`);
    // Los leads son imborrables desde 0016 (inmutabilidad de lead_eventos):
    // se archiva, patron de los demas tests de integracion.
    const { error: leadError } = await svc
      .from('leads')
      .update({ archivado: true, asesor_id: null, asignado_en: null })
      .eq('id', leadId);
    if (leadError) throw new Error(`limpieza del lead: ${leadError.message}`);
  }
}, 30_000);

describe('RLS de recordatorios (0025)', () => {
  let recordatorioId: string;

  it('el dueño del lead crea un recordatorio propio', async () => {
    const { data, error } = await asesor1
      .from('recordatorios')
      .insert({ lead_id: leadId, asesor_id: asesor1Id, fecha_hora: EN_UNA_HORA, nota: 'test' })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    recordatorioId = data!.id;
  });

  it('otro asesor NO puede crear un recordatorio sobre un lead ajeno (WITH CHECK -> 42501)', async () => {
    const { error } = await asesor2
      .from('recordatorios')
      .insert({ lead_id: leadId, asesor_id: asesor2Id, fecha_hora: EN_UNA_HORA, nota: 'intruso' });
    expect(error?.code).toBe('42501');
  });

  it('nadie crea recordatorios A NOMBRE de otro (WITH CHECK -> 42501)', async () => {
    const { error } = await asesor1
      .from('recordatorios')
      .insert({ lead_id: leadId, asesor_id: asesor2Id, fecha_hora: EN_UNA_HORA, nota: 'ajeno' });
    expect(error?.code).toBe('42501');
  });

  it('el estado y notificado_en no son asignables desde la app (grant de columna -> 42501)', async () => {
    const conEstado = await asesor1.from('recordatorios').insert({
      lead_id: leadId,
      asesor_id: asesor1Id,
      fecha_hora: EN_UNA_HORA,
      estado: 'hecho',
    });
    expect(conEstado.error?.code).toBe('42501');

    const conNotificado = await asesor1.from('recordatorios').insert({
      lead_id: leadId,
      asesor_id: asesor1Id,
      fecha_hora: EN_UNA_HORA,
      notificado_en: new Date().toISOString(),
    });
    expect(conNotificado.error?.code).toBe('42501');
  });

  it('otro asesor no VE el recordatorio; el admin sí (supervisión)', async () => {
    const ajeno = await asesor2.from('recordatorios').select('id').eq('id', recordatorioId);
    expect(ajeno.error).toBeNull();
    expect(ajeno.data).toHaveLength(0);

    const deAdmin = await admin.from('recordatorios').select('id').eq('id', recordatorioId);
    expect(deAdmin.error).toBeNull();
    expect(deAdmin.data).toHaveLength(1);
  });

  it('el dueño lo marca hecho; un ajeno no afecta filas (USING -> 0 filas sin error)', async () => {
    const intruso = await asesor2
      .from('recordatorios')
      .update({ estado: 'hecho' })
      .eq('id', recordatorioId)
      .select('id');
    expect(intruso.error).toBeNull();
    expect(intruso.data).toHaveLength(0);

    const propio = await asesor1
      .from('recordatorios')
      .update({ estado: 'hecho' })
      .eq('id', recordatorioId)
      .select('id');
    expect(propio.error).toBeNull();
    expect(propio.data).toHaveLength(1);
  });

  it('no hay delete para authenticated (grant ausente -> 42501)', async () => {
    const { error } = await asesor1.from('recordatorios').delete().eq('id', recordatorioId);
    expect(error?.code).toBe('42501');
  });
});

describe('RLS de lead_reclasificaciones (0026)', () => {
  let solicitudId: string;

  it('el dueño del lead reporta; a nombre propio', async () => {
    const { data, error } = await asesor1
      .from('lead_reclasificaciones')
      .insert({ lead_id: leadId, solicitante_id: asesor1Id, motivo: 'dijo que era para su cliente' })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    solicitudId = data!.id;
  });

  it('solo UNA solicitud pendiente por lead (índice único parcial -> 23505)', async () => {
    const { error } = await asesor1
      .from('lead_reclasificaciones')
      .insert({ lead_id: leadId, solicitante_id: asesor1Id, motivo: 'duplicada' });
    expect(error?.code).toBe('23505');
  });

  it('otro asesor NO reporta un lead ajeno (WITH CHECK -> 42501)', async () => {
    const { error } = await asesor2
      .from('lead_reclasificaciones')
      .insert({ lead_id: leadId, solicitante_id: asesor2Id, motivo: 'intruso' });
    expect(error?.code).toBe('42501');
  });

  it('el solicitante y el admin la ven; otro asesor no', async () => {
    const propia = await asesor1.from('lead_reclasificaciones').select('id').eq('id', solicitudId);
    expect(propia.data).toHaveLength(1);

    const deAdmin = await admin.from('lead_reclasificaciones').select('id').eq('id', solicitudId);
    expect(deAdmin.data).toHaveLength(1);

    const ajena = await asesor2.from('lead_reclasificaciones').select('id').eq('id', solicitudId);
    expect(ajena.error).toBeNull();
    expect(ajena.data).toHaveLength(0);
  });

  it('NADIE de authenticated resuelve (ni el admin): update es del service role (grant ausente -> 42501)', async () => {
    const delSolicitante = await asesor1
      .from('lead_reclasificaciones')
      .update({ estado: 'aprobada' })
      .eq('id', solicitudId);
    expect(delSolicitante.error?.code).toBe('42501');

    const delAdmin = await admin
      .from('lead_reclasificaciones')
      .update({ estado: 'aprobada' })
      .eq('id', solicitudId);
    expect(delAdmin.error?.code).toBe('42501');
  });

  it('el service role sí resuelve (la acción de admin corre con él)', async () => {
    const { data, error } = await svc
      .from('lead_reclasificaciones')
      .update({ estado: 'rechazada', resuelta_en: new Date().toISOString() })
      .eq('id', solicitudId)
      .eq('estado', 'pendiente')
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
