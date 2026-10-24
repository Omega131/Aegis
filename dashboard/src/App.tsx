import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/AppShell/AppLayout';
import { LivingCityPage } from './pages/city';
import { CamerasPage } from './pages/cameras';
import { DecoyPage } from './pages/decoy';
import { CampaignsPage } from './pages/campaigns';
import { SettingsPage } from './pages/settings';

function AppContent() {
  const { activeTab } = useApp();

  const renderActiveRoute = () => {
    switch (activeTab) {
      case 'city':
        return <LivingCityPage />;
      case 'cameras':
        return <CamerasPage />;
      case 'decoy':
        return <DecoyPage />;
      case 'evidence':
        return <CampaignsPage />;
      case 'settings':
        return <SettingsPage />;
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
