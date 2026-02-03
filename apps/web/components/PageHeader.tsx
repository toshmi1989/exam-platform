interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="space-y-2 pt-4">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-base text-slate-600">{subtitle}</p>
      ) : null}
    </header>
  );
}
