/**
 * Tests TDD para el cifrado AES-256-GCM de refresh tokens de Google
 * (ver src/lib/google/cifrado.ts). Las propiedades de seguridad que
 * realmente importan: el AAD liga el ciphertext a su fila, un byte
 * manipulado no descifra en silencio, y los payloads corruptos/truncados
 * fallan con errores legibles en vez de excepciones crípticas de Node.
 */
import { describe, expect, it } from 'vitest'
import { cifrarToken, descifrarToken } from '@/lib/google/cifrado'

// clave de prueba: 32 bytes fijos en base64
const CLAVE = Buffer.alloc(32, 7).toString('base64')

describe('cifrado de tokens', () => {
  it('roundtrip con AAD', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    expect(c.startsWith('v1.')).toBe(true)
    expect(descifrarToken(c, 'user-abc', CLAVE)).toBe('refresh-123')
  })

  it('AAD distinto no descifra (ciphertext movido de fila)', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    expect(() => descifrarToken(c, 'user-OTRO', CLAVE)).toThrow()
  })

  it('dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    expect(cifrarToken('x', 'u', CLAVE)).not.toBe(cifrarToken('x', 'u', CLAVE))
  })

  it('versión desconocida lanza error identificable', () => {
    expect(() => descifrarToken('v9.abc', 'u', CLAVE)).toThrow(/versión/i)
  })

  it('payload vacío hace roundtrip correctamente', () => {
    const c = cifrarToken('', 'user-vacio', CLAVE)
    expect(descifrarToken(c, 'user-vacio', CLAVE)).toBe('')
  })

  it('texto largo (refresh token real de Google, ~500 chars) hace roundtrip', () => {
    const largo = '1//' + 'a'.repeat(500)
    const c = cifrarToken(largo, 'user-largo', CLAVE)
    expect(descifrarToken(c, 'user-largo', CLAVE)).toBe(largo)
  })

  it('texto con caracteres unicode hace roundtrip', () => {
    const texto = 'token-con-ñ-y-emoji-🔒-中文'
    const c = cifrarToken(texto, 'user-unicode', CLAVE)
    expect(descifrarToken(c, 'user-unicode', CLAVE)).toBe(texto)
  })

  it('ciphertext manipulado (un byte del payload) lanza, no devuelve basura', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    const [version, b64] = c.split('.')
    const payload = Buffer.from(b64, 'base64')
    // El byte en el offset 12 cae dentro del ciphertext (después del IV de 12 bytes).
    payload[12] = payload[12] ^ 0xff
    const manipulado = `${version}.${payload.toString('base64')}`
    expect(() => descifrarToken(manipulado, 'user-abc', CLAVE)).toThrow()
  })

  it('base64 corrupto (caracteres inválidos) lanza en vez de descifrar en silencio', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    const corrupto = c.slice(0, -4) + '####'
    expect(() => descifrarToken(corrupto, 'user-abc', CLAVE)).toThrow()
  })

  it('tag truncado lanza con error claro, no un RangeError críptico', () => {
    const c = cifrarToken('refresh-123', 'user-abc', CLAVE)
    const [version, b64] = c.split('.')
    const payload = Buffer.from(b64, 'base64')
    const truncado = payload.subarray(0, payload.length - 5)
    const valor = `${version}.${truncado.toString('base64')}`
    expect(() => descifrarToken(valor, 'user-abc', CLAVE)).toThrow(/corrupto|truncad/i)
  })

  it('payload demasiado corto (menor que iv+tag) lanza con error claro', () => {
    const corto = Buffer.alloc(10).toString('base64')
    expect(() => descifrarToken(`v1.${corto}`, 'u', CLAVE)).toThrow(/corrupto|truncad/i)
  })

  it('valor sin prefijo de versión (sin punto) lanza error identificable', () => {
    expect(() => descifrarToken('sin-version-aqui', 'u', CLAVE)).toThrow(/versión|formato/i)
  })

  it('clave de longitud inválida al cifrar lanza error explícito', () => {
    const claveCorta = Buffer.alloc(16, 1).toString('base64')
    expect(() => cifrarToken('x', 'u', claveCorta)).toThrow(/32 bytes/)
  })

  it('clave de longitud inválida al descifrar lanza error explícito', () => {
    const c = cifrarToken('x', 'u', CLAVE)
    const claveCorta = Buffer.alloc(16, 1).toString('base64')
    expect(() => descifrarToken(c, 'u', claveCorta)).toThrow(/32 bytes/)
  })

  it('clave faltante lanza error explícito sin exponer el valor', () => {
    expect(() => cifrarToken('x', 'u', undefined)).toThrow(/GOOGLE_TOKEN_SECRET/)
  })

  it('el mensaje de error nunca incluye el texto en claro', () => {
    const secreto = 'refresh-super-secreto-no-debe-aparecer'
    const c = cifrarToken(secreto, 'user-abc', CLAVE)
    try {
      descifrarToken(c, 'user-OTRO', CLAVE)
      expect.unreachable()
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(secreto)
    }
  })
})
