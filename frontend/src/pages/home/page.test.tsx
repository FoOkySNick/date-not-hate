// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import App from './page';
import { homeService } from './page.service';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); homeService.logout(); });

describe('authentication screen', () => {
  it('offers login and registration to a signed-out visitor', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Регистрация' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Не помню пароль' })).toBeTruthy();
  });
});

describe('date type settings', () => {
  it('reveals a delete action after swiping a type to the left', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({
      id: 'space-1', name: 'Мы', members: [{ id: 'user-1', name: 'Аня', email: 'anya@example.com', role: 'admin' }],
      dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }]
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Мы' }));
    const type = screen.getByText('🎬 Кино');
    fireEvent.touchStart(type, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(type, { changedTouches: [{ clientX: 120 }] });

    expect(screen.getByRole('button', { name: 'Удалить тип «Кино»' })).toBeTruthy();
  });

  it('does not offer deletion to a member without administrator rights', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({
      id: 'space-1', name: 'Мы', members: [{ id: 'user-1', name: 'Аня', email: 'anya@example.com', role: 'member' }],
      dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }]
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Мы' }));

    expect(screen.queryByRole('button', { name: 'Удалить тип «Кино»' })).toBeNull();
  });
});

describe('notifications', () => {
  it('uses an accessible bell icon as the notification trigger', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });

    render(<App />);

    const trigger = screen.getByRole('button', { name: 'Уведомления' });
    expect(trigger.querySelector('svg')).toBeTruthy();
  });
});
