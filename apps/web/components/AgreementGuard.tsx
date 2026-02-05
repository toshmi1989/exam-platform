'use client';

import { useEffect, useState, useCallback } from 'react';
import { readTelegramUser } from '../lib/telegramUser';
import { getProfile } from '../lib/api';
import type { UserProfile } from '../lib/types';
import { hasGuestAcceptedAgreement } from '../lib/agreementStorage';
import AgreementModal from './AgreementModal';

interface AgreementGuardProps {
  children: React.ReactNode;
}

function hasTelegramUser(): boolean {
  if (typeof window === 'undefined') return false;
  return !!readTelegramUser()?.telegramId;
}

export default function AgreementGuard({ children }: AgreementGuardProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(hasTelegramUser);
  const [showModal, setShowModal] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  const checkAgreement = useCallback(async () => {
    const user = readTelegramUser();
    if (!user?.telegramId) {
      setProfile(null);
      setIsGuest(true);
      setLoading(false);
      setShowModal(!hasGuestAcceptedAgreement());
      return;
    }
    setIsGuest(false);
    setLoading(true);
    try {
      const data = await getProfile();
      setProfile(data);
      if (data.acceptedTerms !== true) {
        setShowModal(true);
      } else {
        setShowModal(false);
      }
    } catch {
      setProfile(null);
      setShowModal(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAgreement();
  }, [checkAgreement]);

  const handleAccepted = useCallback(() => {
    setShowModal(false);
    setProfile((prev) => (prev ? { ...prev, acceptedTerms: true } : null));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Загрузка…
      </div>
    );
  }

  if (showModal) {
    return <AgreementModal onAccepted={handleAccepted} isGuest={isGuest} />;
  }

  return <>{children}</>;
}
