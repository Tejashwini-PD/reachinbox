import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const errorMessages: Record<string, string> = {
  invalid_state: 'The sign-in request expired or the OAuth state was invalid. Please try again.',
  google_denied: 'Google sign-in was cancelled.',
  google_oauth_failed: 'Google sign-in failed. Check the backend OAuth configuration.',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { user, config, loading, loginWithGoogle } = useAuth();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const googleDisabled = Boolean(config && !config.googleConfigured);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Mail className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[15px] font-bold leading-tight tracking-tight text-ink">
              ReachInbox
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Outbox scheduler
            </span>
          </span>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-black/[0.07] bg-white px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
          Secure Google OAuth
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-black/[0.06] bg-white shadow-soft lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden overflow-hidden bg-brand-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 15% 10%, rgba(123,217,171,0.55), transparent 32%), radial-gradient(circle at 85% 75%, rgba(65,193,132,0.45), transparent 38%)',
              }}
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
                <Sparkles className="h-3.5 w-3.5" />
                Reliable email scheduling
              </span>
              <h1 className="mt-6 max-w-md text-4xl font-bold leading-[1.1] tracking-tight">
                Schedule batches without losing a single email.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100/80">
                Persistent BullMQ jobs, Redis-backed rate limits, real SMTP delivery and an honest
                delivery dashboard.
              </p>
            </div>

            <ul className="relative mt-10 space-y-3 text-sm text-brand-50/90">
              {[
                'No cron jobs — delayed queues only',
                'Per-sender hourly limits and spacing',
                'Survives API, worker and Redis restarts',
                'Searchable history with Elasticsearch',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-300" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="p-6 sm:p-10">
            <div className="mx-auto max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">
                Welcome back
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
                Sign in to your dashboard
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                This scheduler uses real Google OAuth. There is no password login.
              </p>

              {error && (
                <div className="mt-5 rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                  {errorMessages[error] ?? 'Sign-in failed. Please try again.'}
                </div>
              )}

              {googleDisabled && (
                <div className="mt-5 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
                  Google OAuth is not configured on the backend. Set{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">GOOGLE_CLIENT_ID</code> and{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">GOOGLE_CLIENT_SECRET</code> in{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">backend/.env</code>, then
                  restart the API.
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <label className="label" htmlFor="login-email">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    className="input"
                    placeholder="you@company.com"
                    disabled
                    aria-describedby="login-note"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="login-password">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    disabled
                  />
                </div>
              </div>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-black/[0.07]" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Google OAuth only
                </span>
                <span className="h-px flex-1 bg-black/[0.07]" />
              </div>

              <button
                type="button"
                className="btn-primary w-full py-3"
                onClick={loginWithGoogle}
                disabled={loading || googleDisabled}
              >
                <GoogleMark />
                Continue with Google
                <ArrowRight className="h-4 w-4" />
              </button>

              <p id="login-note" className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
                Sessions are stored in Redis and delivered through an HTTP-only cookie.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="px-5 pb-6 text-center text-[11px] text-slate-400 sm:px-8">
        ReachInbox email scheduler · React + Express + BullMQ
      </footer>
    </div>
  );
}
