// @vitest-environment node
/**
 * Tests de integracion RLS de `contactos_whatsapp` (migracion 0013).
 *
 * Mismas convenciones que src/test/rls.integration.test.ts: corre contra el
 * proyecto Supabase REAL de desarrollo (credenciales en .env.local), con JWTs
 * reales via signInWithPassword de los usuarios seed (admin/asesor1/asesor2,
 * password Password123!, ver scripts/seed.ts).
 *
 * Recordatorio de formas de denegacion (misma trampa que el archivo hermano):
 *   - policy USING (select/update sobre fila ajena) -> 0 filas, SIN error.
 *   - policy WITH CHECK (insert que no cumple)      -> error 42501.
 *   - grant de columna ausente (update/insert)      -> error 42501.
 *   - grant de tabla revocado (delete)              -> error 42501.
 *
 * Higiene de fixtures: a diferencia de `leads`/`seguimientos`,
 * `contactos_whatsapp` NO tiene trigger de inmutabilidad, asi que el
 * service-role si puede borrar sus filas. PERO `contactos_whatsapp.lead_id`
 * es una FK NO ACTION: un lead con contactos no se puede borrar. Por eso el
 * afterAll borra PRIMERO los contactos y DESPUES los leads. Ninguno de los
 * leads de este archivo recibe seguimientos, asi que si se pueden borrar de
 * verdad (no hace falta archivarlos como en rls.integration.test.ts) y este
 * archivo no deja basura en la base de dev.
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
const ADMIN_EMAIL = 'admin@montana.test';
const ASESOR1_EMAIL = 'asesor1@montana.test';
const ASESOR2_EMAIL = 'asesor2@montana.test';

// Marcador unico por corrida (mismo patron que rls.integration.test.ts).
const RUN = Date.now();
const MARK_LEAD_A1 = `TEST-CWA-${RUN}-lead-asesor1`;
const MARK_LEAD_A1_BIS = `TEST-CWA-${RUN}-lead-asesor1-bis`;
const MARK_LEAD_A2 = `TEST-CWA-${RUN}-lead-asesor2`;
const MARK_LEAD_REASIGNABLE = `TEST-CWA-${RUN}-lead-reasignable`;
// Telefonos ficticios distintos de los de rls.integration.test.ts (5599000001/2)
// para que los dos archivos no se confundan si corren en paralelo.
const TEL_A1 = '5599000011';
const TEL_A1_BIS = '5599000012';
const TEL_A2 = '5599000013';
const TEL_REASIGNABLE = '5599000014';

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let asesor2: SupabaseClient;
let svc: SupabaseClient; // secret key: SOLO setup/teardown/verificacion, bypasea RLS

let asesor1Id: string;
let asesor2Id: string;

let agenciaId: string;
let leadA1Id: string; // de asesor1
let leadA1BisId: string; // de asesor1 (segundo lead propio: destino legitimo para el test de grant de lead_id)
let leadA2Id: string; // de asesor2
let leadReasignableId: string; // arranca en asesor1, se reasigna a asesor2 en el test 6

let contactoA1Id: string; // en leadA1 (asesor1) — tests de grants de update/delete
let contactoA1BisId: string; // en leadA1Bis (asesor1) — control positivo de resolucion
let contactoA2Id: string; // en leadA2 (asesor2) — tests de aislamiento de lectura/update
let contactoReasignableId: string; // en leadReasignable — test de reasignacion

/** Crea un lead de fixture con service-role. */
async function crearLead(nombre: string, telefono: string, asesorId: string): Promise<string> {
  const { data, error } = await svc
    .from('leads')
    .insert({ agencia_id: agenciaId, nombre, telefono, fuente: 'otro', asesor_id: asesorId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se pudo crear el lead fixture "${nombre}": ${error?.message}`);
  return data.id;
}

/** Crea un contacto de WhatsApp pendiente con service-role. */
async function crearContacto(leadId: string, autorId: string): Promise<string> {
  const { data, error } = await svc
    .from('contactos_whatsapp')
    .insert({ lead_id: leadId, autor_id: autorId, resultado: 'pendiente' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se pudo crear el contacto fixture del lead ${leadId}: ${error?.message}`);
  return data.id;
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
  asesor2 = makeClient(PUBLISHABLE_KEY);
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

  asesor1Id = asesor1Login.data.session.user.id;
  asesor2Id = asesor2Login.data.session.user.id;

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia "Montana Realty": ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  leadA1Id = await crearLead(MARK_LEAD_A1, TEL_A1, asesor1Id);
  leadA1BisId = await crearLead(MARK_LEAD_A1_BIS, TEL_A1_BIS, asesor1Id);
  leadA2Id = await crearLead(MARK_LEAD_A2, TEL_A2, asesor2Id);
  leadReasignableId = await crearLead(MARK_LEAD_REASIGNABLE, TEL_REASIGNABLE, asesor1Id);

  contactoA1Id = await crearContacto(leadA1Id, asesor1Id);
  contactoA1BisId = await crearContacto(leadA1BisId, asesor1Id);
  contactoA2Id = await crearContacto(leadA2Id, asesor2Id);
  contactoReasignableId = await crearContacto(leadReasignableId, asesor1Id);
}, 30_000);

