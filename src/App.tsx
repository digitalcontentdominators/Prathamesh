import React, { useCallback, useEffect, useState } from 'react';
import {
  Home,
  ShoppingBag,
  TrendingUp,
  Package,
  MoreHorizontal,
  Wallet,
  Building2,
  Users,
  FileBarChart,
  Settings,
  LogOut,
  Lock,
  X,
  Share2,
  Check,
} from 'lucide-react';
import type {
  ActiveTab,
  AppBootstrapData,
  EnvMode,
  LangMode,
  UserProfile,
  WeightUnit,
} from './types';
import { DashboardView } from './components/DashboardView';
import { PurchasesView } from './components/PurchasesView';
import { SalesView } from './components/SalesView';
import { StockView } from './components/StockView';
import { PaymentsAndPartiesView } from './components/PaymentsAndPartiesView';
import { ExpensesAndReportsView } from './components/ExpensesAndReportsView';
import { SettingsAndGuideView } from './components/SettingsAndGuideView';
import { PWAInstallButton, OfflineIndicator } from './components/PWAWidgets';
import { handleLocalApiFallback } from './utils/localApiFallback';

export const PUBLIC_SHARE_URL =
  'https://ais-pre-odsb6fgpxlu2blk27ngrpl-980300950913.asia-southeast1.run.app';

