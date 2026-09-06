import { SavedCase } from './types';

const STORAGE_KEY = 'dcs_saved_cases';

export function getSavedCases(): SavedCase[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCase(caseData: SavedCase): void {
  if (typeof window === 'undefined') return;
  const cases = getSavedCases();
  cases.unshift(caseData); // newest first
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

export function deleteCase(id: number): void {
  if (typeof window === 'undefined') return;
  const cases = getSavedCases().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}
