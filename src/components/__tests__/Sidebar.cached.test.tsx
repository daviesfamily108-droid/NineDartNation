import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

// Simple smoke test: when user has no subscription but we have a cached subscription
// in localStorage, the PREMIUM tab should be hidden.

describe('Sidebar cached subscription fallback', () => {
  beforeEach(() => {
    // Clear DOM-local storage
    try { localStorage.clear(); } catch {}
  });

  it('hides PREMIUM tab when localStorage cached subscription is active', () => {
    const email = 'cache@example.com';
    const cached = { fullAccess: true, source: 'stripe', status: 'active', purchasedAt: new Date().toISOString() };
    try { localStorage.setItem(`ndn:subscription:${email}`, JSON.stringify(cached)); } catch {}

    const onChange = () => {};
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
