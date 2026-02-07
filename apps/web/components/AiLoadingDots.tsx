'use client';

/**
 * Loading state while AI (Ziyoda) is generating answer/explanation.
 * Animated dots so the user sees that the app is working, not frozen.
 */
export default function AiLoadingDots({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600" role="status" aria-live="polite">
      <span className="inline-flex gap-0.5">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#2AABEE] animate-[bounce_0.6s_ease-in-out_infinite]"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#2AABEE] animate-[bounce_0.6s_ease-in-out_infinite]"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[#2AABEE] animate-[bounce_0.6s_ease-in-out_infinite]"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span>{text}</span>
    </div>
  );
}
