import { Link } from 'react-router';
import AppLayout from '@/app/AppLayout';
import OverviewPage from '@/features/overview/OverviewPage';
import EnvPage from '@/features/env/EnvPage';
import BuildsPage, { BuildsIndex } from '@/features/builds/BuildsPage';
import MigrationsPage from '@/features/migrations/MigrationsPage';
import HistoryPage from '@/features/history/HistoryPage';
import SettingsPage from '@/features/settings/SettingsPage';

function NotFound() {
  return (
    <div className="p-10 text-center">
      <p className="mb-2 text-[15px] font-semibold">Page not found</p>
      <Link className="text-primary underline" to="/">Back to Overview</Link>
    </div>
  );
}

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'env/:env', element: <EnvPage /> },
      { path: 'env/:env/:container', element: <EnvPage /> },
      { path: 'builds', element: <BuildsIndex /> },
      { path: 'builds/:project', element: <BuildsPage /> },
      { path: 'builds/:project/:num', element: <BuildsPage /> },
      { path: 'migrations', element: <MigrationsPage /> },
      { path: 'migrations/:runId', element: <MigrationsPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
