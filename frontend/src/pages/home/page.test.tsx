// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('profile menu', () => {
  it('opens a logout menu instead of ending the session from the avatar click', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'А' }));

    expect(screen.getByText('anya@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeTruthy();
    expect(screen.getByText('Давайте придумаем что-то хорошее')).toBeTruthy();
  });
});

describe('date details', () => {
  const setup = () => {
    window.history.replaceState({}, '', '/');
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });
    homeService.dates$.next([{ id: 'date-1', title: 'Кино', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино или театр', emoji: '🎬', photos: [] }]);
  };

  it('opens details for a planned date even when exact time is missing', () => {
    setup();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Кино' }));

    expect(screen.getByRole('dialog', { name: 'Детали свидания' })).toBeTruthy();
    expect(screen.getByText('Точное время ещё не назначено')).toBeTruthy();
  });

  it('opens the linked date after reading a notification', async () => {
    setup();
    vi.spyOn(homeService, 'readNotification').mockResolvedValue();
    homeService.notifications$.next([{ id: 'notice-1', body: 'Партнёр добавил детали', dateId: 'date-1', createdAt: '2026-09-02T12:00:00.000Z', readAt: null }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Уведомления' }));
    fireEvent.click(screen.getByRole('button', { name: /Партнёр добавил детали/ }));

    await waitFor(() => expect(homeService.readNotification).toHaveBeenCalledWith('notice-1'));
    expect(screen.getByRole('dialog', { name: 'Детали свидания' })).toBeTruthy();
  });

  it('opens the appointment form for the partner who will organise the date', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'partner-1', name: 'Игорь', email: 'igor@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });
    homeService.dates$.next([{ id: 'date-1', title: 'Кино', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'partner', createdBy: 'author-1', organizerComment: null, status: 'planned', typeTitle: 'Кино или театр', emoji: '🎬', photos: [] }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Кино' }));

    expect(screen.getByRole('dialog', { name: 'Детали свидания' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Назначить точное время' })).toBeTruthy();
  });

  it('opens details when the date emoji is clicked', () => {
    setup();

    render(<App />);
    fireEvent.click(document.querySelector('.date-card .date-emoji')!);

    expect(screen.getByRole('dialog', { name: 'Детали свидания' })).toBeTruthy();
  });

  it('opens a completed date from memories and shows its photos in details', () => {
    setup();
    homeService.dates$.next([{ id: 'memory-1', title: 'Ужин дома', startsAt: '2026-08-31T15:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', createdBy: 'user-1', organizerComment: 'Получился очень тёплый вечер.', status: 'completed', typeTitle: 'Ужин', emoji: '🍝', photos: [{ id: 'photo-1', filename: 'dinner.jpg' }] }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Воспоминания' }));
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Ужин дома' }));

    const dialog = screen.getByRole('dialog', { name: 'Детали свидания' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: 'Воспоминание со свидания' }).getAttribute('src')).toBe('/photos/dinner.jpg');
    expect(within(dialog).getByRole('button', { name: 'Добавить фото' })).toBeTruthy();
  });
});
