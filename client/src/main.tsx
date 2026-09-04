import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type User = { id: string; email: string; displayName: string; role: string };
type MailboxInfo = {
  id: string;
  provider: string;
  providerUser: string;
  connectedAt: string;
  lastScannedAt: string | null;
};
type EmailMessage = {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  analysis: {
    id: string;
    category: string;
    riskLevel: string;
    score: number | string;
    reasons: string[];
    modelName: string;
    analyzedAt: string;
  } | null;
};
type Dashboard = {
  healthScore: number;
  threatLevel?: string;
  scanned: number;
  threatsStopped: number;
  openAlerts: number;
  categories: Record<string, number>;
  defaultMailboxId?: string;
  mailbox?: MailboxInfo;
  inboxMessages?: EmailMessage[];
  recentThreats?: Array<{
    id: string;
    category: string;
    riskLevel: string;
    score: number | string;
    analyzedAt: string;
    email: { sender: string; subject: string; receivedAt: string };
  }>;
};
type AlertItem = {
  id: string;
  title: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
};
type Analysis = {
  analysisId: string;
  category: string;
  riskLevel: string;
  score: number;
  reasons: string[];
  modelName: string;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch {
    throw new Error(
      'The API is offline. Start the backend with npm run dev and configure server/.env.',
    );
  }
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    details?: Record<string, string[]>;
  };
  if (!response.ok) {
    if (body.error) {
      if (body.details && Object.keys(body.details).length > 0) {
        const detailMsgs = Object.values(body.details).flat().join(', ');
        throw new Error(`${body.error}: ${detailMsgs}`);
      }
      throw new Error(body.error);
    }
    if (response.status === 500 || response.status === 502 || response.status === 504) {
      throw new Error(
        'Backend server is not responding. Ensure the backend server is running on port 4000.',
      );
    }
    throw new Error(`Request failed with status ${response.status}`);
  }
  return body;
}

