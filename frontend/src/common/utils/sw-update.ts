type ActivationEvent = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type ServiceWorkerScope = {
  skipWaiting: () => void | Promise<void>;
  clients: { claim: () => Promise<void> };
  addEventListener: (type: 'activate', listener: (event: ActivationEvent) => void) => void;
};

export const activateUpdateImmediately = (scope: ServiceWorkerScope) => {
  void scope.skipWaiting();
  scope.addEventListener('activate', (event) => event.waitUntil(scope.clients.claim()));
};