export default function App() {
  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem('saisamarth_auth_token') || 'token_owner_default';
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('owner');
  const [loginPassword, setLoginPassword] = useState<string>('saisamarth123');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [envMode, setEnvMode] = useState<EnvMode>(() => {
    const saved = localStorage.getItem('saisamarth_env_mode');
    return saved === 'real' ? 'real' : 'demo';
  });
  const [lang, setLang] = useState<LangMode>('en');
  const [displayUnit, setDisplayUnit] = useState<WeightUnit>('quintal');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);

  const [data, setData] = useState<AppBootstrapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);

  const handleShareLiveApp = async () => {
    const shareUrl =
      window.location.hostname.includes('localhost') ||
      window.location.hostname.includes('ais-dev-')
        ? PUBLIC_SHARE_URL
        : window.location.origin;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Sai Samarth Trading Company — Mobile Trading App',
          text: 'Open the Sai Samarth Trading Company commodity & stock application:',
          url: shareUrl,
        });
        return;
      }
    } catch {
      // Fallback to clipboard copy
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 3000);
    } catch {
      // ignore
    }
  };

  const apiRequest = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('X-App-Env', envMode);

      try {
        const res = await fetch(path, {
          ...options,
          headers,
        });

        const contentType = res.headers.get('content-type') || '';
        // If deployed on a static host like Netlify where /api/* returns HTML or 404, use client-side DB fallback
        if (res.status === 404 || !contentType.includes('application/json')) {
          return await handleLocalApiFallback<T>(path, options, envMode);
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || `Request failed with status ${res.status}`);
        }
        return json as T;
      } catch (err) {
        if (err instanceof TypeError) {
          // Network offline or static host without backend
          return await handleLocalApiFallback<T>(path, options, envMode);
        }
        throw err;
      }
    },
    [token, envMode]
  );

  const fetchBootstrap = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiRequest<AppBootstrapData>(`/api/bootstrap?env=${envMode}`);
      setData(res);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [apiRequest, envMode]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  const handleEnvChange = (nextEnv: EnvMode) => {
    localStorage.setItem('saisamarth_env_mode', nextEnv);
    setEnvMode(nextEnv);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      localStorage.setItem('saisamarth_auth_token', res.token);
      setToken(res.token);
      setShowLoginModal(false);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleQuickRoleSwitch = async (u: string, p: string) => {
    setLoginUsername(u);
    setLoginPassword(p);
    try {
      const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
      });
      localStorage.setItem('saisamarth_auth_token', res.token);
      setToken(res.token);
      setShowLoginModal(false);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  };

  const navItems: Array<{ id: ActiveTab; labelEn: string; labelMr: string }> = [
    { id: 'dashboard', labelEn: 'Dashboard', labelMr: 'डॅशबोर्ड' },
    { id: 'purchases', labelEn: 'Purchases', labelMr: 'खरेदी' },
    { id: 'sales', labelEn: 'Sales', labelMr: 'विक्री' },
    { id: 'stock', labelEn: 'Stock', labelMr: 'स्टॉक' },
    { id: 'payments', labelEn: 'Payments', labelMr: 'पेमेंट' },
    { id: 'expenses', labelEn: 'Expenses', labelMr: 'खर्च' },
    { id: 'parties', labelEn: 'Parties', labelMr: 'खातेवही' },
    { id: 'reports', labelEn: 'Reports', labelMr: 'रिपोर्ट्स' },
    { id: 'settings', labelEn: 'Settings', labelMr: 'सेटिंग्ज' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-slate-900 pb-20 md:pb-10 overflow-x-hidden">
      <OfflineIndicator lang={lang} />

      {/* Strict 3-Zone Top Bar Contract with Deep Green Navigation */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 px-3.5 sm:px-6 h-14 bg-emerald-950 text-white border-b border-emerald-900">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          {lang === 'mr' ? 'साई समर्थ ट्रेडिंग कंपनी' : 'Sai Samarth Trading Co.'}
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-emerald-100/85"
        >
          {[
            { id: 'dashboard' as const, en: 'Dashboard', mr: 'डॅशबोर्ड' },
            { id: 'purchases' as const, en: 'Purchases', mr: 'खरेदी' },
            { id: 'sales' as const, en: 'Sales', mr: 'विक्री' },
            { id: 'stock' as const, en: 'Stock', mr: 'स्टॉक' },
            { id: 'reports' as const, en: 'Reports', mr: 'रिपोर्ट्स' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === item.id
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              {lang === 'mr' ? item.mr : item.en}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className="px-3 sm:px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 min-h-[38px]"
          >
            {lang === 'mr' ? '+ नवीन खरेदी' : '+ New Purchase'}
          </button>
        </div>
      </header>

      {/* Secondary Workspace Control Strip (Below Top Bar) */}
      <div className="no-print bg-emerald-900 text-emerald-50 border-b border-emerald-800 px-3 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Desktop All-9-Screens Tab Bar */}
          <div className="hidden md:flex items-center gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'bg-emerald-950 text-amber-300 font-semibold border border-emerald-700'
                    : 'text-emerald-100 hover:bg-emerald-800 hover:text-white'
                }`}
              >
                {lang === 'mr' ? item.labelMr : item.labelEn}
              </button>
            ))}
          </div>

          {/* Environment Switcher, Unit Switcher, Language Switcher, User Role & PWA Install */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* Environment Switcher (Demo vs Real Business) */}
            <div
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700"
              role="group"
              aria-label="Database Environment Mode"
            >
              <button
                type="button"
                onClick={() => handleEnvChange('demo')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  envMode === 'demo'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {lang === 'mr' ? 'डेमो मोड' : 'Demo DB'}
              </button>
              <button
                type="button"
                onClick={() => handleEnvChange('real')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  envMode === 'real'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {lang === 'mr' ? 'प्रत्यक्ष व्यवसाय' : 'Real Business DB'}
              </button>
            </div>

            {/* Weight Display Unit Toggle (Quintal / Kg) */}
            <button
              type="button"
              onClick={() => setDisplayUnit((prev) => (prev === 'quintal' ? 'kg' : 'quintal'))}
              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-mono font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
              title="Toggle display between Quintals (100 kg) and Kilograms"
            >
              Unit: {displayUnit === 'quintal' ? 'Qtl + kg' : 'kg only'}
            </button>

            {/* English / Marathi Toggle */}
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'mr' : 'en'))}
              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-semibold text-emerald-300 hover:bg-slate-700 whitespace-nowrap"
            >
              {lang === 'en' ? 'मराठी / EN' : 'English / म'}
            </button>

            {/* User & Role Switcher Button */}
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
            >
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>
                {data?.user.username || 'owner'} ({data?.user.role.toUpperCase() || 'OWNER'})
              </span>
            </button>

            <button
              type="button"
              onClick={handleShareLiveApp}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400 text-emerald-950 text-[11px] font-bold hover:bg-amber-300 whitespace-nowrap"
              title="Copy or share the public live application URL"
            >
              {copiedShareLink ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3 h-3" />
                  <span>{lang === 'mr' ? 'लाईव्ह लिंक शेअर करा' : 'Share Live Link'}</span>
                </>
              )}
            </button>

            <PWAInstallButton lang={lang} compact />
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading && !data ? (
          <div className="space-y-4">
            <div className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="h-28 rounded-2xl bg-slate-200/70 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200/70 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200/70 animate-pulse" />
              <div className="h-28 rounded-2xl bg-slate-200/70 animate-pulse" />
            </div>
          </div>
        ) : loadError || !data ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center space-y-3">
            <p className="text-sm font-bold text-red-900">
              Unable to load trading data: {loadError}
            </p>
            <button
              type="button"
              onClick={fetchBootstrap}
              className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === 'purchases' && (
              <PurchasesView
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'sales' && (
              <SalesView
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'stock' && (
              <StockView
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'payments' && (
              <PaymentsAndPartiesView
                mode="payments"
                data={data}
                lang={lang}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'parties' && (
              <PaymentsAndPartiesView
                mode="parties"
                data={data}
                lang={lang}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'expenses' && (
              <ExpensesAndReportsView
                mode="expenses"
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'reports' && (
              <ExpensesAndReportsView
                mode="reports"
                data={data}
                lang={lang}
                displayUnit={displayUnit}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsAndGuideView
                data={data}
                lang={lang}
                envMode={envMode}
                onEnvChange={handleEnvChange}
                apiRequest={apiRequest}
                onRefresh={fetchBootstrap}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation: Home, Purchases, Sales, Stock, More */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-16 px-1"
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('dashboard');
            setMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'dashboard' && !mobileMoreOpen
              ? 'text-emerald-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-1">{lang === 'mr' ? 'होम' : 'Home'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('purchases');
            setMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'purchases' && !mobileMoreOpen
              ? 'text-emerald-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[10px] mt-1">{lang === 'mr' ? 'खरेदी' : 'Purchases'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('sales');
            setMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'sales' && !mobileMoreOpen
              ? 'text-emerald-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="text-[10px] mt-1">{lang === 'mr' ? 'विक्री' : 'Sales'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('stock');
            setMobileMoreOpen(false);
          }}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            activeTab === 'stock' && !mobileMoreOpen
              ? 'text-emerald-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] mt-1">{lang === 'mr' ? 'स्टॉक' : 'Stock'}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileMoreOpen((prev) => !prev)}
          className={`flex flex-col items-center justify-center min-h-[48px] ${
            mobileMoreOpen ||
            ['payments', 'expenses', 'parties', 'reports', 'settings'].includes(activeTab)
              ? 'text-emerald-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-1">{lang === 'mr' ? 'अधिक' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile "More" Drawer Sheet */}
      {mobileMoreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="More Navigation Options"
        >
          <div className="w-full rounded-t-3xl bg-white p-5 pb-20 border-t border-slate-200 space-y-3">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-2" />
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">
                {lang === 'mr' ? 'सर्व विभाग (All Modules)' : 'More Trading Modules'}
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="p-2 text-slate-500"
                aria-label="Close More Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: 'payments' as const,
                  label: lang === 'mr' ? 'पेमेंट व वसुली' : 'Payments & Collections',
                  icon: Wallet,
                },
                {
                  id: 'expenses' as const,
                  label: lang === 'mr' ? 'दुकान व गोदाम खर्च' : 'Expenses & Rent',
                  icon: Building2,
                },
                {
                  id: 'parties' as const,
                  label: lang === 'mr' ? 'शेतकरी व ग्राहक खातेवही' : 'Party Ledgers',
                  icon: Users,
                },
                {
                  id: 'reports' as const,
                  label: lang === 'mr' ? 'नफा-तोटा व रिपोर्ट्स' : 'Reports & Exports',
                  icon: FileBarChart,
                },
                {
                  id: 'settings' as const,
                  label: lang === 'mr' ? 'सेटिंग्ज व बॅकअप' : 'Settings & Owner Guide',
                  icon: Settings,
                },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(m.id);
                      setMobileMoreOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3.5 rounded-2xl border text-left text-xs font-semibold min-h-[52px] ${
                      activeTab === m.id
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="pt-2 flex justify-between items-center">
              <PWAInstallButton lang={lang} />
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setShowLoginModal(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 px-3 py-2 rounded-lg border border-slate-200"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Switch Role / Login</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login & Role Switcher Modal */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 id="login-modal-title" className="text-base font-bold text-slate-900">
                  Sai Samarth Trading Co. — Role Login
                </h3>
                <p className="text-xs text-slate-500">
                  Server-side role permissions: Owner, Staff (Assigned Shop), or Viewer (Read-Only)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700"
                aria-label="Close login modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                {loginError}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">
                Quick Role Switch (For Testing Permissions):
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('owner', 'saisamarth123')}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 text-xs font-semibold text-slate-900 text-center"
                >
                  <div>Owner</div>
                  <div className="text-[10px] text-slate-500 font-normal">Full Access</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('staff', 'staff123')}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 text-xs font-semibold text-slate-900 text-center"
                >
                  <div>Staff</div>
                  <div className="text-[10px] text-slate-500 font-normal">Shop 1 Entry</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickRoleSwitch('viewer', 'viewer123')}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 text-xs font-semibold text-slate-900 text-center"
                >
                  <div>Viewer</div>
                  <div className="text-[10px] text-slate-500 font-normal">Read-Only</div>
                </button>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="login-user" className="block text-xs font-medium text-slate-700 mb-1">
                  Username
                </label>
                <input
                  id="login-user"
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="login-pass" className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  id="login-pass"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 min-h-[42px]"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
