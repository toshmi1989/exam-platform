import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/categories', label: 'Categories' },
  { href: '/cabinet', label: 'Cabinet' },
];

export default function SiteHeader() {
  return (
    <div className="border-b border-slate-100 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="text-base font-semibold text-slate-900">
          CalmExam
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-2 py-1 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
