import { describe, it, expect } from 'vitest';
import { getTabs } from '../Sidebar';

describe('Sidebar premium tab visibility', () => {
  it('shows PREMIUM tab for users without subscription', () => {
    const u = { email: 'test@example.com', fullAccess: false } as any;
    const tabs = getTabs(u);
    expect(tabs.some(t => t.key === 'fullaccess')).toBe(true);
  });

  it('hides PREMIUM tab for active subscription (expires in future)', () => {
    const expiresAt = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days
    const u = { email: 't@example.com', subscription: { fullAccess: true, expiresAt } } as any;
    const tabs = getTabs(u);
    expect(tabs.some(t => t.key === 'fullaccess')).toBe(false);
  });

  it('shows PREMIUM tab for expired subscription', () => {
    const expiresAt = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago
    const u = { email: 'e@example.com', subscription: { fullAccess: true, expiresAt } } as any;
    const tabs = getTabs(u);
    expect(tabs.some(t => t.key === 'fullaccess')).toBe(true);
  });

  it('hides PREMIUM tab for stripe active status', () => {
    const u = { email: 's@example.com', subscription: { fullAccess: true, source: 'stripe', status: 'active' } } as any;
    const tabs = getTabs(u);
    expect(tabs.some(t => t.key === 'fullaccess')).toBe(false);
  });
});
