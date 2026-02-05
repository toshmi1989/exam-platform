import './globals.css';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import UiSettingsBootstrap from '../components/UiSettingsBootstrap';
import AgreementGuard from '../components/AgreementGuard';
export const metadata: Metadata = {
  title: 'CalmExam',
  description: 'A calm, Telegram-first exam platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <UiSettingsBootstrap />
        <AgreementGuard>
          <main className="relative mx-auto w-full max-w-3xl px-4 py-8 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+4rem)]">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-6 bg-gradient-to-b from-white/95 to-white/0 backdrop-blur-sm" />
            {children}
          </main>
        </AgreementGuard>
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 h-10 bg-gradient-to-t from-white/95 to-white/0 backdrop-blur-sm" />
      </body>
    </html>
  );
}
