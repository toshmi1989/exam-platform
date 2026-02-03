import { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export default function Section({ title, description, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-4">
      {title ? (
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="text-sm text-slate-600">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
