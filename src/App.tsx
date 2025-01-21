// App.tsx
import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react'
import { solanaDevnet } from '@reown/appkit/networks'
// import SendSol from './component/SendSol'
import Splitter from './component/Splitter'

// 0. Set up Solana Adapter
const solanaWeb3JsAdapter = new SolanaAdapter({
  wallets: []
})

// 1. Get projectId from https://cloud.reown.com
const projectId = import.meta.env.VITE_REOWN_API

// 2. Create a metadata object - optional
const metadata = {
  name: 'AppKit',
  description: 'AppKit Solana Example',
  url: 'https://example.com', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932']

}

// 3. Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solanaDevnet],
  metadata: metadata,
  defaultNetwork:solanaDevnet,
  projectId,
  features: {
    analytics: true // Optional - defaults to your Cloud configuration
  }
  
})

export default function App() {
  return (<div>
    <Splitter />
  </div>);
}
