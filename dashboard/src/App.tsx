import { useState } from 'react'
import { Layout, type NavTab } from './shell'
import { CamerasPage } from './pages/cameras'
import { DecoyPage } from './pages/decoy'
import { CampaignsPage } from './pages/campaigns'
import { HackerPovPage } from './pages/hacker'

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('cameras')

  const renderActivePage = () => {
    switch (activeTab) {
      case 'cameras':
        return <CamerasPage />
      case 'decoy':
        return <DecoyPage />
      case 'campaigns':
        return <CampaignsPage />
      case 'hacker':
        return <HackerPovPage onNavigateTab={setActiveTab} />
      default:
        return <CamerasPage />
    }
  }

  return (
    <Layout activeTab={activeTab} onSelectTab={setActiveTab}>
      {renderActivePage()}
    </Layout>
  )
}

export default App
