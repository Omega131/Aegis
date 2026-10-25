import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/AppShell/AppLayout';
import { LivingCityPage } from './pages/city';
import { CamerasPage } from './pages/cameras';
import { DecoyPage } from './pages/decoy';
import { CampaignsPage } from './pages/campaigns';
import { SettingsPage } from './pages/settings';
import { HackerPovPage } from './pages/hacker';

function AppContent() {
  const { activeTab, setActiveTab } = useApp();

  const renderActiveRoute = () => {
    switch (activeTab) {
      case 'city':
        return <LivingCityPage />;
      case 'cameras':
        return <CamerasPage />;
      case 'decoy':
        return <DecoyPage />;
      case 'evidence':
      case 'campaigns':
        return <CampaignsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'hacker':
        return <HackerPovPage onNavigateTab={setActiveTab} />;
      default:
        return <LivingCityPage />;
    }
  };

  return <AppLayout>{renderActiveRoute()}</AppLayout>;
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
