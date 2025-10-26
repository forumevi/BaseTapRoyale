import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.0';
import { ethers } from 'https://esm.sh/ethers@6.8.0';

const inFarcaster = typeof window !== 'undefined' && !!window.farcaster;
console.log('Context:', inFarcaster ? 'Farcaster' : 'Browser');

document.addEventListener('DOMContentLoaded', async () => {
  const logEl = document.getElementById('log');
  const log = (m) => {
    const t = new Date().toLocaleTimeString();
    const text = `[${t}] ${m}\n`;
    if (logEl) logEl.textContent = text + logEl.textContent;
    console.log(m);
  };

  // ✅ Splash kaldırma ve SDK hazır bekleme
  async function initFarcaster() {
    let tries = 0;
    while ((!window.farcaster || !sdk?.actions) && tries < 40) {
      await new Promise(r => setTimeout(r, 300));
      tries++;
    }
    try {
      await sdk.actions.ready();
      log('✅ sdk.actions.ready() called — splash screen hidden');
      if (sdk?.wallet?.switchChain) {
        try { await sdk.wallet.switchChain(8453); } catch {}
      }
    } catch (e) {
      log('⚠ Farcaster ready() failed: ' + e.message);
    }
  }
  initFarcaster();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function tap() external',
    'function getClicks(address) view returns (uint256)',
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  async function checkContractCode() {
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (!code || code === '0x') {
      log('❌ Contract not found at address');
      return false;
    }
    return true;
  }

  // 🔐 Wallet bağlantısı (mobil ve browser fixli)
  async function getAddress() {
    try {
      // 1️⃣ Farcaster ortamında
      if (sdk?.wallet) {
        await sdk.actions.ready();

        // wallet injection bekle
        let retries = 0;
        while ((!sdk.wallet.getAddress || !sdk.wallet.requestPermissions) && retries < 20) {
          await new Promise(r => setTimeout(r, 300));
          retries++;
        }

        // izin iste
        const perms = await sdk.wallet.getPermissions?.();
        if (!perms?.includes('eth_accounts')) {
          await sdk.wallet.requestPermissions?.(['eth_accounts']);
        }

        // adres al
        const w = await sdk.wallet.getAddress?.();
        if (w?.address) {
          log(`👛 Farcaster wallet connected: ${w.address}`);
          return w.address;
        }
      }

      // 2️⃣ MetaMask fallback
      if (typeof window !== 'undefined' && window.ethereum) {
        const baseChainId = '0x2105';
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        if (chain !== baseChainId) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: baseChainId }]
            });
          } catch (err) {
            if (err.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: baseChainId,
                  chainName: 'Base Mainnet',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }]
              });
            }
          }
        }
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts?.[0]) {
          log(`🦊 MetaMask wallet connected: ${accounts[0]}`);
          return accounts[0];
        }
      }

      throw new Error('No wallet available');
    } catch (err) {
      log(`⚠ getAddress error: ${err.message}`);
      alert('Please open in Warpcast and grant wallet permissions (or use MetaMask in browser).');
      return null;
    }
  }

  async function refreshMyClicks(addr) {
    if (!addr) return;
    if (!(await checkContractCode())) return;
    const count = await contract.getClicks(addr);
    document.getElementById('myClicks').textContent = count.toString();
    log(`↺ clicks: ${count}`);
  }

  document.getElementById('connectBtn')?.addEventListener('click', async () => {
    const addr = await getAddress();
    if (addr) {
      alert(`Wallet connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
      await refreshMyClicks(addr);
    }
  });

  document.getElementById('tap')?.addEventListener('click', async () => {
    const addr = await getAddress();
    if (!addr) return;

    if (inFarcaster && sdk?.wallet?.sendTransaction) {
      const tx = await sdk.wallet.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: contract.interface.encodeFunctionData('tap', []),
        value: '0x0',
        chainId: 8453
      });
      document.getElementById('lastTx').textContent = tx.hash.slice(0, 10) + '…';
      log(`🚀 SDK tx sent: ${tx.hash}`);
      await provider.waitForTransaction(tx.hash, 1);
      await refreshMyClicks(addr);
      return;
    }

    if (window.ethereum) {
      const ep = new ethers.BrowserProvider(window.ethereum);
      const signer = await ep.getSigner();
      const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const txResp = await contractWithSigner.tap();
      document.getElementById('lastTx').textContent = txResp.hash.slice(0, 10) + '…';
      log(`🚀 Fallback tx: ${txResp.hash}`);
      await txResp.wait?.(1);
      await refreshMyClicks(addr);
    }
  });

  const splash = document.getElementById('splash');
  if (splash) splash.src = "https://base-tap-royale.vercel.app/assets/splash.png";

  log('✅ UI ready — DOM loaded & Farcaster initialized.');
});
