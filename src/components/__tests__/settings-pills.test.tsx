import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll } from 'vitest';
import { ThemeProvider } from '../ThemeContext';
import { waitFor } from '@testing-library/react';

beforeAll(() => {
  if (typeof window !== 'undefined') {
    const bad = (v: any) => typeof v !== 'function';
    if (typeof (window as any).localStorage === 'undefined' || bad((window as any).localStorage.setItem)) {
      (window as any).localStorage = {
        _store: {} as Record<string, string>,
        getItem: function (k: string) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
        setItem: function (k: string, v: string) { this._store[k] = String(v); },
        removeItem: function (k: string) { delete this._store[k]; },
        clear: function () { for (const k of Object.keys(this._store)) delete this._store[k]; },
        key: function (i: number) { return Object.keys(this._store)[i] || null; },
        get length() { return Object.keys(this._store).length; },
      } as any;
    }
  }
  if (typeof (window as any).speechSynthesis === 'undefined') {
    (window as any).speechSynthesis = { getVoices: () => [], onvoiceschanged: undefined } as any;
  }
});

describe('Settings Panel pill open/close', () => {
  it('User Info pill opens and closes immediately', async () => {
    const { default: SettingsPanel } = await import('../SettingsPanel');
    const r = render(
      <ThemeProvider>
        <SettingsPanel user={{ username: 'test', email: 'a@b.c', usernameChangeCount: 0 }} />
      </ThemeProvider>,
    );
    const btn = r.getByTestId('pill-button-user');
    expect(btn).toBeTruthy();
  fireEvent.click(btn);
  expect(r.getByTestId('pill-user-content')).toBeTruthy();
  // Re-query the button after opening to ensure we target the current element
  fireEvent.click(r.getByTestId('pill-button-user'));
  await waitFor(() => expect(r.queryByTestId('pill-user-content')).toBeNull());
  });

  it('Calibration pill opens and closes immediately', async () => {
    const { default: SettingsPanel } = await import('../SettingsPanel');
    const r = render(
      <ThemeProvider>
        <SettingsPanel user={{ username: 'test', email: 'a@b.c', usernameChangeCount: 0 }} />
      </ThemeProvider>,
    );
    const btn = r.getByTestId('pill-button-calibration');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(r.getByTestId('pill-calibration-content')).toBeTruthy();
  // Simulate the full pointer/mouse sequence to ensure event ordering
  fireEvent.pointerDown(btn);
  fireEvent.mouseDown(btn);
  // The DOM may re-render the button on open, so re-query to get a current ref
  fireEvent.click(r.getByTestId('pill-button-calibration'));
  await waitFor(() => expect(r.queryByTestId('pill-calibration-content')).toBeNull());
  });

  it('Settings pill opens and closes immediately', async () => {
    const { default: SettingsPanel } = await import('../SettingsPanel');
    const r = render(
      <ThemeProvider>
        <SettingsPanel user={{ username: 'test', email: 'a@b.c', usernameChangeCount: 0 }} />
      </ThemeProvider>,
    );
    const btn = r.getByTestId('pill-button-settings');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(r.getByTestId('pill-settings-content')).toBeTruthy();
  // Re-query the button after opening (DOM may have been re-rendered)
  const closeBtn = r.getByTestId('pill-button-settings');
  fireEvent.pointerDown(closeBtn);
  fireEvent.mouseDown(closeBtn);
  fireEvent.click(closeBtn);
  await waitFor(() => expect(r.queryByTestId('pill-settings-content')).toBeNull());
  });
});
