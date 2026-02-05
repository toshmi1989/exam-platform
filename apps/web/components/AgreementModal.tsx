'use client';

import { useState, useCallback, useEffect } from 'react';
import Button from './Button';
import { USER_AGREEMENT_TEXT } from '../data/agreementText';
import { acceptAgreement } from '../lib/api';
import { setGuestAgreement } from '../lib/agreementStorage';

const CHECKBOX_LABEL = 'Я принимаю условия пользовательского соглашения';
const SUBMIT_LABEL = 'Продолжить';

interface AgreementModalProps {
  onAccepted: () => void;
  /** Гость без авторизации: соглашение сохраняется только в localStorage */
  isGuest?: boolean;
}

export default function AgreementModal({ onAccepted, isGuest = false }: AgreementModalProps) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!checked || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (isGuest) {
        setGuestAgreement();
        onAccepted();
      } else {
        await acceptAgreement();
        onAccepted();
      }
    } catch (err: unknown) {
      const apiErr = err as { reasonCode?: string; message?: string };
      if (apiErr?.reasonCode === 'AUTH_REQUIRED') {
        setError('Сессия истекла. Откройте приложение заново или войдите снова.');
      } else if (apiErr?.reasonCode === 'PROXY_ERROR' && apiErr?.message) {
        setError(apiErr.message);
      } else {
        setError(apiErr?.message ?? 'Не удалось сохранить. Попробуйте снова.');
      }
    } finally {
      setLoading(false);
    }
  }, [checked, loading, onAccepted, isGuest]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-title"
      style={{ touchAction: 'none' }}
    >
      <div className="flex flex-1 flex-col overflow-hidden p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 id="agreement-title" className="sr-only">
          Пользовательское соглашение
        </h1>
        <div className="mb-3 flex-shrink-0 text-center text-lg font-semibold text-slate-800">
          Пользовательское соглашение
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
          {USER_AGREEMENT_TEXT}
        </div>
        <div className="mt-4 flex flex-shrink-0 flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              aria-label={CHECKBOX_LABEL}
            />
            <span className="text-sm text-slate-700">{CHECKBOX_LABEL}</span>
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            disabled={!checked || loading}
            onClick={handleSubmit}
          >
            {loading ? 'Сохранение…' : SUBMIT_LABEL}
          </Button>
        </div>
      </div>
    </div>
  );
}
