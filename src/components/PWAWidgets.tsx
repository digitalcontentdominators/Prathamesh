import React, { useEffect, useState } from 'react';
import { Download, WifiOff, Share2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC<{ lang?: 'en' | 'mr'; compact?: boolean }> = ({
  lang = 'en',
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        aria-label={lang === 'mr' ? 'अ‍ॅप इन्स्टॉल करा' : 'Install App'}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{lang === 'mr' ? 'अ‍ॅप इन्स्टॉल' : 'Install App'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
          compact ? 'hidden sm:inline-flex' : ''
        }`}
        aria-label={lang === 'mr' ? 'मोबाईलवर इन्स्टॉल करा' : 'Install Mobile App'}
      >
        <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span>{isIOS ? 'Install on iOS' : lang === 'mr' ? 'अ‍ॅप इन्स्टॉल' : 'Install App'}</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 id="pwa-install-title" className="text-base font-bold text-slate-900">
                {lang === 'mr'
                  ? 'साई समर्थ ट्रेडिंग अ‍ॅप होम स्क्रीनवर जोडा'
                  : 'Install Sai Samarth Trading App'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Close install guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>
                {lang === 'mr'
                  ? 'हे वेब अ‍ॅप्लिकेशन तुमच्या मोबाईल किंवा कॉम्प्युटरवर अ‍ॅपसारखे वापरता येते:'
                  : 'Install this application on your mobile phone or desktop for fast 1-tap access at the weighbridge and shops:'}
              </p>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-2 text-xs">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Android Chrome / Desktop Chrome / Edge:</span>
                </p>
                <p>
                  Tap the browser menu <strong>(⋮)</strong> and choose{' '}
                  <strong>&ldquo;Add to Home screen&rdquo;</strong> or{' '}
                  <strong>&ldquo;Install app&rdquo;</strong>.
                </p>
                <p className="font-semibold text-slate-900 pt-2">iPhone / iPad (Safari):</p>
                <p>
                  Tap the <strong>Share</strong> button in the bottom toolbar and select{' '}
                  <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Unfinished purchase and sales drafts are automatically saved locally so you never
                lose weighbridge entries on refresh. Final posting requires server connectivity.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 min-h-[40px]"
              >
                {lang === 'mr' ? 'समजले (Close)' : 'Got It'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC<{ lang?: 'en' | 'mr' }> = ({ lang = 'en' }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-14 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 flex items-center gap-3 rounded-xl bg-amber-600 px-4 py-3 text-xs font-medium text-white shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <div>
        <div className="font-bold">
          {lang === 'mr'
            ? 'ऑफलाईन मोड — इंटरनेट कनेक्शन नाही'
            : 'Offline Mode — No Network Connection'}
        </div>
        <div className="text-amber-100 mt-0.5">
          {lang === 'mr'
            ? 'तुमचे अपूर्ण ड्राफ्ट सुरक्षित आहेत. फायनल पोस्टिंगसाठी इंटरनेट आवश्यक आहे.'
            : 'Unfinished drafts are saved locally. Final posting requires server connection.'}
        </div>
      </div>
    </div>
  );
};
