// @vitest-environment node
/**
 * Tests de integracion de la papelera de leads (migracion 0027) contra el
 * proyecto Supabase REAL de desarrollo.
 *
 * Lo que se verifica aqui y NO se puede verificar con mocks:
 *   1. `public.eliminar_lead_definitivo` esta cerrada a anon/authenticated
 *      (grant solo a service_role) — un asesor o un admin logueado no la
 *      pueden llamar aunque adivinen el nombre.
 *   2. Con service role SI purga: se lleva lead, seguimientos, eventos,
 *      recordatorios y notificaciones colgadas de la url.
 *   3. La inmutabilidad de 0002/0016 sigue en pie FUERA de la purga: ni el
 *      service role puede borrar un seguimiento suelto. Esta es la parte
 *      importante — 0027 abre una excepcion nombrada, no una puerta.
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

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let svc: SupabaseClient;

let asesor1Id: string;
let agenciaId: string;
/** Leads fixture creados por esta corrida; se purgan en afterAll. */
const leadsCreados: string[] = [];

/** Crea un lead de prueba con rastro: seguimiento, recordatorio y notificacion. */
async function crearLeadConRastro(marca: string): Promise<string> {
  const { data: lead, error } = await svc
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: marca,
      fuente: 'otro',
      asesor_id: asesor1Id,
      asignado_en: new Date().toISOString(),
      archivado: true,
    })
    .select('id')
    .single();
  if (error || !lead) throw new Error(`No se pudo crear el lead fixture: ${error?.message}`);
  leadsCreados.push(lead.id);

  const { error: segError } = await svc
    .from('seguimientos')
    .insert({ lead_id: lead.id, autor_id: asesor1Id, tipo: 'sistema', nota: marca });
  if (segError) throw new Error(`No se pudo crear el seguimiento fixture: ${segError.message}`);

  const { error: recError } = await svc.from('recordatorios').insert({
    lead_id: lead.id,
    asesor_id: asesor1Id,
    fecha_hora: new Date(Date.now() + 3_600_000).toISOString(),
    nota: marca,
  });
  if (recError) throw new Error(`No se pudo crear el recordatorio fixture: ${recError.message}`);

  const { error: notiError } = await svc.from('notificaciones').insert({
    destinatario_id: asesor1Id,
    tipo: 'lead_asignado',
    texto: marca,
    url: `/asesor/leads/${lead.id}`,
  });
  if (notiError) throw new Error(`No se pudo crear la notificacion fixture: ${notiError.message}`);

  return lead.id;
}

beforeAll(async () => {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    throw new Error(
      'Faltan variables en .env.local: se requieren NEXT_PUBLIC_SUPABASE_URL, ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY'
    );
  }

  admin = makeClient(PUBLISHABLE_KEY);
  asesor1 = makeClient(PUBLISHABLE_KEY);
  svc = makeClient(SECRET_KEY);

  const logins = await Promise.all([
    admin.auth.signInWithPassword({ email: 'admin@montana.test', password: PASSWORD }),
    asesor1.auth.signInWithPassword({ email: 'asesor1@montana.test', password: PASSWORD }),
  ]);
  for (const login of logins) {
    if (login.error || !login.data.session) {
      throw new Error(
        `Login de usuario seed fallo: ${login.error?.message ?? 'sin sesion'}. Corre npm run seed.`
      );
    }
  }
  asesor1Id = logins[1].data.session!.user.id;

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia: ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;
}, 30_000);

afterAll(async () => {
  // Con 0027 los fixtures SI se pueden limpiar de verdad (antes solo se
  // archivaban, ver recordatorios-rls.integration.test.ts).
  for (const id of leadsCreados) {
    await svc.rpc('eliminar_lead_definitivo', { p_lead_id: id });
  }
}, 30_000);

describe('eliminar_lead_definitivo (0027)', () => {
  it('un asesor logueado NO puede llamarla', async () => {
    const leadId = await crearLeadConRastro(`TEST-PAP-${RUN}-asesor`);

    const { error } = await asesor1.rpc('eliminar_lead_definitivo', { p_lead_id: leadId });
    expect(error).not.toBeNull();

    const { data } = await svc.from('leads').select('id').eq('id', leadId).maybeSingle();
    expect(data?.id).toBe(leadId);
  });

  it('un admin logueado tampoco: la funcion es solo para el service role', async () => {
    const leadId = await crearLeadConRastro(`TEST-PAP-${RUN}-admin`);

    const { error } = await admin.rpc('eliminar_lead_definitivo', { p_lead_id: leadId });
    expect(error).not.toBeNull();

    const { data } = await svc.from('leads').select('id').eq('id', leadId).maybeSingle();
    expect(data?.id).toBe(leadId);
  });

  it('con service role borra el lead y TODO su rastro', async () => {
    const leadId = await crearLeadConRastro(`TEST-PAP-${RUN}-purga`);

    const { error } = await svc.rpc('eliminar_lead_definitivo', { p_lead_id: leadId });
    expect(error).toBeNull();

    const [lead, seguimientos, eventos, recordatorios, notificaciones] = await Promise.all([
      svc.from('leads').select('id').eq('id', leadId).maybeSingle(),
      svc.from('seguimientos').select('id').eq('lead_id', leadId),
      svc.from('lead_eventos').select('id').eq('lead_id', leadId),
      svc.from('recordatorios').select('id').eq('lead_id', leadId),
      svc.from('notificaciones').select('id').like('url', `%${leadId}%`),
    ]);

    expect(lead.data).toBeNull();
    expect(seguimientos.data).toEqual([]);
    expect(eventos.data).toEqual([]);
    expect(recordatorios.data).toEqual([]);
    expect(notificaciones.data).toEqual([]);
  });

  it('FUERA de la purga los seguimientos y eventos siguen siendo inmutables', async () => {
    const leadId = await crearLeadConRastro(`TEST-PAP-${RUN}-inmutable`);

    const { error: errorSeguimiento } = await svc
      .from('seguimientos')
      .delete()
      .eq('lead_id', leadId);
    expect(errorSeguimiento?.message).toContain('inmutable');

    const { error: errorEventos } = await svc.from('lead_eventos').delete().eq('lead_id', leadId);
    expect(errorEventos?.message).toContain('inmutable');

    const { data } = await svc.from('seguimientos').select('id').eq('lead_id', leadId);
    expect(data?.length).toBe(1);
  });
});
