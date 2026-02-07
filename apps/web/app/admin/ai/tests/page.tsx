'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAITestsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/ai?tab=test');
  }, [router]);
  return null;
}
