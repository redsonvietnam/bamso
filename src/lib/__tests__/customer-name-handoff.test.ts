import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeCustomerName, getCustomerName, clearCustomerName } from '@/lib/customer-name-handoff';

const PREFIX = 'bamso:customerName:';

describe('customer-name-handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('storeCustomerName', () => {
    it('stores a name under the ticket key', () => {
      storeCustomerName('t-123', 'Nguyen Van A');
      expect(sessionStorage.getItem(`${PREFIX}t-123`)).toBe('Nguyen Van A');
    });

    it('overwrites a previously stored name', () => {
      storeCustomerName('t-123', 'Old Name');
      storeCustomerName('t-123', 'New Name');
      expect(sessionStorage.getItem(`${PREFIX}t-123`)).toBe('New Name');
    });

    it('does not affect other ticket keys', () => {
      storeCustomerName('t-1', 'Alice');
      storeCustomerName('t-2', 'Bob');
      expect(sessionStorage.getItem(`${PREFIX}t-1`)).toBe('Alice');
      expect(sessionStorage.getItem(`${PREFIX}t-2`)).toBe('Bob');
    });
  });

  describe('getCustomerName', () => {
    it('returns the stored name', () => {
      sessionStorage.setItem(`${PREFIX}t-456`, 'Tran Thi B');
      expect(getCustomerName('t-456')).toBe('Tran Thi B');
    });

    it('returns null for unknown ticket', () => {
      expect(getCustomerName('t-unknown')).toBeNull();
    });
  });

  describe('clearCustomerName', () => {
    it('removes the stored name', () => {
      sessionStorage.setItem(`${PREFIX}t-789`, 'Le Van C');
      clearCustomerName('t-789');
      expect(sessionStorage.getItem(`${PREFIX}t-789`)).toBeNull();
    });

    it('does not affect other tickets', () => {
      sessionStorage.setItem(`${PREFIX}t-1`, 'Alice');
      sessionStorage.setItem(`${PREFIX}t-2`, 'Bob');
      clearCustomerName('t-1');
      expect(sessionStorage.getItem(`${PREFIX}t-1`)).toBeNull();
      expect(sessionStorage.getItem(`${PREFIX}t-2`)).toBe('Bob');
    });
  });

  describe('error resilience', () => {
    it('storeCustomerName does not throw when sessionStorage throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => storeCustomerName('t-err', 'name')).not.toThrow();
    });

    it('getCustomerName returns null when sessionStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('access denied');
      });
      expect(getCustomerName('t-err')).toBeNull();
    });

    it('clearCustomerName does not throw when sessionStorage throws', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('access denied');
      });
      expect(() => clearCustomerName('t-err')).not.toThrow();
    });
  });
});
