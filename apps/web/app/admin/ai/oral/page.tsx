'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAIOralRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/ai?tab=oral');
  }, [router]);
  return null;
}
