// @vitest-environment node
/**
 * Tests de integracion RLS (Fase 1, Task 8) — CRM Montana Realty.
 *
 * Corren contra el proyecto Supabase REAL (cloud, credenciales en .env.local),
 * usando JWTs reales via signInWithPassword con los usuarios seed:
 *   - admin@montana.test   (rol admin)
 *   - asesor1@montana.test (rol asesor)
 *   - asesor2@montana.test (rol asesor)
 * Password de los 3: Password123! (ver scripts/seed.ts).
 *
 * IMPORTANTE: una denegacion de SELECT por RLS regresa FILAS VACIAS, no un
 * error. Las violaciones de "with check" / grants de columna SI regresan
 * error (supabase-js lo entrega como { error }, nunca throw). Cada test
 * asume la forma correcta segun lo que la policy en cuestion realmente hace
 * (ver supabase/migrations/0002_rls.sql).
 *
 * Higiene de fixtures (decision deliberada, ver notas de la tarea):
 * seguimientos es una tabla append-only — ni siquiera el service-role puede
 * hacer UPDATE/DELETE sobre ella (trigger `seguimientos_bloquea_update_delete`
 * en las 14 tablas, ver migracion 0002 seccion 5). Por lo tanto los 2 leads
 * de fixture que reciben un seguimiento en este archivo NO se pueden borrar
 * (violarian la FK seguimientos.lead_id). En vez de eso, el afterAll los
 * ARCHIVA (archivado=true) via service-role en lugar de borrarlos. Los
 * leads y sus seguimientos de prueba se acumulan en la base de dev/staging
 * entre corridas — aceptable para una base de desarrollo, documentado aqui
 * a proposito. La notificacion de fixture SI se borra (no tiene ese trigger).
 *
 * Ejecutar con: npm run test:rls (excluido del `npm test` normal)
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
const ADMIN_EMAIL = 'admin@montana.test';
const ASESOR1_EMAIL = 'asesor1@montana.test';
const ASESOR2_EMAIL = 'asesor2@montana.test';

// Marcador unico por corrida: permite distinguir los fixtures de esta
// ejecucion de los que hayan quedado archivados de corridas anteriores.
const RUN = Date.now();
const MARK_LEAD_ASESOR1 = `TEST-RLS-${RUN}-lead-asesor1`;
const MARK_LEAD_ASESOR2 = `TEST-RLS-${RUN}-lead-asesor2`;
const MARK_LEAD_CROSS = `TEST-RLS-${RUN}-cross-insert-should-not-exist`;
const MARK_PROPIEDAD = `TEST-RLS-${RUN}-propiedad-should-not-exist`;
const MARK_SEGUIMIENTO = `TEST-RLS-${RUN}-seguimiento-propio`;
// Telefonos en rango reservado/ficticio (no colisiona con seed real 5551xxxxxx).
const TEL_ASESOR1 = '5599000001';
const TEL_ASESOR2 = '5599000002';

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Decodifica el payload del JWT (sin verificar firma; solo para leer claims en el test). */
function jwtClaims(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let asesor2: SupabaseClient;
let anon: SupabaseClient; // publishable key, SIN sign-in
let svc: SupabaseClient; // secret key: SOLO setup/teardown/verificacion, bypasea RLS

let adminId: string;
let asesor1Id: string;
let asesor2Id: string;
let adminClaims: Record<string, unknown>;
let asesor1Claims: Record<string, unknown>;

let agenciaId: string;
let lead1Id: string; // de asesor1
let lead2Id: string; // de asesor2
let notifId: string; // notificacion de asesor1

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
  anon = makeClient(PUBLISHABLE_KEY);
  svc = makeClient(SECRET_KEY);

  const adminLogin = await admin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
  if (adminLogin.error || !adminLogin.data.session) {
    throw new Error(`Login de ${ADMIN_EMAIL} fallo: ${adminLogin.error?.message ?? 'sin sesion'}. Corre npm run seed.`);
  }
  const asesor1Login = await asesor1.auth.signInWithPassword({ email: ASESOR1_EMAIL, password: PASSWORD });
  if (asesor1Login.error || !asesor1Login.data.session) {
    throw new Error(`Login de ${ASESOR1_EMAIL} fallo: ${asesor1Login.error?.message ?? 'sin sesion'}. Corre npm run seed.`);
  }
  const asesor2Login = await asesor2.auth.signInWithPassword({ email: ASESOR2_EMAIL, password: PASSWORD });
  if (asesor2Login.error || !asesor2Login.data.session) {
    throw new Error(`Login de ${ASESOR2_EMAIL} fallo: ${asesor2Login.error?.message ?? 'sin sesion'}. Corre npm run seed.`);
  }

  adminId = adminLogin.data.session.user.id;
  asesor1Id = asesor1Login.data.session.user.id;
  asesor2Id = asesor2Login.data.session.user.id;
  adminClaims = jwtClaims(adminLogin.data.session.access_token);
  asesor1Claims = jwtClaims(asesor1Login.data.session.access_token);

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia "Montana Realty": ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  const { data: l1, error: l1Error } = await svc
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: MARK_LEAD_ASESOR1,
      telefono: TEL_ASESOR1,
      fuente: 'otro',
      asesor_id: asesor1Id,
    })
    .select('id')
    .single();
  if (l1Error || !l1) throw new Error(`No se pudo crear el lead fixture de asesor1: ${l1Error?.message}`);
  lead1Id = l1.id;

  const { data: l2, error: l2Error } = await svc
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: MARK_LEAD_ASESOR2,
      telefono: TEL_ASESOR2,
      fuente: 'otro',
      asesor_id: asesor2Id,
    })
    .select('id')
    .single();
  if (l2Error || !l2) throw new Error(`No se pudo crear el lead fixture de asesor2: ${l2Error?.message}`);
  lead2Id = l2.id;

  const { data: notif, error: notifError } = await svc
    .from('notificaciones')
    .insert({
      destinatario_id: asesor1Id,
      tipo: 'test',
      texto: `TEST-RLS-${RUN} notificacion de prueba`,
      leida: false,
    })
    .select('id')
    .single();
  if (notifError || !notif) throw new Error(`No se pudo crear la notificacion fixture: ${notifError?.message}`);
  notifId = notif.id;
}, 30_000);

