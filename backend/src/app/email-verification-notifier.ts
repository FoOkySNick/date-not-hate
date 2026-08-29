export const sendVerificationEmail = async (send: () => Promise<void>, reportFailure: (message: string, error: unknown) => void = console.error) => {
  try {
    await send();
  } catch (error) {
    reportFailure('Unable to send verification email', error);
  }
};
