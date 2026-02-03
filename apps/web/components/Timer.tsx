interface TimerProps {
  label?: string;
  remainingSeconds?: number;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function Timer({ label = 'Time', remainingSeconds }: TimerProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="mr-2 font-semibold">{label}:</span>
      <span>
        {typeof remainingSeconds === 'number'
          ? formatSeconds(remainingSeconds)
          : '--:--'}
      </span>
    </div>
  );
}
