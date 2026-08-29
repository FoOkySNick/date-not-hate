// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import App from './page';

afterEach(() => { cleanup(); localStorage.clear(); });

describe('authentication screen', () => {
  it('offers login and registration to a signed-out visitor', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Регистрация' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Не помню пароль' })).toBeTruthy();
  });
});
