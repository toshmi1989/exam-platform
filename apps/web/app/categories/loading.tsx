import Card from '../../components/Card';

export default function CategoriesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-6 w-40 rounded-full bg-slate-200" />
      <div className="h-4 w-64 rounded-full bg-slate-100" />
      <Card>
        <div className="space-y-3">
          <div className="h-14 rounded-xl bg-slate-100" />
          <div className="h-14 rounded-xl bg-slate-100" />
        </div>
      </Card>
    </div>
  );
}