afterAll(async () => {
  if (svc) {
    const leadIds = [leadA1Id, leadA1BisId, leadA2Id, leadReasignableId].filter(Boolean);
    if (leadIds.length > 0) {
      // ORDEN OBLIGATORIO: contactos_whatsapp.lead_id es una FK NO ACTION, asi
      // que un lead con contactos no se puede borrar. Se borra por lead_id (no
      // por los ids de contacto conocidos) para arrastrar tambien cualquier
      // fila que se hubiera colado si el aislamiento fallara.
      await svc.from('contactos_whatsapp').delete().in('lead_id', leadIds);
      await svc.from('leads').delete().in('id', leadIds);
    }
  }
  await admin?.auth.signOut();
  await asesor1?.auth.signOut();
  await asesor2?.auth.signOut();
}, 30_000);

describe('contactos_whatsapp: RLS por ownership del lead (migracion 0013)', () => {
  it('asesor1 NO puede leer los contactos de un lead de asesor2 (policy USING: 0 filas sin error)', async () => {
    const { data, error } = await asesor1
      .from('contactos_whatsapp')
      .select('id')
      .eq('id', contactoA2Id);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Control positivo: el mismo select sobre su propio contacto SI devuelve la
    // fila. Sin esto, un select roto (o una tabla vacia) daria verde arriba.
    const { data: propio, error: propioError } = await asesor1
      .from('contactos_whatsapp')
      .select('id, lead_id, resultado')
      .eq('id', contactoA1Id);
    expect(propioError).toBeNull();
    expect(propio).toHaveLength(1);
    expect(propio![0].lead_id).toBe(leadA1Id);
  });

  it('asesor1 NO puede resolver el contacto de un lead de asesor2 (policy USING: 0 filas sin error)', async () => {
    const { data, error } = await asesor1
      .from('contactos_whatsapp')
      .update({ resultado: 'contesto', resuelto_en: new Date().toISOString() })
      .eq('id', contactoA2Id)
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Verificacion (service-role): el contacto de asesor2 sigue pendiente.
    const { data: after, error: afterError } = await svc
      .from('contactos_whatsapp')
      .select('resultado, resuelto_en')
      .eq('id', contactoA2Id)
      .single();
    expect(afterError).toBeNull();
    expect(after!.resultado).toBe('pendiente');
    expect(after!.resuelto_en).toBeNull();
  });

  it('asesor1 NO puede insertar un contacto con autor_id forjado (with check: autor_id = auth.uid())', async () => {
    // El lead SI es de asesor1 (pasa la primera mitad del with check), asi que
    // la unica razon posible del rechazo es el ancla de autoria.
    const { error } = await asesor1
      .from('contactos_whatsapp')
      .insert({ lead_id: leadA1Id, autor_id: asesor2Id });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    // Verificacion (service-role): la fila con autor forjado nunca se creo.
    const { data: check, error: checkError } = await svc
      .from('contactos_whatsapp')
      .select('id')
      .eq('lead_id', leadA1Id)
      .eq('autor_id', asesor2Id);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);

    // Control positivo: el mismo insert con su propio autor_id SI funciona.
    const { data: ok, error: okError } = await asesor1
      .from('contactos_whatsapp')
      .insert({ lead_id: leadA1Id, autor_id: asesor1Id })
      .select('id, resultado, autor_id')
      .single();
    expect(okError).toBeNull();
    expect(ok!.autor_id).toBe(asesor1Id);
    expect(ok!.resultado).toBe('pendiente');
    // Lo borra el afterAll (delete por lead_id).
  });

  it('asesor1 NO puede repuntar lead_id ni autor_id de su propio contacto (columnas fuera del grant de UPDATE)', async () => {
    // lead_id destino = leadA1Bis, que TAMBIEN es de asesor1: el with check de
    // la policy se cumpliria, asi que un 42501 aqui solo puede venir del grant
    // de columna. Sin este detalle el test daria verde por la razon equivocada.
    const { error: errorLeadId } = await asesor1
      .from('contactos_whatsapp')
      .update({ lead_id: leadA1BisId })
      .eq('id', contactoA1Id);
    expect(errorLeadId).not.toBeNull();
    expect(errorLeadId!.code).toBe('42501');

    const { error: errorAutorId } = await asesor1
      .from('contactos_whatsapp')
      .update({ autor_id: asesor2Id })
      .eq('id', contactoA1Id);
    expect(errorAutorId).not.toBeNull();
    expect(errorAutorId!.code).toBe('42501');

    // Verificacion (service-role): ninguna de las dos columnas cambio.
    const { data: after, error: afterError } = await svc
      .from('contactos_whatsapp')
      .select('lead_id, autor_id')
      .eq('id', contactoA1Id)
      .single();
    expect(afterError).toBeNull();
    expect(after!.lead_id).toBe(leadA1Id);
    expect(after!.autor_id).toBe(asesor1Id);
  });

  it('asesor1 NO puede borrar un contacto, ni siquiera el suyo (grant de DELETE revocado)', async () => {
    const { error } = await asesor1.from('contactos_whatsapp').delete().eq('id', contactoA1Id);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    // Verificacion (service-role): la fila sigue existiendo.
    const { data: after, error: afterError } = await svc
      .from('contactos_whatsapp')
      .select('id')
      .eq('id', contactoA1Id);
    expect(afterError).toBeNull();
    expect(after).toHaveLength(1);
  });

  it('asesor1 SI puede resolver su propio contacto (control positivo del grant de UPDATE)', async () => {
    // Sin este test, todas las denegaciones de arriba podrian estar en verde
    // porque el UPDATE esta roto para todo el mundo, no porque RLS discrimine.
    const resueltoEn = new Date().toISOString();
    const { data, error } = await asesor1
      .from('contactos_whatsapp')
      .update({ resultado: 'contesto', resuelto_en: resueltoEn })
      .eq('id', contactoA1BisId)
      .select('id, resultado');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].resultado).toBe('contesto');

    // Verificacion (service-role): el cambio persiste.
    const { data: after, error: afterError } = await svc
      .from('contactos_whatsapp')
      .select('resultado, resuelto_en')
      .eq('id', contactoA1BisId)
      .single();
    expect(afterError).toBeNull();
    expect(after!.resultado).toBe('contesto');
    expect(after!.resuelto_en).not.toBeNull();
  });

  it('al reasignar el lead, el contacto pendiente pasa al asesor NUEVO y deja de verlo el anterior', async () => {
    // ESTE es el test que justifica haber modelado las policies sobre el
    // ownership del LEAD y no sobre el autor (como hace `visitas`). Con
    // policies por autor, el contacto seguiria colgado de asesor1 despues de
    // la reasignacion: invisible para el asesor nuevo y — peor — todavia en la
    // cola del anterior, que ya no es dueno del lead.
    const { data: antesA1, error: antesA1Error } = await asesor1
      .from('contactos_whatsapp')
      .select('id')
      .eq('id', contactoReasignableId);
    expect(antesA1Error).toBeNull();
    expect(antesA1).toHaveLength(1);

    const { data: antesA2, error: antesA2Error } = await asesor2
      .from('contactos_whatsapp')
      .select('id')
      .eq('id', contactoReasignableId);
    expect(antesA2Error).toBeNull();
    expect(antesA2).toEqual([]);

    // Reasignacion via service-role: leads.asesor_id esta fuera del grant de
    // UPDATE de `authenticated` (ver rls.integration.test.ts), asi que en la
    // app real esto lo hace un admin o el backend, no el asesor.
    const { error: reasignaError } = await svc
      .from('leads')
      .update({ asesor_id: asesor2Id })
      .eq('id', leadReasignableId);
    expect(reasignaError).toBeNull();

    // El asesor NUEVO ahora si ve el contacto pendiente...
    const { data: despuesA2, error: despuesA2Error } = await asesor2
      .from('contactos_whatsapp')
      .select('id, resultado, autor_id')
      .eq('id', contactoReasignableId);
    expect(despuesA2Error).toBeNull();
    expect(despuesA2).toHaveLength(1);
    expect(despuesA2![0].resultado).toBe('pendiente');
    // ...aunque el autor original siga siendo asesor1: la visibilidad la manda
    // el lead, no la autoria.
    expect(despuesA2![0].autor_id).toBe(asesor1Id);

    // ...y el asesor ANTERIOR ya no.
    const { data: despuesA1, error: despuesA1Error } = await asesor1
      .from('contactos_whatsapp')
      .select('id')
      .eq('id', contactoReasignableId);
    expect(despuesA1Error).toBeNull();
    expect(despuesA1).toEqual([]);

    // Y el asesor nuevo tambien puede resolverlo (la policy de UPDATE usa el
    // mismo criterio de ownership que la de SELECT).
    const { data: resuelto, error: resueltoError } = await asesor2
      .from('contactos_whatsapp')
      .update({ resultado: 'no_contesto', resuelto_en: new Date().toISOString() })
      .eq('id', contactoReasignableId)
      .select('id, resultado');
    expect(resueltoError).toBeNull();
    expect(resuelto).toHaveLength(1);
    expect(resuelto![0].resultado).toBe('no_contesto');
  });

  it('admin lee los contactos de cualquier lead, sea de quien sea', async () => {
    const { data, error } = await admin
      .from('contactos_whatsapp')
      .select('id')
      .in('id', [contactoA1Id, contactoA1BisId, contactoA2Id, contactoReasignableId]);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id).sort()).toEqual(
      [contactoA1Id, contactoA1BisId, contactoA2Id, contactoReasignableId].sort()
    );
  });
});
