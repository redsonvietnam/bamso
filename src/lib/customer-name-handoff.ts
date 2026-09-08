'use client';

const STORAGE_PREFIX = 'bamso:customerName:';

export function storeCustomerName(ticketId: string, name: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${ticketId}`, name);
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

export function getCustomerName(ticketId: string): string | null {
  try {
    return sessionStorage.getItem(`${STORAGE_PREFIX}${ticketId}`);
  } catch {
    return null;
  }
}

export function clearCustomerName(ticketId: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${ticketId}`);
  } catch {
    // ignore
  }
}
