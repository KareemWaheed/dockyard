import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders } from '@/app/AppProviders';

// Renders one component with the app providers and a memory router (for Link/useParams).
export function renderWithProviders(ui, { path = '/', routePath = '*', queryClient } = {}) {
  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: routePath, element: ui }, { path: '*', element: <div data-testid="elsewhere" /> }], { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient: client };
}
