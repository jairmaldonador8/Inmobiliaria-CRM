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

  it('asesor1 NO puede modificar campos de un lead ajeno (policy de ownership, 0 filas sin error)', async () => {
    // A diferencia de la revocacion de columna (asesor_id, que SI produce error),
    // esta denegacion viene de la policy USING de ownership: supabase-js NO
    // regresa error, regresa 0 filas afectadas. Trampa clasica de "silent 0 rows"
    // que la suite debe cubrir explicitamente.
    const { data, error } = await asesor1
      .from('leads')
      .update({ nombre: 'HACKEADO' })
      .eq('id', lead2Id)
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Verificacion (service-role): el nombre del lead de asesor2 sigue intacto.
    const { data: after, error: afterError } = await svc.from('leads').select('nombre').eq('id', lead2Id).single();
    expect(afterError).toBeNull();
    expect(after!.nombre).toBe(MARK_LEAD_ASESOR2);
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

  it('asesor1 NO puede insertar seguimiento con easybroker_id forjado, pero SI sin el (0006: grant de columnas)', async () => {
    // Migracion 0006: el grant de insert de authenticated sobre seguimientos
    // se restringe a (lead_id, autor_id, tipo, propiedad_id, nota).
    // easybroker_id queda fuera a proposito — solo service-role (el sync)
    // puede escribirla — para que un asesor no pueda forjarla y hacer que
    // contactRequestYaVisto() trate un contact request real como duplicado
    // y descarte el lead silenciosamente. Sin columna revocada, esto SI
    // regresa error (a diferencia de una denegacion por policy USING, que
    // regresa 0 filas).
    const { error: forjadoError } = await asesor1.from('seguimientos').insert({
      lead_id: lead1Id,
      autor_id: asesor1Id,
      tipo: 'sistema',
      nota: `${MARK_SEGUIMIENTO}-easybroker-id-forjado`,
      easybroker_id: `TEST-RLS-${RUN}-easybroker-id-forjado`,
    });
    expect(forjadoError).not.toBeNull();

    // Verificacion (service-role): la fila con easybroker_id forjado nunca se creo.
    const { data: check, error: checkError } = await svc
      .from('seguimientos')
      .select('id')
      .eq('easybroker_id', `TEST-RLS-${RUN}-easybroker-id-forjado`);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);

    // Sin easybroker_id (columna permitida), el mismo insert SI funciona.
    const { data: ok, error: okError } = await asesor1
      .from('seguimientos')
      .insert({
        lead_id: lead1Id,
        autor_id: asesor1Id,
        tipo: 'otro',
        nota: `${MARK_SEGUIMIENTO}-sin-easybroker-id`,
      })
      .select('id, nota, easybroker_id')
      .single();
    expect(okError).toBeNull();
    expect(ok!.nota).toBe(`${MARK_SEGUIMIENTO}-sin-easybroker-id`);
    expect(ok!.easybroker_id).toBeNull();
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

describe('push_suscripciones', () => {
  // Migracion 0007 solo agrega la policy de UPDATE faltante; select/insert/
  // delete-own ya viven desde 0002. Endpoints obviamente falsos (dominio
  // example.com), marcados por corrida para no colisionar entre ejecuciones.
  const PUSH_ENDPOINT_ASESOR1 = `https://example.com/push/test-${RUN}-asesor1`;
  const PUSH_ENDPOINT_ASESOR2 = `https://example.com/push/test-${RUN}-asesor2`;
  const PUSH_ENDPOINT_CROSS = `https://example.com/push/test-${RUN}-cross-insert-should-not-exist`;

  let pushSub1Id: string; // fila de asesor1 (insertada en el primer test)
  let pushSub2Id: string; // fila de asesor2 (insertada en el segundo test)

  afterAll(async () => {
    if (svc) {
      await svc.from('push_suscripciones').delete().in('endpoint', [
        PUSH_ENDPOINT_ASESOR1,
        PUSH_ENDPOINT_ASESOR2,
        PUSH_ENDPOINT_CROSS,
      ]);
    }
  }, 30_000);

  it('asesor1 inserta su propia suscripcion y la lee de vuelta', async () => {
    const { data: ins, error: insError } = await asesor1
      .from('push_suscripciones')
      .insert({
        usuario_id: asesor1Id,
        endpoint: PUSH_ENDPOINT_ASESOR1,
        p256dh: 'p256dh-fake-asesor1',
        auth: 'auth-fake-asesor1',
      })
      .select('id, usuario_id, endpoint')
      .single();
    expect(insError).toBeNull();
    expect(ins!.usuario_id).toBe(asesor1Id);
    pushSub1Id = ins!.id;

    const { data: leida, error: leidaError } = await asesor1
      .from('push_suscripciones')
      .select('id, endpoint')
      .eq('id', ins!.id);
    expect(leidaError).toBeNull();
    expect(leida).toHaveLength(1);
    expect(leida![0].endpoint).toBe(PUSH_ENDPOINT_ASESOR1);
  });

  it('asesor1 NO ve la suscripcion de asesor2', async () => {
    const { data: subAsesor2, error: subError } = await svc
      .from('push_suscripciones')
      .insert({
        usuario_id: asesor2Id,
        endpoint: PUSH_ENDPOINT_ASESOR2,
        p256dh: 'p256dh-fake-asesor2',
        auth: 'auth-fake-asesor2',
      })
      .select('id')
      .single();
    expect(subError).toBeNull();
    expect(subAsesor2!.id).toBeTruthy();
    pushSub2Id = subAsesor2!.id;

    const { data, error } = await asesor1
      .from('push_suscripciones')
      .select('id')
      .eq('endpoint', PUSH_ENDPOINT_ASESOR2);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('asesor1 NO puede insertar una suscripcion con usuario_id de asesor2 (with check)', async () => {
    const { error } = await asesor1.from('push_suscripciones').insert({
      usuario_id: asesor2Id,
      endpoint: PUSH_ENDPOINT_CROSS,
      p256dh: 'p256dh-fake-cross',
      auth: 'auth-fake-cross',
    });
    expect(error).not.toBeNull();

    // Verificacion (service-role): la suscripcion nunca se creo.
    const { data: check, error: checkError } = await svc
      .from('push_suscripciones')
      .select('id')
      .eq('endpoint', PUSH_ENDPOINT_CROSS);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);
  });

  it('asesor1 SI puede actualizar su propia suscripcion (0007: policy de UPDATE)', async () => {
    const { data: upd, error: updError } = await asesor1
      .from('push_suscripciones')
      .update({ user_agent: `TEST-RLS-${RUN}-user-agent-actualizado` })
      .eq('id', pushSub1Id)
      .select('id, user_agent');
    expect(updError).toBeNull();
    expect(upd).toHaveLength(1);
    expect(upd![0].user_agent).toBe(`TEST-RLS-${RUN}-user-agent-actualizado`);

    // Verificacion (service-role): el cambio persiste.
    const { data: after, error: afterError } = await svc
      .from('push_suscripciones')
      .select('user_agent')
      .eq('id', pushSub1Id)
      .single();
    expect(afterError).toBeNull();
    expect(after!.user_agent).toBe(`TEST-RLS-${RUN}-user-agent-actualizado`);
  });

  it('asesor1 NO puede actualizar la suscripcion de asesor2 (0 filas sin error) ni reasignar la suya a asesor2 (with check)', async () => {
    // Denegacion por policy USING: 0 filas afectadas, sin error (mismo patron
    // que la denegacion de UPDATE sobre leads ajenos, ver arriba).
    const { data: cross, error: crossError } = await asesor1
      .from('push_suscripciones')
      .update({ user_agent: 'HACKEADO' })
      .eq('id', pushSub2Id)
      .select('id');
    expect(crossError).toBeNull();
    expect(cross).toHaveLength(0);

    // Verificacion (service-role): la suscripcion de asesor2 sigue intacta.
    const { data: after, error: afterError } = await svc
      .from('push_suscripciones')
      .select('user_agent')
      .eq('id', pushSub2Id)
      .single();
    expect(afterError).toBeNull();
    expect(after!.user_agent).toBeNull();

    // Denegacion por policy WITH CHECK: reasignar la propia fila a asesor2 SI
    // regresa error (viola with check usuario_id = auth.uid() en el UPDATE).
    const { error: reasignaError } = await asesor1
      .from('push_suscripciones')
      .update({ usuario_id: asesor2Id })
      .eq('id', pushSub1Id);
    expect(reasignaError).not.toBeNull();

    // Verificacion (service-role): la fila de asesor1 sigue siendo suya.
    const { data: sigue, error: sigueError } = await svc
      .from('push_suscripciones')
      .select('usuario_id')
      .eq('id', pushSub1Id)
      .single();
    expect(sigueError).toBeNull();
    expect(sigue!.usuario_id).toBe(asesor1Id);
  });
});
