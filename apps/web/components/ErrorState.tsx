import Button from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again later.',
  actionLabel,
  onAction,
}: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 text-sm text-slate-700 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onAction} size="md">
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
