import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { routes } from './app/router';
import { AppProviders } from './app/AppProviders';
import { PwaUpdater } from './app/PwaUpdater';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
const router = createBrowserRouter(routes);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
      <PwaUpdater />
    </AppProviders>
  </React.StrictMode>,
);
