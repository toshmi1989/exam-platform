'use client';

import { useCallback, useRef, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import { apiFetch } from '../../../lib/api/client';

type CommandId =
  | 'status'
  | 'restart-api'
  | 'restart-web'
  | 'restart-bot'
  | 'load'
  | 'memory'
  | 'disk'
  | 'network'
  | 'recent-api-errors'
  | 'recent-web-errors'
  | 'uptime'
  | 'clear-logs';

interface CommandSpec {
  id: CommandId;
  label: string;
  icon: string;
  method: 'GET' | 'POST';
  path: string;
}

const COMMANDS: CommandSpec[] = [
  { id: 'status', label: 'Status', icon: '🟢', method: 'GET', path: '/admin/server/status' },
  { id: 'restart-api', label: 'Restart API', icon: '🔄', method: 'POST', path: '/admin/server/restart-api' },
  { id: 'restart-web', label: 'Restart WEB', icon: '🔄', method: 'POST', path: '/admin/server/restart-web' },
  { id: 'restart-bot', label: 'Restart BOT', icon: '🔄', method: 'POST', path: '/admin/server/restart-bot' },
  { id: 'load', label: 'Load', icon: '📈', method: 'GET', path: '/admin/server/load' },
  { id: 'memory', label: 'Memory', icon: '🧠', method: 'GET', path: '/admin/server/memory' },
  { id: 'disk', label: 'Disk', icon: '💾', method: 'GET', path: '/admin/server/disk' },
  { id: 'network', label: 'Network', icon: '🌐', method: 'GET', path: '/admin/server/network' },
  { id: 'recent-api-errors', label: 'API Errors', icon: '📄', method: 'GET', path: '/admin/server/recent-api-errors' },
  { id: 'recent-web-errors', label: 'WEB Errors', icon: '📄', method: 'GET', path: '/admin/server/recent-web-errors' },
  { id: 'uptime', label: 'Uptime', icon: '⏱', method: 'GET', path: '/admin/server/uptime' },
  { id: 'clear-logs', label: 'Clear Logs', icon: '🧹', method: 'POST', path: '/admin/server/clear-logs' },
];

interface Block {
  ts: string;   // "19:44:02"
  title: string;
  output: string;
}

const MAX_TERMINAL_LINES = 200;

function formatTime(): string {
  const d = new Date();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function blockToLines(block: Block): number {
  return 2 + (block.output.match(/\n/g)?.length ?? 0) + 1; // [ts]\n------\noutput
}

export default function AdminServerPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const runCommand = useCallback(async (spec: CommandSpec) => {
    setLoading(spec.id);
    try {
      const { response, data } = await apiFetch(spec.path, {
        method: spec.method,
        timeoutMs: 15000,
      });
      const title = (data && typeof data === 'object' && 'title' in data && typeof (data as { title: string }).title === 'string')
        ? (data as { title: string }).title
        : spec.label;
      const output = (data && typeof data === 'object' && 'output' in data && typeof (data as { output: string }).output === 'string')
        ? (data as { output: string }).output
        : (response.ok ? '' : `HTTP ${response.status}`);
      setBlocks((prev) => {
        const next = [...prev, { ts: formatTime(), title, output }];
        let total = 0;
        let i = next.length - 1;
        while (i >= 0 && total + blockToLines(next[i]) <= MAX_TERMINAL_LINES) {
          total += blockToLines(next[i]);
          i--;
        }
        if (i >= 0) return next.slice(i + 1);
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBlocks((prev) => {
        const next = [...prev, { ts: formatTime(), title: spec.label, output: `Error: ${msg}` }];
        let total = 0;
        let i = next.length - 1;
        while (i >= 0 && total + blockToLines(next[i]) <= MAX_TERMINAL_LINES) {
          total += blockToLines(next[i]);
          i--;
        }
        if (i >= 0) return next.slice(i + 1);
        return next;
      });
    } finally {
      setLoading(null);
      setTimeout(() => terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' }), 50);
    }
  }, []);

  const clearScreen = useCallback(() => {
    setBlocks([]);
  }, []);

  return (
    <AdminGuard>
      <AnimatedPage>
        <PageHeader title="Server console" />
        <AdminNav />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr]">
          <Card className="flex flex-col gap-2 p-2">
            {COMMANDS.map((spec) => (
              <button
                key={spec.id}
                type="button"
                disabled={loading !== null}
                onClick={() => runCommand(spec)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <span>{spec.icon}</span>
                <span>{spec.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={clearScreen}
              className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span>🧹</span>
                <span>Clear Screen</span>
            </button>
          </Card>
          <Card className="flex min-h-[420px] flex-col overflow-hidden p-0">
            <div
              ref={terminalRef}
              className="terminal flex-1 overflow-auto bg-[#0d1117] p-4 font-mono text-sm text-[#3fb950]"
              style={{ minHeight: '400px' }}
            >
              {blocks.length === 0 && (
                <div className="text-slate-500">
                  Click a button to run a command. Output will appear here.
                </div>
              )}
              {blocks.map((b, i) => (
                <div key={i} className="mb-3">
                  <div className="text-slate-400">[{b.ts}] {b.title}</div>
                  <div className="text-slate-500">----------------------</div>
                  <pre className="mt-0.5 whitespace-pre-wrap break-words text-[#3fb950]">
                    {b.output || '(no output)'}
                  </pre>
                </div>
              ))}
              {loading && (
                <div className="text-slate-400">
                  Running &quot;{COMMANDS.find((c) => c.id === loading)?.label ?? loading}&quot;…
                </div>
              )}
            </div>
          </Card>
        </div>
      </AnimatedPage>
    </AdminGuard>
  );
}
