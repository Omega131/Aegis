import { useState } from 'react'
import { Layout, type NavTab } from './shell'
import { LivingCityPage } from './pages/city'
import { ConsolePage } from './pages/console'
import { CamerasPage } from './pages/cameras'
import { DecoyPage } from './pages/decoy'
import { CampaignsPage } from './pages/campaigns'

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('city')

  if (activeTab === 'city') {
    return <LivingCityPage onNavigateTab={setActiveTab} />
  }

  if (activeTab === 'console') {
    return <ConsolePage onNavigateTab={setActiveTab} />
  }

  const renderActivePage = () => {
    switch (activeTab) {
      case 'cameras':
        return <CamerasPage />
      case 'decoy':
        return <DecoyPage />
      case 'campaigns':
        return <CampaignsPage />
      default:
        return <LivingCityPage onNavigateTab={setActiveTab} />
    }
  }

  return (
    <Layout activeTab={activeTab} onSelectTab={setActiveTab}>
      {renderActivePage()}
    </Layout>
  )
}

export default App
