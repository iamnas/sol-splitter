import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
// import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
// import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
// import { clusterApiUrl } from '@solana/web3.js';
import App from './App.tsx';
import './index.css';

// const endpoint = clusterApiUrl('devnet');
// const wallets = [new PhantomWalletAdapter()];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider> */}
          <App />
        {/* </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider> */}
  </StrictMode>
);