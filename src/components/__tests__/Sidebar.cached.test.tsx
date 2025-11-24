import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

// Simple smoke test: when user has no subscription but we have a cached subscription
// in localStorage, the PREMIUM tab should be hidden.

describe('Sidebar cached subscription fallback', () => {
  beforeEach(() => {
    // Ensure a working localStorage stub is present for the test run and clear it
    if (typeof (globalThis as any).localStorage === 'undefined' || typeof (globalThis as any).localStorage.getItem !== 'function') {
      (globalThis as any).localStorage = {
        _store: {} as Record<string, string>,
        getItem: function (k: string) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
        setItem: function (k: string, v: string) { this._store[k] = String(v); },
        removeItem: function (k: string) { delete this._store[k]; },
        clear: function () { for (const k of Object.keys(this._store)) delete this._store[k]; },
        key: function (i: number) { return Object.keys(this._store)[i] || null; },
        get length() { return Object.keys(this._store).length; },
      } as Storage;
    }
    try { localStorage.clear(); } catch {}
  });

  it('hides PREMIUM tab when localStorage cached subscription is active', () => {
    const email = 'cache@example.com';
    const cached = { fullAccess: true, source: 'stripe', status: 'active', purchasedAt: new Date().toISOString() };
    try { localStorage.setItem(`ndn:subscription:${email}`, JSON.stringify(cached)); } catch {}

  const onChange = () => {};
    // Sanity: ensure localStorage is readable in the test environment when
    // available. Some tests may stub localStorage as a plain object, so avoid
    // calling getItem() directly in those cases.
    const rawGet = (localStorage as any)?.getItem;
    if (typeof rawGet === 'function') {
      expect(rawGet.call(localStorage, `ndn:subscription:${email}`)).not.toBeNull();
    } else {
      // Not a function - fall back to a plain object lookup for broken stubs
      // (used in some Calibrator tests and similar).
  // Not a function - fall back for broken stubs; avoid logging here.
      // Try to read a possible internal store property if present.
      const maybeRaw = (localStorage as any)._store || (localStorage as any).store || null;
      // If present, check our key; otherwise we can't rely on the stub.
      if (maybeRaw) expect(Object.prototype.hasOwnProperty.call(maybeRaw, `ndn:subscription:${email}`)).toBe(true);
    }
    render(<Sidebar active={'score'} onChange={onChange} user={{ email }} />);

    // The PREMIUM tab shouldn't be present
    const premium = screen.queryByText(/PREMIUM/i);
    expect(premium).toBeNull();
  });
  it('hides PREMIUM tab when user has subscription prop present', () => {
    const email = 'direct@example.com';
    const onChange = () => {};
    const subs = { fullAccess: true, source: 'stripe', status: 'active', purchasedAt: new Date().toISOString() };
    render(<Sidebar active={'score'} onChange={onChange} user={{ email, subscription: subs }} />);
    const premium = screen.queryByText(/PREMIUM/i);
    expect(premium).toBeNull();
  });
});
