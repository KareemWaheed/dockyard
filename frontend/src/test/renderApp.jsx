import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders } from '@/app/AppProviders';
import { routes as appRoutes } from '@/app/router';

export function renderApp(path = '/', { routes = appRoutes, queryClient } = {}) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient: client };
}