afterAll(async () => {
  if (svc) {
    // Los leads de fixture NO se borran: seguimientos es append-only (ni el
    // service-role puede UPDATE/DELETE sobre ella, ver trigger en migracion
    // 0002), y uno de estos leads recibe un seguimiento durante los tests,
    // lo cual bloquearia un DELETE por la FK seguimientos.lead_id. En vez de
    // eso, se archivan para no ensuciar vistas de "leads activos".
    await svc.from('leads').update({ archivado: true }).in('id', [lead1Id, lead2Id].filter(Boolean));
    // La notificacion si se puede borrar (no tiene trigger de inmutabilidad).
    if (notifId) await svc.from('notificaciones').delete().eq('id', notifId);
    // Defensivo: ninguno de estos deberia existir, pero si el aislamiento
    // fallara y el insert cross-tenant/propiedad se hubiera colado, limpiar.
    await svc.from('leads').delete().eq('nombre', MARK_LEAD_CROSS);
    await svc.from('propiedades').delete().eq('easybroker_id', MARK_PROPIEDAD);
  }
  await admin?.auth.signOut();
  await asesor1?.auth.signOut();
  await asesor2?.auth.signOut();
}, 30_000);

describe('RLS Fase 1: aislamiento admin/asesor (Supabase real)', () => {
  it('asesor1 ve su propio lead marcado y NO ve el de asesor2', async () => {
    const { data, error } = await asesor1
      .from('leads')
      .select('id, nombre, asesor_id')
      .in('nombre', [MARK_LEAD_ASESOR1, MARK_LEAD_ASESOR2]);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toEqual([lead1Id]);
    expect(data![0].asesor_id).toBe(asesor1Id);
  });

  it('asesor1 NO puede reasignar asesor_id de su propio lead (columna revocada)', async () => {
    const { error } = await asesor1.from('leads').update({ asesor_id: asesor2Id }).eq('id', lead1Id);
    expect(error).not.toBeNull();

    // Verificacion (service-role): el lead sigue asignado a asesor1.
    const { data: after, error: afterError } = await svc.from('leads').select('asesor_id').eq('id', lead1Id).single();
    expect(afterError).toBeNull();
    expect(after!.asesor_id).toBe(asesor1Id);
  });

  it('asesor1 NO puede insertar un lead asignado a asesor2 (with check)', async () => {
    const { error } = await asesor1.from('leads').insert({
      agencia_id: agenciaId,
      nombre: MARK_LEAD_CROSS,
      telefono: '5599000099',
      fuente: 'otro',
      asesor_id: asesor2Id,
    });
    expect(error).not.toBeNull();

    // Verificacion (service-role): el lead nunca se creo.
    const { data: check, error: checkError } = await svc.from('leads').select('id').eq('nombre', MARK_LEAD_CROSS);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);
  });

  it('asesor1 inserta un seguimiento en su propio lead, y luego NO puede update/delete (append-only)', async () => {
    const { data: seg, error: insError } = await asesor1
      .from('seguimientos')
      .insert({ lead_id: lead1Id, autor_id: asesor1Id, tipo: 'sistema', nota: MARK_SEGUIMIENTO })
      .select('id, nota')
      .single();
    expect(insError).toBeNull();
    expect(seg!.nota).toBe(MARK_SEGUIMIENTO);

    const { error: updError } = await asesor1.from('seguimientos').update({ nota: 'hackeado' }).eq('id', seg!.id);
    expect(updError).not.toBeNull();

    const { error: delError } = await asesor1.from('seguimientos').delete().eq('id', seg!.id);
    expect(delError).not.toBeNull();

    // Verificacion (service-role): la nota original sigue intacta.
    const { data: after, error: afterError } = await svc.from('seguimientos').select('nota').eq('id', seg!.id).single();
    expect(afterError).toBeNull();
    expect(after!.nota).toBe(MARK_SEGUIMIENTO);
  });

  it('asesor1 NO puede insertar un seguimiento en el lead de asesor2', async () => {
    const { error } = await asesor1
      .from('seguimientos')
      .insert({ lead_id: lead2Id, autor_id: asesor1Id, tipo: 'sistema', nota: `${MARK_SEGUIMIENTO}-cross` });
    expect(error).not.toBeNull();
  });

  it('asesor1 NO puede insertar notificaciones, pero puede marcar leida la propia', async () => {
    const { error: insError } = await asesor1
      .from('notificaciones')
      .insert({ destinatario_id: asesor1Id, tipo: 'test', texto: 'no deberia poder' });
    expect(insError).not.toBeNull();

    const { data: upd, error: updError } = await asesor1
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', notifId)
      .select('id, leida');
    expect(updError).toBeNull();
    expect(upd).toHaveLength(1);
    expect(upd![0].leida).toBe(true);
  });

  it('asesor1 NO puede escribir en propiedades', async () => {
    const { error } = await asesor1.from('propiedades').insert({
      agencia_id: agenciaId,
      easybroker_id: MARK_PROPIEDAD,
      titulo: 'No deberia poder crear esto',
    });
    expect(error).not.toBeNull();

    const { data: check, error: checkError } = await svc
      .from('propiedades')
      .select('id')
      .eq('easybroker_id', MARK_PROPIEDAD);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);
  });

  it('admin ve ambos leads marcados (asesor1 y asesor2)', async () => {
    const { data, error } = await admin
      .from('leads')
      .select('id, nombre')
      .in('nombre', [MARK_LEAD_ASESOR1, MARK_LEAD_ASESOR2]);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id).sort()).toEqual([lead1Id, lead2Id].sort());
  });

  it('cliente anonimo (sin sesion) no ve leads ni usuarios', async () => {
    const { data: leads, error: leadsError } = await anon.from('leads').select('id');
    expect(leadsError).toBeNull();
    expect(leads).toEqual([]);

    const { data: usuarios, error: usuariosError } = await anon.from('usuarios').select('user_id');
    expect(usuariosError).toBeNull();
    expect(usuarios).toEqual([]);
  });

  it('claims del JWT: admin trae user_role="admin", asesor1 trae user_role="asesor"', () => {
    expect(adminClaims.user_role).toBe('admin');
    expect(asesor1Claims.user_role).toBe('asesor');
  });
});
