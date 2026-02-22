import OralExamClient from './components/OralExamClient';

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function OralSessionPage({ params }: PageProps) {
  const { examId } = await params;
  return <OralExamClient examId={examId} />;
}
