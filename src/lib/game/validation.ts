export const NICKNAME_MAX = 24;
export const TITLE_MAX = 80;
export const GUESS_MAX = 80;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Tamanho máximo aceito do arquivo original antes da compressão. */
export const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
/** Limite do bucket no Supabase (5 MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ValidationResult = { ok: true; value: string } | { ok: false; error: string };

export function validateNickname(input: string): ValidationResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, error: "Informe um apelido." };
  if (value.length > NICKNAME_MAX) {
    return { ok: false, error: `O apelido deve ter no máximo ${NICKNAME_MAX} caracteres.` };
  }
  return { ok: true, value };
}

export function validateTitle(input: string): ValidationResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, error: "Informe a resposta da carta." };
  if (value.length > TITLE_MAX) {
    return { ok: false, error: `A resposta deve ter no máximo ${TITLE_MAX} caracteres.` };
  }
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { ok: false, error: "A resposta precisa conter letras ou números." };
  }
  return { ok: true, value };
}

export function validateGuess(input: string): ValidationResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, error: "Digite um palpite." };
  if (value.length > GUESS_MAX) {
    return { ok: false, error: `O palpite deve ter no máximo ${GUESS_MAX} caracteres.` };
  }
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { ok: false, error: "O palpite precisa conter letras ou números." };
  }
  return { ok: true, value };
}

export function validateImageFile(file: { type: string; size: number }): ValidationResult {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Use uma imagem JPEG, PNG ou WebP." };
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: "A imagem é muito grande (máximo 15 MB)." };
  }
  return { ok: true, value: file.type };
}
