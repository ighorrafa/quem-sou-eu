/**
 * Normaliza uma resposta para comparação: minúsculas, sem acentos e apenas
 * letras/números (espaços e pontuação são descartados, então "Spider-Man",
 * "Spiderman" e "spider man" são equivalentes). Espelha `public.normalize_answer`
 * no banco; a comparação oficial acontece lá.
 */
export function normalizeAnswer(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function answersMatch(a: string, b: string): boolean {
  const na = normalizeAnswer(a);
  return na.length > 0 && na === normalizeAnswer(b);
}
