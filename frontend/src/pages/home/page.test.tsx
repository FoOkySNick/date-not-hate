// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import App from './page';
import { homeService } from './page.service';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); homeService.logout(); });

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

describe('date creation', () => {
  it('sorts plans by the nearest possible deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00'));
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });
    homeService.dates$.next([
      { id: 'next-month', title: 'Следующий месяц', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: 'next_month', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'month', title: 'Этот месяц', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: 'this_month', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'month-date', title: 'Дата в месяце', startsAt: '2026-09-25T17:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: null, createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'week', title: 'Эта неделя', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: 'this_week', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'week-date', title: 'Дата на неделе', startsAt: '2026-09-04T17:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: null, createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'today', title: 'Сегодня', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: 'today', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] },
      { id: 'today-date', title: 'Дата сегодня', startsAt: '2026-09-03T16:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: null, createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] }
    ]);

    render(<App />);

    expect(Array.from(document.querySelectorAll('.date-card h3')).map(item => item.textContent)).toEqual(['Дата сегодня', 'Сегодня', 'Дата на неделе', 'Эта неделя', 'Дата в месяце', 'Этот месяц', 'Следующий месяц']);
  });

  it('does not send a previously entered date when creating an idea', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'idea-2', title: 'Вечернее кино', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'self', requestedWindow: 'idea', createdBy: 'user-1', organizerComment: null, status: 'planned', typeTitle: 'Кино', emoji: '🎬', photos: [] }), { status: 201, headers: { 'Content-Type': 'application/json' } })));
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }] });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Позвать на свидание/ }));
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Это просто идея' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(init!.body as string)).toMatchObject({ startsAt: null, requestedWindow: 'idea' });
  });

  it('clears exact date fields after switching through the idea mode', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }] });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Позвать на свидание/ }));
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Это просто идея' }));
    fireEvent.click(screen.getByRole('button', { name: 'Это просто идея' }));

    expect((screen.getByLabelText('Дата') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Время') as HTMLInputElement).value).toBe('');
  });

  it('puts the idea bank before plans in navigation', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });

    render(<App />);

    expect(screen.getAllByRole('navigation')[0].textContent).toBe('Банк идейПланыВоспоминанияМы');
  });

  it('closes the form and shows a new date before the background refresh completes', async () => {
    const created = { id: 'date-2', title: 'Вечернее кино', startsAt: '2026-09-10T16:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self' as const, requestedWindow: null, createdBy: 'user-1', organizerComment: null, status: 'planned' as const, typeTitle: 'Кино', emoji: '🎬', photos: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201, headers: { 'Content-Type': 'application/json' } })));
    vi.spyOn(homeService, 'refresh').mockResolvedValueOnce().mockImplementationOnce(() => new Promise<void>(() => {}));
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }] });
    homeService.dates$.next([]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Позвать на свидание/ }));
    fireEvent.change(screen.getByLabelText('Можно назвать по-своему'), { target: { value: 'Вечернее кино' } });
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '21:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить приглашение' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Отправить приглашение' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Открыть детали: Вечернее кино' })).toBeTruthy();
  });

  it('shows the requested-period choices when the partner will organise the date', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [{ id: 'type-1', title: 'Кино', emoji: '🎬', enabled: true }] });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Позвать на свидание/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Партнёр/ }));

    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'На этой неделе' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'В этом месяце' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'В следующем месяце' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Это просто идея' })).toBeTruthy();
  });

  it('lets either partner organise an idea from the idea bank', () => {
    vi.spyOn(homeService, 'refresh').mockResolvedValue();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
    homeService.session$.next({ user: { id: 'user-1', name: 'Аня', email: 'anya@example.com' }, space: { id: 'space-1', name: 'Мы' }, token: 'token' });
    homeService.space$.next({ id: 'space-1', name: 'Мы', members: [], dateTypes: [] });
    homeService.dates$.next([{ id: 'idea-1', title: 'Съездить за город', startsAt: null, eventDate: null, isAllDay: false, organizerMode: 'partner', requestedWindow: 'idea', createdBy: 'partner-1', organizerComment: null, status: 'planned', typeTitle: 'Новое впечатление', emoji: '✨', photos: [] }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Банк идей' }));

    expect(screen.getByText('Съездить за город')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Организовать' })).toBeTruthy();
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

  it('opens a full-size photo preview with a download action', () => {
    setup();
    homeService.dates$.next([{ id: 'memory-1', title: 'Ужин дома', startsAt: '2026-08-31T15:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', createdBy: 'user-1', organizerComment: null, status: 'completed', typeTitle: 'Ужин', emoji: '🍝', photos: [{ id: 'photo-1', filename: 'dinner.jpg' }] }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Воспоминания' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть детали: Ужин дома' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Детали свидания' })).getByRole('button', { name: 'Открыть фото: dinner.jpg' }));

    const preview = screen.getByRole('dialog', { name: 'Просмотр фотографии' });
    expect(within(preview).getByRole('img', { name: 'Воспоминание со свидания' }).getAttribute('src')).toBe('/photos/dinner.jpg');
    expect(within(preview).getByRole('link', { name: 'Скачать фото' }).getAttribute('download')).toBe('');
  });

  it('opens the photo preview from a memory card', () => {
    setup();
    homeService.dates$.next([{ id: 'memory-1', title: 'Ужин дома', startsAt: '2026-08-31T15:00:00.000Z', eventDate: null, isAllDay: false, organizerMode: 'self', createdBy: 'user-1', organizerComment: null, status: 'completed', typeTitle: 'Ужин', emoji: '🍝', photos: [{ id: 'photo-1', filename: 'dinner.jpg' }] }]);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Воспоминания' }));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть фото: dinner.jpg' }));

    expect(screen.getByRole('dialog', { name: 'Просмотр фотографии' })).toBeTruthy();
  });
});
