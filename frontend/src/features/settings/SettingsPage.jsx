import { NavLink, Navigate, useParams } from 'react-router';
import { Bell, Cloud, Database, GitBranch, Hammer, HardDriveDownload, Server, Shield, Ship } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { cn } from '@/lib/utils';
import ServersSection from '@/features/settings/ServersSection';
import NotificationsSection from '@/features/settings/NotificationsSection';
import BuildProjectsSection from '@/features/settings/BuildProjectsSection';
import FlywaySection from '@/features/settings/FlywaySection';
import CapRoverSection from '@/features/settings/CapRoverSection';
import GitLabSection from '@/features/settings/GitLabSection';
import AwsSection from '@/features/settings/AwsSection';
import VpnSection from '@/features/settings/VpnSection';
import BackupSection from '@/features/settings/BackupSection';

export const SECTIONS = [
  { id: 'servers', label: 'Servers', icon: Server, Component: ServersSection },
  { id: 'notifications', label: 'Notifications', icon: Bell, Component: NotificationsSection },
  { id: 'build-projects', label: 'Build projects', icon: Hammer, Component: BuildProjectsSection },
  { id: 'flyway', label: 'Flyway', icon: Database, Component: FlywaySection },
  { id: 'caprover', label: 'CapRover', icon: Ship, Component: CapRoverSection },
  { id: 'gitlab', label: 'GitLab', icon: GitBranch, Component: GitLabSection },
  { id: 'aws', label: 'AWS', icon: Cloud, Component: AwsSection },
  { id: 'vpn', label: 'FortiVPN', icon: Shield, Component: VpnSection },
  { id: 'backup', label: 'Backup & restore', icon: HardDriveDownload, Component: BackupSection },
];

const linkClass = ({ isActive }) =>
  cn(
    'flex shrink-0 items-center gap-2 rounded-md px-3 text-[13px] whitespace-nowrap',
    'h-10 lg:px-2',
    isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export default function SettingsPage() {
  const { section } = useParams();
  const current = SECTIONS.find((s) => s.id === section);
  if (!current) return <Navigate to="/settings/servers" replace />;
  const { Component } = current;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav aria-label="Settings sections" className="border-b bg-card lg:w-52 lg:shrink-0 lg:border-r lg:border-b-0">
          {/* Phones/tablets: one scrollable row. Desktop: a column. */}
          <ul className="flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-0 lg:flex-col lg:overflow-visible lg:p-3">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <NavLink to={`/settings/${id}`} className={linkClass}>
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-label={current.label} className="min-w-0 flex-1 px-4 pt-4 lg:px-6 lg:pt-6">
          <div className="mx-auto max-w-4xl pb-6">
            <Component key={current.id} />
          </div>
        </section>
      </div>
    </div>
  );
}
