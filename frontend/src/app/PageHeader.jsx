export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
