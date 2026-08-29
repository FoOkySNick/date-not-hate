const invalidKey = () => new Error('Push-ключ сервера имеет неверный формат. Обновите приложение и попробуйте ещё раз.');

export const vapidPublicKeyToBytes = (publicKey: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(publicKey)) throw invalidKey();
  try {
    const bytes = Uint8Array.from(
      atob(publicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(publicKey.length / 4) * 4, '=')),
      character => character.charCodeAt(0)
    );
    if (bytes.length !== 65 || bytes[0] !== 4) throw invalidKey();
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Push-ключ сервера')) throw error;
    throw invalidKey();
  }
};

export const isSameVapidPublicKey = (actualKey: ArrayBufferLike | ArrayBufferView | null, expectedKey: Uint8Array) => {
  if (!actualKey) return false;
  const actualBytes = ArrayBuffer.isView(actualKey)
    ? new Uint8Array(actualKey.buffer, actualKey.byteOffset, actualKey.byteLength)
    : new Uint8Array(actualKey);
  return actualBytes.length === expectedKey.length && actualBytes.every((value, index) => value === expectedKey[index]);
};
