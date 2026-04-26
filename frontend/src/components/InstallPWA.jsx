import React, { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

// Detects iOS
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !window.MSStream;

// Detects if already installed as PWA
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

export default function InstallPWA() {
  const [installPrompt, setInstallPrompt] = useState(null); // Android/Chrome
  const [showIOSGuide, setShowIOSGuide]   = useState(false);
  const [dismissed, setDismissed]         = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (isInstalled()) return;

    // Don't show if user dismissed in this session
    if (sessionStorage.getItem('pwa_dismissed')) return;

    // Android / Chrome — intercept the native install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS — show manual guide after 3 seconds
    if (isIOS() && !sessionStorage.getItem('pwa_dismissed')) {
      const timer = setTimeout(() => setShowIOSGuide(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handler);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
    else handleDismiss();
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa_dismissed', '1');
    setInstallPrompt(null);
    setShowIOSGuide(false);
    setDismissed(true);
  };

  if (dismissed) return null;

  // ── Android / Chrome install banner ─────────────────────────────────────────
  if (installPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
            <img src="/pwa-64x64.png" alt="App icon" className="w-10 h-10 rounded-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm">Install App</div>
            <div className="text-gray-500 text-xs">Add CleanCruisers to your home screen for quick access</div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={handleInstall}
              className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              <Download className="w-3 h-3" /> Install
            </button>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 text-xs text-center"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS Safari guide ─────────────────────────────────────────────────────────
  if (showIOSGuide) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="bg-white border-t border-gray-200 shadow-2xl rounded-t-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary-600" />
              <span className="font-semibold text-gray-900 text-sm">Add to Home Screen</span>
            </div>
            <button onClick={handleDismiss} className="p-1 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <p className="text-gray-600 text-xs mb-3">Install this app on your iPhone for quick booking access:</p>
          <div className="flex items-center gap-3 text-xs text-gray-700">
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
              <span className="text-lg">1</span>
              <span>Tap the <strong>Share</strong> button <span className="text-lg">⎙</span> at the bottom</span>
            </div>
            <div className="text-gray-300">→</div>
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
              <span className="text-lg">2</span>
              <span>Tap <strong>"Add to Home Screen"</strong></span>
            </div>
          </div>
          {/* Down arrow pointing to Safari share button */}
          <div className="flex justify-center mt-3">
            <div className="text-primary-500 text-2xl animate-bounce">↓</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
