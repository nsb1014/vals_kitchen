import type { CustomerPreference } from '../../domain/types.ts';

export function formatCustomerRequestText(preference: CustomerPreference): string {
  const phrases = preference.phrases.filter(Boolean);
  if (phrases.length === 0) {
    return 'Something balanced and satisfying, please.';
  }
  const joined =
    phrases.length === 1
      ? phrases[0]!
      : `${phrases.slice(0, -1).join(', ')}. ${phrases[phrases.length - 1]!}`;
  let result = joined.charAt(0).toUpperCase() + joined.slice(1);
  const sentenceBreak = result.indexOf('. ');
  if (sentenceBreak >= 0 && sentenceBreak + 2 < result.length) {
    const splitAt = sentenceBreak + 2;
    result =
      result.slice(0, splitAt) +
      result.charAt(splitAt).toUpperCase() +
      result.slice(splitAt + 1);
  }
  if (/[.!?]$/.test(result)) {
    return result;
  }
  return `${result}.`;
}

export function customerRequestContainsDishName(text: string, recipeNames: string[]): boolean {
  const lower = text.toLowerCase();
  return recipeNames.some((name) => lower.includes(name.toLowerCase()));
}
