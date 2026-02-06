'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Redirect to new unified exam selection page
function MyExamsFlowClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const access = searchParams.get('access');
    const params = access === 'one-time' ? '?access=one-time' : '';
    router.replace(`/exam/select${params}`);
  }, [router, searchParams]);
  
  return null;
}

export default function MyExamsFlowPage() {
  return (
    <Suspense fallback={null}>
      <MyExamsFlowClient />
    </Suspense>
  );
}
