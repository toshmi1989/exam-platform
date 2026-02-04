'use client';

import { Suspense } from 'react';
import MyExamsFlowPage from '../my-exams/page';

export const dynamic = 'force-dynamic';

export default function ExamsPage() {
  return (
    <Suspense fallback={null}>
      <MyExamsFlowPage />
    </Suspense>
  );
}