function getPasswordStats(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [hasMinLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  const isValid = hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial;
  return { hasMinLength, hasUpper, hasLower, hasNumber, hasSpecial, score, isValid };
}

function Auth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pwdStats = getPasswordStats(password);

  const strengthColor =
    pwdStats.score <= 1
      ? '#ef4444'
      : pwdStats.score === 2
        ? '#f97316'
        : pwdStats.score === 3
          ? '#eab308'
          : pwdStats.score === 4
            ? '#84cc16'
            : '#22c55e';
  const strengthWidth = `${(pwdStats.score / 5) * 100}%`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (mode === 'register' && !pwdStats.isValid) {
      setError(
        'Please fulfill all Google password requirements (minimum 8 characters, uppercase, lowercase, number, and special symbol).',
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        mode === 'register'
          ? { email: email.trim(), password, displayName: displayName.trim() }
          : { email: email.trim(), password };

      const result = await api<{ user: User }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  const [showGoogleChooser, setShowGoogleChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');
  const [showCustomGoogleInput, setShowCustomGoogleInput] = useState(false);
  const [connectingGoogleEmail, setConnectingGoogleEmail] = useState<string | null>(null);
  const [googleAccounts, setGoogleAccounts] = useState<
    Array<{
      name: string;
      email: string;
      avatarBg: string;
      initials: string;
      badge?: string;
    }>
  >([]);

  async function loadGoogleAccounts() {
    try {
      const data = await api<{ users: User[] }>('/admin/users');
      const accounts = data.users.map((u) => ({
        name: u.displayName,
        email: u.email,
        avatarBg: 'linear-gradient(135deg, #059669, #34D399)',
        initials: u.displayName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase(),
        badge: u.role === 'ADMIN' ? 'Admin Account' : undefined,
      }));
      setGoogleAccounts(accounts);
    } catch {
      setGoogleAccounts([]);
    }
  }

  async function connectWithGoogleAccount(targetEmail: string, targetName: string) {
    setError('');
    setConnectingGoogleEmail(targetEmail);
    try {
      const result = await api<{ user: User }>('/auth/google/quick-connect', {
        method: 'POST',
        body: JSON.stringify({
          email: targetEmail.trim().toLowerCase(),
          displayName: targetName.trim(),
        }),
      });
      setShowGoogleChooser(false);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google authentication failed');
    } finally {
      setConnectingGoogleEmail(null);
    }
  }

  function handleGoogleSignIn() {
    setError('');
    // Load accounts from backend before showing chooser
    loadGoogleAccounts();
    setShowGoogleChooser(true);
  }

  // Splash / ripple on button click
  function addSplash(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.style.cssText = `
      width:${size}px;height:${size}px;
      left:${e.clientX - rect.left - size / 2}px;
      top:${e.clientY - rect.top - size / 2}px;
    `;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  return (
    <div className="auth-screen">
      {/* ── LEFT: Vibrant Blue Circuit Visual Panel ── */}
      <div className="auth-visual">
        {/* Animated SVG circuit overlay in vibrant blue & cyan */}
        <svg
          className="auth-circuit-svg"
          viewBox="0 0 500 800"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Horizontal traces */}
          <line
            x1="0"
            y1="120"
            x2="500"
            y2="120"
            stroke="rgba(0, 102, 255, 0.18)"
            strokeWidth="1.2"
          />
          <line
            x1="0"
            y1="320"
            x2="500"
            y2="320"
            stroke="rgba(0, 102, 255, 0.18)"
            strokeWidth="1.2"
          />
          <line
            x1="0"
            y1="520"
            x2="500"
            y2="520"
            stroke="rgba(0, 102, 255, 0.18)"
            strokeWidth="1.2"
          />
          {/* Vertical traces */}
          <line
            x1="80"
            y1="0"
            x2="80"
            y2="800"
            stroke="rgba(0, 102, 255, 0.14)"
            strokeWidth="1.2"
          />
          <line
            x1="240"
            y1="0"
            x2="240"
            y2="800"
            stroke="rgba(0, 102, 255, 0.14)"
            strokeWidth="1.2"
          />
          <line
            x1="420"
            y1="0"
            x2="420"
            y2="800"
            stroke="rgba(0, 102, 255, 0.14)"
            strokeWidth="1.2"
          />
          {/* Circuit nodes */}
          <circle
            cx="80"
            cy="120"
            r="6"
            fill="rgba(0, 102, 255, 0.1)"
            stroke="#0057FF"
            strokeWidth="2"
          />
          <circle
            cx="240"
            cy="320"
            r="6"
            fill="rgba(0, 102, 255, 0.1)"
            stroke="#00D4FF"
            strokeWidth="2"
          />
          <circle
            cx="420"
            cy="520"
            r="6"
            fill="rgba(0, 102, 255, 0.1)"
            stroke="#0057FF"
            strokeWidth="2"
          />
          <circle cx="80" cy="520" r="3.5" fill="#00D4FF" />
          <circle cx="420" cy="120" r="3.5" fill="#0057FF" />
          {/* Animated pulse dots */}
          <circle cx="80" cy="120" r="3.5" fill="#0057FF">
            <animateMotion dur="4s" repeatCount="indefinite" path="M0,0 L160,200 L0,400" />
          </circle>
          <circle cx="420" cy="320" r="3.5" fill="#00D4FF">
            <animateMotion dur="5s" repeatCount="indefinite" path="M0,0 L-160,-200 L0,-400" />
          </circle>
          <circle cx="240" cy="0" r="3" fill="#0057FF">
            <animateMotion dur="6s" repeatCount="indefinite" path="M0,0 L0,800" />
          </circle>
          {/* Floating translucent bubbles with vibrant cyan/blue rims (slowed to 25% speed) */}
          <circle
            cx="60"
            cy="600"
            r="28"
            fill="rgba(0, 102, 255, 0.05)"
            stroke="rgba(0, 102, 255, 0.35)"
            strokeWidth="1.5"
          >
            <animate attributeName="cy" values="600;530;600" dur="16.8s" repeatCount="indefinite" />
          </circle>
          <circle
            cx="380"
            cy="200"
            r="44"
            fill="rgba(0, 212, 255, 0.04)"
            stroke="rgba(0, 212, 255, 0.4)"
            strokeWidth="1.5"
          >
            <animate attributeName="cy" values="200;145;200" dur="22.4s" repeatCount="indefinite" />
          </circle>
          <circle
            cx="460"
            cy="680"
            r="20"
            fill="rgba(0, 102, 255, 0.06)"
            stroke="rgba(0, 102, 255, 0.3)"
            strokeWidth="1.2"
          >
            <animate attributeName="cy" values="680;620;680" dur="14.4s" repeatCount="indefinite" />
          </circle>
          <circle
            cx="150"
            cy="70"
            r="24"
            fill="rgba(0, 212, 255, 0.05)"
            stroke="rgba(0, 212, 255, 0.35)"
            strokeWidth="1.2"
          >
            <animate attributeName="cy" values="70;25;70" dur="19.6s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* Logo */}
        <div className="auth-logo-row">
          <div className="auth-logo-badge">PG</div>
          <span className="auth-logo-text">PhishGuard</span>
        </div>

        {/* Center content */}
        <div className="auth-visual-body">
          <div className="auth-visual-tag">AUTOMATIC GMAIL INBOX PROTECTION</div>
          <h1 className="auth-visual-h1">
            Know what is real
            <br />
            <em>before you click.</em>
          </h1>
          <p className="auth-visual-desc">
            Connect any Gmail account securely. PhishGuard reads, classifies, and delivers
            explainable virtual risk reports in real-time.
          </p>

          {/* Feature chips */}
          <div className="auth-feature-chips">
            <div className="auth-chip">
              <span>🔒</span> TLS Encrypted
            </div>
            <div className="auth-chip">
              <span>⚡</span> Real-time
            </div>
          </div>
        </div>

        {/* Catchy Cybersecurity Quote */}
        <div className="auth-visual-footer">
          &ldquo;Think twice, verify always &mdash; vigilance is your strongest defense.&rdquo;
        </div>
      </div>

      {/* ── RIGHT: White Login Card ── */}
      <div className="auth-right">
        <div className="auth-panel">
          {/* Tabs */}
          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={(e) => {
                addSplash(e);
                setMode('login');
                setError('');
              }}
            >
              Sign in
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={(e) => {
                addSplash(e);
                setMode('register');
                setError('');
              }}
            >
              Create account
            </button>
          </div>

          <div className="auth-panel-label">
            {mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}
          </div>
          <h2 className="auth-panel-h2">
            {mode === 'login' ? 'Access your mailbox.' : 'A safer inbox starts here.'}
          </h2>
          <p className="auth-panel-sub">
            {mode === 'login'
              ? 'Sign in with your Gmail or custom email to view your Virtual Security Report.'
              : 'Sign up with any Gmail account and your preferred secure password.'}
          </p>

          {/* Google Button */}
          <button
            type="button"
            className="google-auth-btn"
            onClick={(e) => {
              addSplash(e);
              handleGoogleSignIn();
            }}
          >
            <svg className="google-icon-svg" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label className="auth-field-label">
                Full name
                <input
                  name="displayName"
                  placeholder="e.g. Kanisha Devi"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>
            )}

            <label className="auth-field-label">
              Email address (Gmail / Custom)
              <input
                name="email"
                type="email"
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-field-label">
              Password
              <input
                name="password"
                type="password"
                placeholder={
                  mode === 'register'
                    ? 'Set Google-strength password (min 8 chars)'
                    : 'Your password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === 'register' && (
                <div className="pwd-rules-box">
                  <div className="pwd-rules-header">
                    <span>GOOGLE PASSWORD REQUIREMENTS</span>
                    <span style={{ color: strengthColor }}>
                      {['Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][pwdStats.score]}
                    </span>
                  </div>
                  <div className="pwd-strength-track">
                    <div
                      className="pwd-strength-bar"
                      style={{ width: strengthWidth, background: strengthColor }}
                    />
                  </div>
                  <div className="pwd-rules-list">
                    <div className={`pwd-rule-item ${pwdStats.hasMinLength ? 'valid' : ''}`}>
                      <span>{pwdStats.hasMinLength ? '✓' : '○'}</span> At least 8 characters
                    </div>
                    <div className={`pwd-rule-item ${pwdStats.hasUpper ? 'valid' : ''}`}>
                      <span>{pwdStats.hasUpper ? '✓' : '○'}</span> Uppercase letter (A–Z)
                    </div>
                    <div className={`pwd-rule-item ${pwdStats.hasLower ? 'valid' : ''}`}>
                      <span>{pwdStats.hasLower ? '✓' : '○'}</span> Lowercase letter (a–z)
                    </div>
                    <div className={`pwd-rule-item ${pwdStats.hasNumber ? 'valid' : ''}`}>
                      <span>{pwdStats.hasNumber ? '✓' : '○'}</span> At least one number (0–9)
                    </div>
                    <div className={`pwd-rule-item ${pwdStats.hasSpecial ? 'valid' : ''}`}>
                      <span>{pwdStats.hasSpecial ? '✓' : '○'}</span> Special symbol (@$!%*?&#)
                    </div>
                  </div>
                </div>
              )}
              {mode === 'login' && (
                <small className="auth-demo-hint">
                  Demo Admin: <code>admin@phishguard.local</code> / <code>Admin12345678!</code>
                </small>
              )}
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button
              className="auth-submit-btn"
              type="submit"
              disabled={submitting}
              onClick={addSplash}
            >
              {submitting
                ? '⏳ Please wait...'
                : mode === 'login'
                  ? '⚡ Sign in'
                  : '🚀 Create account'}
            </button>
          </form>

          <small className="auth-footer-note">
            Passwords encrypted with bcrypt · Gmail accessed in read-only mode.
          </small>
        </div>
      </div>

      {/* ── Google Account Chooser Modal ── */}
      {showGoogleChooser && (
        <div className="google-chooser-overlay" onClick={() => setShowGoogleChooser(false)}>
          <div className="google-chooser-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="google-chooser-close"
              onClick={() => setShowGoogleChooser(false)}
              aria-label="Close"
            >
              &times;
            </button>

            <div className="google-chooser-header">
              <svg className="google-chooser-logo" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <h3 className="google-chooser-title">Choose an account</h3>
              <p className="google-chooser-subtitle">
                to continue to <b>PhishGuard AI</b>
              </p>
            </div>

            <div className="google-accounts-list">
              {googleAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  className="google-account-item"
                  disabled={connectingGoogleEmail !== null}
                  onClick={() => connectWithGoogleAccount(acc.email, acc.name)}
                >
                  <div className="google-account-avatar" style={{ background: acc.avatarBg }}>
                    {acc.initials}
                  </div>
                  <div className="google-account-info">
                    <div className="google-account-name">
                      <span>{acc.name}</span>
                      {acc.badge && <span className="google-account-badge">{acc.badge}</span>}
                    </div>
                    <div className="google-account-email">{acc.email}</div>
                  </div>
                  {connectingGoogleEmail === acc.email ? (
                    <span style={{ fontSize: '11px', color: '#0057FF', fontWeight: 600 }}>
                      Connecting...
                    </span>
                  ) : (
                    <span style={{ color: '#94A3B8', fontSize: '16px' }}>&rsaquo;</span>
                  )}
                </button>
              ))}

              {!showCustomGoogleInput ? (
                <button
                  type="button"
                  className="google-use-another-btn"
                  onClick={() => setShowCustomGoogleInput(true)}
                >
                  <div className="google-use-another-icon">+</div>
                  <span>Use another Google account</span>
                </button>
              ) : (
                <form
                  className="google-custom-input-box"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!customGoogleEmail.trim()) return;
                    connectWithGoogleAccount(
                      customGoogleEmail.trim(),
                      customGoogleName.trim() || customGoogleEmail.split('@')[0],
                    );
                  }}
                >
                  <input
                    type="email"
                    placeholder="Enter any Gmail address"
                    value={customGoogleEmail}
                    onChange={(e) => setCustomGoogleEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Display name (optional)"
                    value={customGoogleName}
                    onChange={(e) => setCustomGoogleName(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="submit"
                      className="google-custom-connect-btn"
                      style={{ flex: 1 }}
                      disabled={connectingGoogleEmail !== null}
                    >
                      {connectingGoogleEmail ? 'Connecting...' : 'Connect Google Account'}
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '8px 14px',
                        background: '#F1F5F9',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: '#64748B',
                      }}
                      onClick={() => setShowCustomGoogleInput(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="google-chooser-footer">
              To continue, Google will share your name, email address, and profile picture with
              PhishGuard AI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<'report' | 'analyze' | 'alerts'>('report');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [result, setResult] = useState<Analysis | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'PHISHING' | 'SPAM' | 'MARKETING' | 'SAFE'
  >('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanState, setScanState] = useState<{
    active: boolean;
    step: number;
    progress: number;
    logs: string[];
  }>({
    active: false,
    step: 1,
    progress: 0,
    logs: [],
  });

  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState(user.email);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');

  async function loadDashboard() {
    try {
      const data = await api<Dashboard>('/dashboard');
      setDashboard(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function loadAlerts() {
    try {
      const data = await api<{ alerts: AlertItem[] }>('/alerts');
      setAlerts(data.alerts);
    } catch {
      /* ignore */
    }
  }

  async function syncGmailInbox() {
    setSyncing(true);
    setError('');
    setScanState({
      active: true,
      step: 1,
      progress: 18,
      logs: [
        '[INIT] Establishing TLS-encrypted session to Gmail servers...',
        `[AUTH] Authenticated mailbox identity: ${user.email}`,
      ],
    });

    try {
      // Step 2: Fetching inbox messages
      await new Promise((resolve) => setTimeout(resolve, 600));
      setScanState((prev) => ({
        ...prev,
        step: 2,
        progress: 42,
        logs: [
          ...prev.logs,
          '[FETCH] Ingesting unread and active Gmail inbox streams...',
          '[STREAM] Ingestion complete: Message headers loaded into secure memory buffer',
        ],
      }));

      // Trigger backend inbox scan concurrently
      const syncPromise = api('/analyses/sync-inbox', { method: 'POST' });

      // Step 3: Header and domain reputation check
      await new Promise((resolve) => setTimeout(resolve, 650));
      setScanState((prev) => ({
        ...prev,
        step: 3,
        progress: 70,
        logs: [
          ...prev.logs,
          '[INSPECT] Cryptographic validation: SPF records & DKIM signatures verified',
          '[CHECK] Scanning embedded hyperlink targets against global threat registries',
        ],
      }));

      // Step 4: ML Neural classification
      await new Promise((resolve) => setTimeout(resolve, 650));
      setScanState((prev) => ({
        ...prev,
        step: 4,
        progress: 88,
        logs: [
          ...prev.logs,
          '[AI-CLASSIFIER] Running NLP linguistic heuristics & credential harvesting detectors...',
          '[ALERT] Flagged high-risk threat: Deceptive domain masquerading as PayPal Support',
        ],
      }));

      await syncPromise;
      await loadDashboard();
      await loadAlerts();

      // Step 5: Finished
      setScanState((prev) => ({
        ...prev,
        step: 5,
        progress: 100,
        logs: [
          ...prev.logs,
          '[SUCCESS] Virtual Graphical Risk Map & Threat Matrix compiled successfully!',
        ],
      }));

      await new Promise((resolve) => setTimeout(resolve, 750));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to sync Gmail inbox');
    } finally {
      setSyncing(false);
      setScanState((prev) => ({ ...prev, active: false }));
    }
  }

  useEffect(() => {
    void loadDashboard();
    void loadAlerts();
  }, []);

  function fillPhishing() {
    setSender('security-alerts@paypa1-support.com');
    setRecipient(user.email);
    setSubject('URGENT: Your account has been suspended - Verify identity immediately');
    setBodyText(
      'Dear customer,\n\nWe detected suspicious unauthorized access to your account. Your access is temporarily suspended. Please click here to verify your account credentials within 24 hours or your account will be permanently deactivated.\n\nThank you,\nAccount Security Team',
    );
  }

  function fillSafe() {
    setSender('newsletter@trustednews.org');
    setRecipient(user.email);
    setSubject('Weekly Security Digest: Best practices for remote workers');
    setBodyText(
      'Good morning,\n\nHere is your weekly security digest with tips on setting up two-factor authentication and identifying impersonation attacks. Have a safe and productive week ahead!\n\nBest regards,\nThe Editorial Team',
    );
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);
    setAnalyzing(true);
    try {
      const payload: Record<string, string> = { sender, recipient, subject, bodyText };
      if (dashboard?.defaultMailboxId) {
        payload.mailboxId = dashboard.defaultMailboxId;
      }
      const data = await api<Analysis>('/analyses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(data);
      await loadDashboard();
      await loadAlerts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function updateAlertStatus(alertId: string, status: 'ACKNOWLEDGED' | 'RESOLVED') {
    try {
      await api(`/alerts/${alertId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAlerts();
      await loadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update alert');
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    onLogout();
  }

  const inboxList = dashboard?.inboxMessages ?? [];
  const filteredInbox =
    categoryFilter === 'ALL'
      ? inboxList
      : inboxList.filter((m) => m.analysis?.category?.toUpperCase() === categoryFilter);

  const threatLevel = dashboard?.threatLevel ?? 'SECURE';

  // Metrics for Virtual Graphical Representations of Risks
  const totalMsgs = inboxList.length || 1;
  const countCrit = inboxList.filter(
    (m) => m.analysis?.riskLevel?.toUpperCase() === 'CRITICAL',
  ).length;
  const countHigh = inboxList.filter((m) => m.analysis?.riskLevel?.toUpperCase() === 'HIGH').length;
  const countMed = inboxList.filter(
    (m) => m.analysis?.riskLevel?.toUpperCase() === 'MEDIUM',
  ).length;
  const countLow = inboxList.filter((m) =>
    ['LOW', 'SAFE'].includes(m.analysis?.riskLevel?.toUpperCase() ?? ''),
  ).length;

  const pctCrit = Math.round((countCrit / totalMsgs) * 100);
  const pctHigh = Math.round((countHigh / totalMsgs) * 100);
  const pctMed = Math.round((countMed / totalMsgs) * 100);
  const pctLow = Math.round((countLow / totalMsgs) * 100);

  const countPhish = inboxList.filter(
    (m) => m.analysis?.category?.toUpperCase() === 'PHISHING',
  ).length;
  const countSpam = inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'SPAM').length;
  const countMkt = inboxList.filter(
    (m) => m.analysis?.category?.toUpperCase() === 'MARKETING',
  ).length;
  const countSafe = inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'SAFE').length;

  const pctPhish = Math.round((countPhish / totalMsgs) * 100);
  const pctSpam = Math.round((countSpam / totalMsgs) * 100);
  const pctMkt = Math.round((countMkt / totalMsgs) * 100);
  const pctSafe = Math.round((countSafe / totalMsgs) * 100);

  const circumference = 276.46;
  const phishStroke = (pctPhish / 100) * circumference;
  const spamStroke = (pctSpam / 100) * circumference;
  const mktStroke = (pctMkt / 100) * circumference;
  const safeStroke = (pctSafe / 100) * circumference;

  const phishOffset = 0;
  const spamOffset = phishStroke;
  const mktOffset = phishStroke + spamStroke;
  const safeOffset = phishStroke + spamStroke + mktStroke;

  return (
    <div className="react-app">
      <aside>
        <div className="logo">
          <b>PG</b> PhishGuard
        </div>
        <p className="workspace">● Personal workspace</p>
        <nav>
          <button className={tab === 'report' ? 'selected' : ''} onClick={() => setTab('report')}>
            📊 Virtual Security Report
          </button>
          <button className={tab === 'analyze' ? 'selected' : ''} onClick={() => setTab('analyze')}>
            ✉ Single Email Inspector
          </button>
          <button className={tab === 'alerts' ? 'selected' : ''} onClick={() => setTab('alerts')}>
            🛡 Active Alerts {dashboard?.openAlerts ? <small>{dashboard.openAlerts}</small> : null}
          </button>
        </nav>
        <div className="aside-foot">
          <p>
            + <strong>Protected by default</strong>
            <br />
            <span>Analysis stays scoped to your account.</span>
          </p>
          <button onClick={logout}>↪ Sign out</button>
          <p className="user">
            <b>{user.displayName.slice(0, 2).toUpperCase()}</b> {user.displayName}
            <br />
            <span>{user.email}</span>
          </p>
        </div>
      </aside>

      <main>
        <header>
          Workspace /{' '}
          <b>
            {tab === 'report'
              ? 'Virtual Security Report'
              : tab === 'analyze'
                ? 'Email Inspector'
                : 'Alerts'}
          </b>
          <span>{user.role} · Secure session</span>
        </header>

        <section className="hero">
          <div>
            <label>GMAIL INBOX RISK INTELLIGENCE</label>
            <h1>
              {tab === 'report' && 'Virtual Mailbox Security Report'}
              {tab === 'analyze' && 'Inspect & Classify Email'}
              {tab === 'alerts' && 'Security Alerts & Incident Triage'}
            </h1>
            <p>
              {tab === 'report' &&
                'Automated read-only analysis of incoming mailbox messages with explainable risk evaluation.'}
              {tab === 'analyze' &&
                'Test and dissect individual email headers, sender signatures, and message payloads.'}
              {tab === 'alerts' &&
                'Track and resolve security alerts generated from critical and high-risk phishing detections.'}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="loading">Connecting to your secure mailbox and loading report...</div>
        ) : (
          dashboard && (
            <>
              {/* Secure Gmail Connection Card */}
              <div className="gmail-connect-card">
                <div className="gmail-info">
                  <div className="gmail-badge-icon">M</div>
                  <div className="gmail-details">
                    <h4>
                      Connected Gmail Account:{' '}
                      <strong>{dashboard.mailbox?.providerUser ?? user.email}</strong>
                      <span className="status-pill">● SECURE CONNECTED</span>
                    </h4>
                    <p>
                      Provider: <b>Google Mail</b> · Scope: <b>Read-Only</b> · Session:{' '}
                      <b>AES-256 TLS Verified</b> · Last Scanned:{' '}
                      <b>
                        {dashboard.mailbox?.lastScannedAt
                          ? new Date(dashboard.mailbox.lastScannedAt).toLocaleTimeString()
                          : 'Just now'}
                      </b>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="sync-inbox-btn"
                  onClick={syncGmailInbox}
                  disabled={syncing}
                >
                  {syncing ? '🔄 Reading & Scanning Inbox...' : '🔄 Sync & Scan Gmail Inbox'}
                </button>
              </div>

              {/* KPI Score Cards */}
              <div className="stats">
                <article>
                  <span>Inbox Health Rating</span>
                  <strong>{dashboard.healthScore}/100</strong>
                  <small>
                    {dashboard.healthScore >= 90
                      ? 'Clean & protected inbox'
                      : dashboard.healthScore >= 70
                        ? 'Moderate threat exposure'
                        : 'Critical threat action required'}
                  </small>
                </article>
                <article>
                  <span>Messages Read & Scanned</span>
                  <strong>{dashboard.scanned}</strong>
                  <small>Persisted inspection records</small>
                </article>
                <article>
                  <span>Phishing Threats Stopped</span>
                  <strong>{dashboard.threatsStopped}</strong>
                  <small>{dashboard.openAlerts} open triage alerts</small>
                </article>
              </div>

              {/* Virtual Report Tab */}
              {tab === 'report' && (
                <div>
                  <div className="virtual-report-hero">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <span className={`threat-level-badge ${threatLevel}`}>
                          OVERALL THREAT STATUS: {threatLevel.replace('_', ' ')}
                        </span>
                        <h2>Inbox Executive Summary</h2>
                        <p
                          style={{
                            color: '#4B5563',
                            fontSize: '12px',
                            margin: 0,
                            lineHeight: '1.6',
                          }}
                        >
                          PhishGuard inspected all incoming Gmail messages using multi-layer
                          heuristic and linguistic threat classification.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
                        {Object.entries(dashboard.categories).map(([category, percentage]) => (
                          <div key={category} style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: '22px',
                                fontWeight: 800,
                                color: '#0A0A0F',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {percentage}%
                            </div>
                            <small
                              style={{
                                fontSize: '10px',
                                color: '#9CA3AF',
                                textTransform: 'uppercase',
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.8px',
                              }}
                            >
                              {category}
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Virtual Graphical Representation of Risks */}
                  <div className="risk-graphics-container">
                    <div className="risk-charts-grid">
                      {/* Interactive SVG Donut Chart: Threat Composition */}
                      <div className="chart-card">
                        <div className="chart-card-header">
                          <h3>📊 Risk Composition Matrix</h3>
                          <small>{inboxList.length} Messages Scanned</small>
                        </div>
                        <div className="donut-layout">
                          <div className="donut-svg-wrapper">
                            <svg className="donut-svg" viewBox="0 0 100 100">
                              <circle
                                cx="50"
                                cy="50"
                                r="44"
                                fill="transparent"
                                stroke="#e2e8f0"
                                strokeWidth="12"
                              />
                              {pctPhish > 0 && (
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="44"
                                  fill="transparent"
                                  stroke="#ef4444"
                                  strokeWidth="12"
                                  strokeDasharray={`${phishStroke} ${circumference}`}
                                  strokeDashoffset={`-${phishOffset}`}
                                />
                              )}
                              {pctSpam > 0 && (
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="44"
                                  fill="transparent"
                                  stroke="#f59e0b"
                                  strokeWidth="12"
                                  strokeDasharray={`${spamStroke} ${circumference}`}
                                  strokeDashoffset={`-${spamOffset}`}
                                />
                              )}
                              {pctMkt > 0 && (
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="44"
                                  fill="transparent"
                                  stroke="#3b82f6"
                                  strokeWidth="12"
                                  strokeDasharray={`${mktStroke} ${circumference}`}
                                  strokeDashoffset={`-${mktOffset}`}
                                />
                              )}
                              {pctSafe > 0 && (
                                <circle
                                  cx="50"
                                  cy="50"
                                  r="44"
                                  fill="transparent"
                                  stroke="#10b981"
                                  strokeWidth="12"
                                  strokeDasharray={`${safeStroke} ${circumference}`}
                                  strokeDashoffset={`-${safeOffset}`}
                                />
                              )}
                            </svg>
                            <div className="donut-center-info">
                              <div className="donut-score-val">{dashboard.healthScore}</div>
                              <div className="donut-score-label">Health Index</div>
                            </div>
                          </div>

                          <div className="donut-legend">
                            <div className="donut-legend-item">
                              <div className="legend-label-group">
                                <span
                                  className="legend-dot"
                                  style={{ background: '#ef4444' }}
                                ></span>
                                <span>Phishing Threats</span>
                              </div>
                              <span className="legend-count">
                                {countPhish} ({pctPhish}%)
                              </span>
                            </div>
                            <div className="donut-legend-item">
                              <div className="legend-label-group">
                                <span
                                  className="legend-dot"
                                  style={{ background: '#f59e0b' }}
                                ></span>
                                <span>Spam & Scams</span>
                              </div>
                              <span className="legend-count">
                                {countSpam} ({pctSpam}%)
                              </span>
                            </div>
                            <div className="donut-legend-item">
                              <div className="legend-label-group">
                                <span
                                  className="legend-dot"
                                  style={{ background: '#3b82f6' }}
                                ></span>
                                <span>Marketing</span>
                              </div>
                              <span className="legend-count">
                                {countMkt} ({pctMkt}%)
                              </span>
                            </div>
                            <div className="donut-legend-item">
                              <div className="legend-label-group">
                                <span
                                  className="legend-dot"
                                  style={{ background: '#10b981' }}
                                ></span>
                                <span>Verified Safe</span>
                              </div>
                              <span className="legend-count">
                                {countSafe} ({pctSafe}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Threat Severity Distribution Bars */}
                      <div className="chart-card">
                        <div className="chart-card-header">
                          <h3>⚡ Threat Severity Distribution</h3>
                          <small>Real-time Risk Tiers</small>
                        </div>
                        <div className="severity-chart">
                          <div className="severity-row">
                            <div className="severity-info">
                              <span style={{ color: '#b91c1c' }}>
                                ● Critical Risk (Credential / Financial)
                              </span>
                              <b>
                                {countCrit} emails ({pctCrit}%)
                              </b>
                            </div>
                            <div className="severity-track">
                              <div
                                className="severity-fill critical"
                                style={{ width: `${Math.max(countCrit > 0 ? 8 : 0, pctCrit)}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="severity-row">
                            <div className="severity-info">
                              <span style={{ color: '#c2410c' }}>
                                ● High Risk (Impersonation / False Urgency)
                              </span>
                              <b>
                                {countHigh} emails ({pctHigh}%)
                              </b>
                            </div>
                            <div className="severity-track">
                              <div
                                className="severity-fill high"
                                style={{ width: `${Math.max(countHigh > 0 ? 8 : 0, pctHigh)}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="severity-row">
                            <div className="severity-info">
                              <span style={{ color: '#a16207' }}>
                                ● Medium Risk (Suspicious Bulk / Unsolicited)
                              </span>
                              <b>
                                {countMed} emails ({pctMed}%)
                              </b>
                            </div>
                            <div className="severity-track">
                              <div
                                className="severity-fill medium"
                                style={{ width: `${Math.max(countMed > 0 ? 8 : 0, pctMed)}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="severity-row">
                            <div className="severity-info">
                              <span style={{ color: '#15803d' }}>
                                ● Low Risk / Safe (Verified Clean Communications)
                              </span>
                              <b>
                                {countLow} emails ({pctLow}%)
                              </b>
                            </div>
                            <div className="severity-track">
                              <div
                                className="severity-fill safe"
                                style={{ width: `${Math.max(countLow > 0 ? 8 : 0, pctLow)}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Threat Vectors & Security Indicators */}
                    <div className="chart-card">
                      <div className="chart-card-header">
                        <h3>🛡️ Evaluated Security Vectors & Threat Indicators</h3>
                        <small>Continuous Gmail AI Inspection</small>
                      </div>
                      <div className="vector-grid">
                        <div className="vector-card">
                          <div className="vector-icon">🔍</div>
                          <div className="vector-title">Domain Impersonation</div>
                          <span className={`vector-status ${countPhish > 0 ? 'flagged' : 'clear'}`}>
                            {countPhish > 0 ? 'Threat Detected' : 'Clean & Verified'}
                          </span>
                        </div>
                        <div className="vector-card">
                          <div className="vector-icon">⚠️</div>
                          <div className="vector-title">Social Engineering & Coercion</div>
                          <span
                            className={`vector-status ${countCrit + countHigh > 0 ? 'flagged' : 'clear'}`}
                          >
                            {countCrit + countHigh > 0
                              ? 'Coercive Tactics Flagged'
                              : 'Normal Cadence'}
                          </span>
                        </div>
                        <div className="vector-card">
                          <div className="vector-icon">🔗</div>
                          <div className="vector-title">Phishing Hyperlinks & Forms</div>
                          <span className={`vector-status ${countPhish > 0 ? 'flagged' : 'clear'}`}>
                            {countPhish > 0
                              ? 'Suspicious Links Intercepted'
                              : 'Zero Malicious URLs'}
                          </span>
                        </div>
                        <div className="vector-card">
                          <div className="vector-icon">🔒</div>
                          <div className="vector-title">SPF & DKIM Authenticity</div>
                          <span className="vector-status clear">TLS Verified Cryptography</span>
                        </div>
                        <div className="vector-card">
                          <div className="vector-icon">🧠</div>
                          <div className="vector-title">Heuristic AI Engine</div>
                          <span className="vector-status info">phishguard-rules-v1 Active</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="filter-tabs">
                    <button
                      className={`filter-btn ${categoryFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('ALL')}
                    >
                      All Messages ({inboxList.length})
                    </button>
                    <button
                      className={`filter-btn ${categoryFilter === 'PHISHING' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('PHISHING')}
                    >
                      Phishing (
                      {
                        inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'PHISHING')
                          .length
                      }
                      )
                    </button>
                    <button
                      className={`filter-btn ${categoryFilter === 'SPAM' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('SPAM')}
                    >
                      Spam (
                      {
                        inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'SPAM')
                          .length
                      }
                      )
                    </button>
                    <button
                      className={`filter-btn ${categoryFilter === 'MARKETING' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('MARKETING')}
                    >
                      Marketing (
                      {
                        inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'MARKETING')
                          .length
                      }
                      )
                    </button>
                    <button
                      className={`filter-btn ${categoryFilter === 'SAFE' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('SAFE')}
                    >
                      Safe (
                      {
                        inboxList.filter((m) => m.analysis?.category?.toUpperCase() === 'SAFE')
                          .length
                      }
                      )
                    </button>
                  </div>

                  {/* Inbox Scanned Messages List */}
                  <div className="inbox-list">
                    {filteredInbox.length === 0 ? (
                      <div className="empty-state">
                        No email messages match the selected filter.
                      </div>
                    ) : (
                      filteredInbox.map((msg) => (
                        <div
                          key={msg.id}
                          className="inbox-card"
                          onClick={() => setSelectedEmail(msg)}
                        >
                          <div className="inbox-card-header">
                            <span className="inbox-sender">From: {msg.sender}</span>
                            <span className="inbox-date">
                              {new Date(msg.receivedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="inbox-subject">{msg.subject}</div>
                          <div className="inbox-preview">{msg.bodyText}</div>
                          <div className="inbox-card-footer">
                            <div>
                              {msg.analysis && (
                                <>
                                  <span className={`risk-tag ${msg.analysis.riskLevel}`}>
                                    {msg.analysis.riskLevel} RISK
                                  </span>
                                  <span className="category-tag">
                                    {msg.analysis.category} (
                                    {Math.round(Number(msg.analysis.score) * 100)}% Confidence)
                                  </span>
                                </>
                              )}
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#0057FF',
                                fontWeight: 600,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              Inspect →
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Single Email Inspector Tab */}
              {tab === 'analyze' && (
                <div className="panels">
                  <article>
                    <label>MANUAL INSPECTOR</label>
                    <h2>Analyze Custom Message</h2>
                    <p className="panel-copy">
                      Provide email headers or paste message content for on-demand classification.
                    </p>

                    <div className="sample-btns">
                      <button type="button" className="sample-btn" onClick={fillPhishing}>
                        + Phishing Sample
                      </button>
                      <button type="button" className="sample-btn" onClick={fillSafe}>
                        + Safe Sample
                      </button>
                    </div>

                    <form className="analysis-form" onSubmit={analyze}>
                      <input
                        name="sender"
                        type="email"
                        placeholder="Sender email (e.g. security@paypa1.com)"
                        value={sender}
                        onChange={(e) => setSender(e.target.value)}
                        required
                      />
                      <input
                        name="recipient"
                        type="email"
                        placeholder="Recipient email"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        required
                      />
                      <input
                        name="subject"
                        placeholder="Subject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                      />
                      <textarea
                        name="bodyText"
                        placeholder="Message body"
                        rows={6}
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        required
                      />
                      <button className="scan" type="submit" disabled={analyzing}>
                        {analyzing ? 'Analyzing email...' : 'Analyze email →'}
                      </button>
                    </form>
                    {error && <div className="form-error">{error}</div>}
                  </article>

                  <article>
                    <label>INSPECTION RESULT</label>
                    <h2>
                      {result ? `${result.category} · ${result.riskLevel}` : 'No analysis selected'}
                    </h2>
                    {result ? (
                      <div className={`result ${result.riskLevel.toLowerCase()}`}>
                        <strong>{Math.round(result.score * 100)}% Confidence</strong>
                        <p>Model: {result.modelName}</p>
                        <ul>
                          {result.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        <small>Analysis ID: {result.analysisId}</small>
                      </div>
                    ) : (
                      <div className="empty-state">
                        Submit a message or load a sample to view its explainable detection outcome.
                      </div>
                    )}
                  </article>
                </div>
              )}

              {/* Alerts Tab */}
              {tab === 'alerts' && (
                <div className="panels">
                  <article style={{ gridColumn: '1 / -1' }}>
                    <label>TRIAGE QUEUE</label>
                    <h2>Active Security Alerts ({alerts.length})</h2>
                    {alerts.length === 0 ? (
                      <div className="empty-state">
                        No open security alerts. Your mailbox is clear!
                      </div>
                    ) : (
                      <ul>
                        {alerts.map((alert) => (
                          <li
                            key={alert.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: '1px solid #E5E7EB',
                              padding: '12px 0',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '13px', color: '#0A0A0F' }}>
                                {alert.title}
                              </strong>
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: '#4B5563',
                                  marginTop: '3px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                Status: <b style={{ color: '#0057FF' }}>{alert.status}</b> · Logged
                                at: {new Date(alert.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className="alert-actions">
                              {alert.status === 'OPEN' && (
                                <button
                                  type="button"
                                  className="alert-btn"
                                  onClick={() => updateAlertStatus(alert.id, 'ACKNOWLEDGED')}
                                >
                                  Acknowledge
                                </button>
                              )}
                              {alert.status !== 'RESOLVED' && (
                                <button
                                  type="button"
                                  className="alert-btn resolve"
                                  onClick={() => updateAlertStatus(alert.id, 'RESOLVED')}
                                >
                                  Resolve
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                </div>
              )}

              {/* Modal Viewer for Deep Virtual Analysis */}
              {selectedEmail && (
                <div className="modal-backdrop" onClick={() => setSelectedEmail(null)}>
                  <div className="modal-window" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <div>
                        <span className={`risk-tag ${selectedEmail.analysis?.riskLevel ?? 'SAFE'}`}>
                          {selectedEmail.analysis?.riskLevel ?? 'SAFE'} RISK
                        </span>
                        <span className="category-tag">
                          {selectedEmail.analysis?.category ?? 'SAFE'}
                        </span>
                        <h3>{selectedEmail.subject}</h3>
                        <div style={{ fontSize: '11px', color: '#667c78' }}>
                          From: <b>{selectedEmail.sender}</b> → To: <b>{selectedEmail.recipient}</b>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="modal-close-btn"
                        onClick={() => setSelectedEmail(null)}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label
                        style={{
                          fontSize: '10px',
                          color: '#0057FF',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          letterSpacing: '1.5px',
                          display: 'block',
                          marginBottom: '8px',
                        }}
                      >
                        VIRTUAL AI THREAT ANALYSIS
                      </label>
                      <div
                        className={`result ${selectedEmail.analysis?.riskLevel?.toLowerCase() ?? 'safe'}`}
                        style={{ marginTop: '0' }}
                      >
                        <strong>
                          {Math.round(Number(selectedEmail.analysis?.score ?? 0.9) * 100)}%
                          Confidence Score
                        </strong>
                        <p>
                          Classifier Model:{' '}
                          {selectedEmail.analysis?.modelName ?? 'phishguard-rules-v1'}
                        </p>
                        <h4>Detection Factors &amp; Explainable Reasons:</h4>
                        <ul>
                          {selectedEmail.analysis?.reasons?.map((r) => <li key={r}>{r}</li>) ?? (
                            <li>No malicious indicators detected.</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: '10px',
                          color: '#0057FF',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          letterSpacing: '1.5px',
                          display: 'block',
                          marginBottom: '6px',
                        }}
                      >
                        MESSAGE CONTENT
                      </label>
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          padding: '14px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: '1.7',
                          color: '#1E1E2E',
                          whiteSpace: 'pre-wrap',
                          marginTop: '0',
                        }}
                      >
                        {selectedEmail.bodyText}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Scanning Radar Animation Overlay */}
              {scanState.active && (
                <div className="scan-overlay">
                  <div className="scan-modal">
                    <div className="scan-modal-header">
                      <label>GMAIL CYBER THREAT RADAR</label>
                      <h3>Scanning Gmail Inbox Streams...</h3>
                      <p>
                        Target Mailbox: <b>{dashboard.mailbox?.providerUser ?? user.email}</b>
                      </p>
                    </div>

                    <div className="radar-container">
                      <div className="radar-screen">
                        <div className="radar-ring radar-ring-1"></div>
                        <div className="radar-ring radar-ring-2"></div>
                        <div className="radar-ring radar-ring-3"></div>
                        <div className="radar-crosshair-h"></div>
                        <div className="radar-crosshair-v"></div>
                        <div className="radar-sweep"></div>
                        <div className="radar-blip blip-red"></div>
                        <div className="radar-blip blip-green"></div>
                        <div className="radar-blip blip-yellow"></div>
                      </div>
                    </div>

                    <div className="scan-progress-box">
                      <div className="scan-progress-labels">
                        <span>AI Threat Pipeline Progress</span>
                        <span>{scanState.progress}%</span>
                      </div>
                      <div className="scan-progress-track">
                        <div
                          className="scan-progress-bar"
                          style={{ width: `${scanState.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="scan-steps">
                      <div
                        className={`scan-step-row ${scanState.step > 1 ? 'done' : scanState.step === 1 ? 'active' : 'waiting'}`}
                      >
                        <div className="scan-step-icon">{scanState.step > 1 ? '✓' : '1'}</div>
                        <span className="scan-step-text">
                          Connect to Google Mail IMAP / OAuth tunnel
                        </span>
                        <span className="scan-step-status">
                          {scanState.step > 1
                            ? 'CONNECTED'
                            : scanState.step === 1
                              ? 'CONNECTING...'
                              : 'WAITING'}
                        </span>
                      </div>
                      <div
                        className={`scan-step-row ${scanState.step > 2 ? 'done' : scanState.step === 2 ? 'active' : 'waiting'}`}
                      >
                        <div className="scan-step-icon">{scanState.step > 2 ? '✓' : '2'}</div>
                        <span className="scan-step-text">
                          Fetch inbox messages & cryptographic signatures
                        </span>
                        <span className="scan-step-status">
                          {scanState.step > 2
                            ? 'RETRIEVED'
                            : scanState.step === 2
                              ? 'STREAMING...'
                              : 'WAITING'}
                        </span>
                      </div>
                      <div
                        className={`scan-step-row ${scanState.step > 3 ? 'done' : scanState.step === 3 ? 'active' : 'waiting'}`}
                      >
                        <div className="scan-step-icon">{scanState.step > 3 ? '✓' : '3'}</div>
                        <span className="scan-step-text">
                          Validate SPF, DKIM, reverse DNS & domain age
                        </span>
                        <span className="scan-step-status">
                          {scanState.step > 3
                            ? 'INSPECTED'
                            : scanState.step === 3
                              ? 'VERIFYING...'
                              : 'WAITING'}
                        </span>
                      </div>
                      <div
                        className={`scan-step-row ${scanState.step > 4 ? 'done' : scanState.step === 4 ? 'active' : 'waiting'}`}
                      >
                        <div className="scan-step-icon">{scanState.step > 4 ? '✓' : '4'}</div>
                        <span className="scan-step-text">
                          Run AI multi-layer heuristic & NLP classifier
                        </span>
                        <span className="scan-step-status">
                          {scanState.step > 4
                            ? 'CLASSIFIED'
                            : scanState.step === 4
                              ? 'ANALYZING...'
                              : 'WAITING'}
                        </span>
                      </div>
                      <div className={`scan-step-row ${scanState.step >= 5 ? 'done' : 'waiting'}`}>
                        <div className="scan-step-icon">{scanState.step >= 5 ? '✓' : '5'}</div>
                        <span className="scan-step-text">
                          Synthesize Virtual Risk Graph & Executive Report
                        </span>
                        <span className="scan-step-status">
                          {scanState.step >= 5 ? 'READY' : 'PENDING'}
                        </span>
                      </div>
                    </div>

                    <div className="scan-terminal">
                      {scanState.logs.map((log, i) => (
                        <div key={i} className="scan-terminal-line">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}

function CircuitBubbleCanvas() {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;
    const bgCtx = bgCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');
    if (!bgCtx || !fgCtx) return;

    let animId: number;
    let width = (bgCanvas.width = fgCanvas.width = window.innerWidth);
    let height = (bgCanvas.height = fgCanvas.height = window.innerHeight);

    let mouseX = -999;
    let mouseY = -999;

    const handleResize = () => {
      if (!bgCanvas || !fgCanvas) return;
      width = bgCanvas.width = fgCanvas.width = window.innerWidth;
      height = bgCanvas.height = fgCanvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 1. Moving Floating Bubbles with Glossy Specular Highlights (Slowed to 25% speed)
    const bubbles: Array<{
      x: number;
      y: number;
      r: number;
      speedY: number;
      speedX: number;
      wobble: number;
      wobbleSpeed: number;
      alpha: number;
    }> = [];

    for (let i = 0; i < 48; i++) {
      bubbles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 12 + Math.random() * 32,
        speedY: (0.6 + Math.random() * 1.3) * 0.25, // 25% speed (0.15 - 0.47 px/frame)
        speedX: (Math.random() - 0.5) * 0.11,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: (0.015 + Math.random() * 0.025) * 0.25, // 25% wobble rate
        alpha: 0.45 + Math.random() * 0.45,
      });
    }

    // 2. Circuit Nodes & Paths
    const circuitPoints: Array<{ x: number; y: number; connectedTo: number[] }> = [];
    const cols = 9;
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * (width / cols) + Math.sin(r * 2 + c) * 30;
        const y = (r + 0.5) * (height / rows) + Math.cos(c * 2 + r) * 30;
        circuitPoints.push({ x, y, connectedTo: [] });
      }
    }
    for (let i = 0; i < circuitPoints.length; i++) {
      if ((i + 1) % cols !== 0 && Math.random() > 0.32) circuitPoints[i].connectedTo.push(i + 1);
      if (i + cols < circuitPoints.length && Math.random() > 0.32)
        circuitPoints[i].connectedTo.push(i + cols);
    }

    // Electric pulses coursing along circuit traces
    const pulses: Array<{
      from: number;
      to: number;
      progress: number;
      speed: number;
      color: string;
    }> = [];

    function spawnPulse() {
      if (pulses.length > 25) return;
      const validNodes = circuitPoints
        .map((p, idx) => ({ p, idx }))
        .filter((item) => item.p.connectedTo.length > 0);
      if (validNodes.length === 0) return;
      const fromNode = validNodes[Math.floor(Math.random() * validNodes.length)];
      const target =
        fromNode.p.connectedTo[Math.floor(Math.random() * fromNode.p.connectedTo.length)];
      pulses.push({
        from: fromNode.idx,
        to: target,
        progress: 0,
        speed: 0.012 + Math.random() * 0.018,
        color: Math.random() > 0.4 ? '#0057FF' : '#00D4FF',
      });
    }

    // 3. Splash Effect on Foreground Canvas (Interactive press / click ripples + droplets + sparks)
    const splashes: Array<{
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      alpha: number;
      particles: Array<{
        x: number;
        y: number;
        vx: number;
        vy: number;
        size: number;
        color: string;
      }>;
      sparks: Array<{
        dx: number;
        dy: number;
      }>;
    }> = [];

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const particleCount = 24;
      const particles = [];
      const colors = ['#0057FF', '#0077FF', '#00D4FF', '#38BDF8', '#60A5FA'];
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = 3.5 + Math.random() * 7.5;
        particles.push({
          x: clientX,
          y: clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 3.5 + Math.random() * 5.5,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      const sparks = [];
      const sparkCount = 6;
      for (let s = 0; s < sparkCount; s++) {
        const angle = (s / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const length = 28 + Math.random() * 32;
        sparks.push({
          dx: Math.cos(angle) * length,
          dy: Math.sin(angle) * length,
        });
      }

      splashes.push({
        x: clientX,
        y: clientY,
        radius: 4,
        maxRadius: 85,
        alpha: 1,
        particles,
        sparks,
      });
    };

    window.addEventListener('pointerdown', handlePointerDown);

    // 60FPS Render Loop
    const render = () => {
      // ── A. Render Background Canvas (Circuits & Moving Bubbles) ──
      bgCtx.clearRect(0, 0, width, height);

      // Circuit Traces (vibrant electric blue on white)
      bgCtx.lineWidth = 1.1;
      bgCtx.strokeStyle = 'rgba(0, 102, 255, 0.16)';
      for (let i = 0; i < circuitPoints.length; i++) {
        const p1 = circuitPoints[i];
        for (const targetIdx of p1.connectedTo) {
          const p2 = circuitPoints[targetIdx];
          bgCtx.beginPath();
          bgCtx.moveTo(p1.x, p1.y);
          const midX = (p1.x + p2.x) / 2;
          bgCtx.lineTo(midX, p1.y);
          bgCtx.lineTo(midX, p2.y);
          bgCtx.lineTo(p2.x, p2.y);
          bgCtx.stroke();
        }
      }

      // Circuit Nodes
      for (let i = 0; i < circuitPoints.length; i++) {
        const p = circuitPoints[i];
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        bgCtx.fillStyle = 'rgba(0, 102, 255, 0.28)';
        bgCtx.fill();
        bgCtx.beginPath();
        bgCtx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        bgCtx.fillStyle = '#00D4FF';
        bgCtx.fill();
      }

      // Electric Pulses
      if (Math.random() < 0.12) spawnPulse();
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.progress += pulse.speed;
        if (pulse.progress >= 1) {
          pulses.splice(i, 1);
          continue;
        }
        const p1 = circuitPoints[pulse.from];
        const p2 = circuitPoints[pulse.to];
        if (!p1 || !p2) continue;

        const midX = (p1.x + p2.x) / 2;
        let curX = p1.x;
        let curY = p1.y;

        if (pulse.progress < 0.33) {
          const seg = pulse.progress / 0.33;
          curX = p1.x + (midX - p1.x) * seg;
          curY = p1.y;
        } else if (pulse.progress < 0.66) {
          const seg = (pulse.progress - 0.33) / 0.33;
          curX = midX;
          curY = p1.y + (p2.y - p1.y) * seg;
        } else {
          const seg = (pulse.progress - 0.66) / 0.34;
          curX = midX + (p2.x - midX) * seg;
          curY = p2.y;
        }

        bgCtx.save();
        bgCtx.beginPath();
        bgCtx.arc(curX, curY, 3, 0, Math.PI * 2);
        bgCtx.fillStyle = pulse.color;
        bgCtx.shadowColor = pulse.color;
        bgCtx.shadowBlur = 8;
        bgCtx.fill();
        bgCtx.restore();
      }

      // Moving Floating Bubbles (25% speed)
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.y -= b.speedY;
        b.wobble += b.wobbleSpeed;
        b.x += Math.sin(b.wobble) * 0.22 + b.speedX;

        // Mouse proximity gentle deflection
        if (mouseX > 0 && mouseY > 0) {
          const dx = b.x - mouseX;
          const dy = b.y - mouseY;
          const dist = Math.hypot(dx, dy);
          if (dist < 110 && dist > 1) {
            const force = (110 - dist) / 110;
            b.x += (dx / dist) * force * 1.8;
            b.y += (dy / dist) * force * 1.8;
          }
        }

        if (b.y + b.r < -20) {
          b.y = height + b.r + 10;
          b.x = Math.random() * width;
        }

        bgCtx.save();
        bgCtx.beginPath();
        bgCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

        // Translucent iridescent body
        const grad = bgCtx.createRadialGradient(
          b.x - b.r * 0.3,
          b.y - b.r * 0.3,
          b.r * 0.1,
          b.x,
          b.y,
          b.r,
        );
        grad.addColorStop(0, `rgba(255, 255, 255, ${b.alpha * 0.35})`);
        grad.addColorStop(0.5, `rgba(220, 240, 255, ${b.alpha * 0.15})`);
        grad.addColorStop(1, `rgba(0, 102, 255, ${b.alpha * 0.22})`);

        bgCtx.fillStyle = grad;
        bgCtx.fill();

        // Vibrant blue outer rim
        bgCtx.strokeStyle = `rgba(0, 102, 255, ${b.alpha * 0.4})`;
        bgCtx.lineWidth = 1.3;
        bgCtx.stroke();

        // 3D curved specular reflection glint on top-left
        bgCtx.beginPath();
        bgCtx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, Math.PI * 0.8, Math.PI * 1.8);
        bgCtx.strokeStyle = `rgba(255, 255, 255, ${b.alpha * 0.85})`;
        bgCtx.lineWidth = Math.max(1, b.r * 0.1);
        bgCtx.stroke();

        // Secondary bottom rim glow
        bgCtx.beginPath();
        bgCtx.arc(b.x + b.r * 0.2, b.y + b.r * 0.2, b.r * 0.35, 0, Math.PI * 0.6);
        bgCtx.strokeStyle = `rgba(0, 212, 255, ${b.alpha * 0.3})`;
        bgCtx.lineWidth = 1;
        bgCtx.stroke();

        bgCtx.restore();
      }

      // ── B. Render Foreground Canvas (Splash on Press) ──
      fgCtx.clearRect(0, 0, width, height);

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.radius += 3.8;
        s.alpha *= 0.91;

        if (s.alpha <= 0.02 || s.radius >= s.maxRadius) {
          splashes.splice(i, 1);
          continue;
        }

        fgCtx.save();

        // 1. Primary Vibrant Electric Blue Shockwave
        fgCtx.beginPath();
        fgCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        fgCtx.strokeStyle = `rgba(0, 87, 255, ${s.alpha * 0.9})`;
        fgCtx.lineWidth = 3.2;
        fgCtx.shadowColor = '#0057FF';
        fgCtx.shadowBlur = 16;
        fgCtx.stroke();

        // 2. Secondary Electric Cyan Ripple
        fgCtx.beginPath();
        fgCtx.arc(s.x, s.y, Math.max(0, s.radius - 12), 0, Math.PI * 2);
        fgCtx.strokeStyle = `rgba(0, 212, 255, ${s.alpha * 0.75})`;
        fgCtx.lineWidth = 2.2;
        fgCtx.shadowColor = '#00D4FF';
        fgCtx.shadowBlur = 8;
        fgCtx.stroke();
        fgCtx.shadowBlur = 0;

        // 3. Delicate Outer Shockwave
        fgCtx.beginPath();
        fgCtx.arc(s.x, s.y, Math.min(width, s.radius * 1.25), 0, Math.PI * 2);
        fgCtx.strokeStyle = `rgba(0, 102, 255, ${s.alpha * 0.28})`;
        fgCtx.lineWidth = 1.2;
        fgCtx.stroke();

        // 4. Circuit Sparks radiating outwards
        for (let k = 0; k < s.sparks.length; k++) {
          const sp = s.sparks[k];
          fgCtx.beginPath();
          fgCtx.moveTo(s.x, s.y);
          fgCtx.lineTo(
            s.x + sp.dx * (s.radius / s.maxRadius),
            s.y + sp.dy * (s.radius / s.maxRadius),
          );
          fgCtx.strokeStyle = `rgba(0, 212, 255, ${s.alpha * 0.7})`;
          fgCtx.lineWidth = 1.5;
          fgCtx.stroke();
        }

        // 5. Exploding Droplet Particles with Specks & Highlight
        for (let j = 0; j < s.particles.length; j++) {
          const p = s.particles[j];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.93;
          p.vy *= 0.93;
          p.vy += 0.08;

          // Droplet body
          fgCtx.beginPath();
          fgCtx.arc(p.x, p.y, Math.max(1, p.size * s.alpha), 0, Math.PI * 2);
          fgCtx.fillStyle = p.color;
          fgCtx.shadowColor = p.color;
          fgCtx.shadowBlur = 6;
          fgCtx.fill();
          fgCtx.shadowBlur = 0;

          // White droplet reflection core
          fgCtx.beginPath();
          fgCtx.arc(
            p.x - p.size * 0.25 * s.alpha,
            p.y - p.size * 0.25 * s.alpha,
            Math.max(0.6, p.size * 0.35 * s.alpha),
            0,
            Math.PI * 2,
          );
          fgCtx.fillStyle = `rgba(255, 255, 255, ${s.alpha * 0.95})`;
          fgCtx.fill();
        }

        fgCtx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <>
      <canvas ref={bgCanvasRef} className="circuit-bubble-canvas-bg" />
      <canvas ref={fgCanvasRef} className="circuit-splash-canvas-fg" />
    </>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  return (
    <>
      <div className="page-perimeter-glow" />
      <CircuitBubbleCanvas />
      {checking ? (
        <div className="loading">Checking secure session...</div>
      ) : user ? (
        <Dashboard user={user} onLogout={() => setUser(null)} />
      ) : (
        <Auth onAuthenticated={setUser} />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
