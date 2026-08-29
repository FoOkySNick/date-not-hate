import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import { isValidVapidPublicKey } from '../push-notifications.js';

describe('isValidVapidPublicKey', () => {
  it('accepts a generated VAPID public key', () => {
    expect(isValidVapidPublicKey(webpush.generateVAPIDKeys().publicKey)).toBe(true);
  });

  it('rejects an invalid VAPID public key', () => {
    expect(isValidVapidPublicKey('not-a-vapid-key')).toBe(false);
  });
});
