'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Redirect to new unified exam selection page
export default function MyExamsFlowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const access = searchParams.get('access');
    const params = access === 'one-time' ? '?access=one-time' : '';
    router.replace(`/exam/select${params}`);
  }, [router, searchParams]);
  
  return null;
}
