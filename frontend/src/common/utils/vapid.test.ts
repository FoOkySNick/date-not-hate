import { describe, expect, it } from 'vitest';
import { isSameVapidPublicKey, vapidPublicKeyToBytes } from './vapid';

describe('vapidPublicKeyToBytes', () => {
  it('converts a URL-safe VAPID public key into the expected uncompressed EC point', () => {
    const publicKey = `B${'A'.repeat(86)}`;

    const result = vapidPublicKeyToBytes(publicKey);

    expect(result).toHaveLength(65);
    expect(result[0]).toBe(4);
  });

  it('rejects a malformed VAPID public key before asking the browser to subscribe', () => {
    expect(() => vapidPublicKeyToBytes('not-a-vapid-key')).toThrow('Push-ключ сервера имеет неверный формат.');
  });

  it('detects a subscription created with another VAPID public key', () => {
    const expected = vapidPublicKeyToBytes(`B${'A'.repeat(86)}`);
    const different = vapidPublicKeyToBytes(`B${'B'.repeat(86)}`);

    expect(isSameVapidPublicKey(expected.buffer, expected)).toBe(true);
    expect(isSameVapidPublicKey(different.buffer, expected)).toBe(false);
    expect(isSameVapidPublicKey(null, expected)).toBe(false);
  });
});
