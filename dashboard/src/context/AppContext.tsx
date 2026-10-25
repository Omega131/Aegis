import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, type SystemHealth } from '../api/client';

export type NavRoute = 'city' | 'cameras' | 'decoy' | 'evidence' | 'campaigns' | 'settings' | 'hacker';

export interface ToastMessage {
  id: string;
  title: string;
  desc?: string;
  type: 'production' | 'deception' | 'danger' | 'success' | 'review';
}

export interface SelectedDeviceContext {
  id: string;
  name: string;
  type: 'camera' | 'signal' | 'power' | 'sensor' | 'gateway';
  status: string;
  district?: string;
  fps?: number;
  encryptedCrops?: number;
  lastEvent?: string;
}

interface AppContextValue {
  activeTab: NavRoute;
  setActiveTab: (tab: NavRoute) => void;
  selectedDevice: SelectedDeviceContext | null;
  setSelectedDevice: (dev: SelectedDeviceContext | null) => void;
  selectedSessionId: string | null;
  setSelectedSessionId: (sid: string | null) => void;
  selectedCaseId: string | null;
  setSelectedCaseId: (cid: string | null) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  motionReduced: boolean;
  setMotionReduced: (reduced: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  systemHealth: SystemHealth | null;
  toasts: ToastMessage[];
  addToast: (title: string, desc?: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  navigateToOperationalDevice: (deviceId: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTabState] = useState<NavRoute>(() => {
    const hash = window.location.hash.replace('#', '') as NavRoute;
    if (['city', 'cameras', 'decoy', 'evidence', 'escrow', 'audit', 'settings'].includes(hash)) {
      return hash;
    }
    return 'city';
  });

  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('aegismirage_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light'; // Default to pristine light green theme
  });

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('aegismirage_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  // Sync data-theme attribute on mount & change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [selectedDevice, setSelectedDevice] = useState<SelectedDeviceContext | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [motionReduced, setMotionReduced] = useState<boolean>(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Update URL hash on tab switch for direct link & browser back/forward support
  const setActiveTab = useCallback((tab: NavRoute) => {
    setActiveTabState(tab);
    window.location.hash = tab;
  }, []);

  // Listen for hash change in window
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as NavRoute;
      if (['city', 'cameras', 'decoy', 'evidence', 'escrow', 'audit', 'settings'].includes(hash)) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Toast helper
  const addToast = useCallback((title: string, desc?: string, type: ToastMessage['type'] = 'production') => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, title, desc, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Jump smoothly from city or device inspector directly to the relevant operational screen
  const navigateToOperationalDevice = useCallback((deviceId: string) => {
    const lower = deviceId.toLowerCase();
    if (lower.includes('cam') || lower.includes('sentry')) {
      setActiveTab('cameras');
    } else if (lower.includes('gw') || lower.includes('decoy') || lower.includes('twin')) {
      setActiveTab('decoy');
    } else if (lower.includes('pwr') || lower.includes('env') || lower.includes('sig')) {
      setActiveTab('cameras');
    }
  }, [setActiveTab]);

  // Periodic health check
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const health = await api.getHealth();
        if (mounted) setSystemHealth(health);
      } catch {
        // silent catch
      }
    };
    check();
    const interval = setInterval(check, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        selectedDevice,
        setSelectedDevice,
        selectedSessionId,
        setSelectedSessionId,
        selectedCaseId,
        setSelectedCaseId,
        inspectorOpen,
        setInspectorOpen,
        motionReduced,
        setMotionReduced,
        theme,
        setTheme,
        toggleTheme,
        systemHealth,
        toasts,
        addToast,
        removeToast,
        navigateToOperationalDevice,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
