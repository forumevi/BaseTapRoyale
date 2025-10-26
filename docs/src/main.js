// ✅ BaseTap Royale — Final Farcaster MiniApp Version (2025-10)
// Includes: sdk.ready fix + wallet permission flow + ABI sync with BaseTap.sol + fallback read

import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.0';
import { ethers } from 'https://esm.sh/ethers@6.8.0';

// 🟢 Initialize SDK early to remove splash screen hang
try {
  sdk.actions.ready();
  console.log('✅ SDK ready() called immediately');
} catch (e) {
  console.warn('⚠️ sdk.actions.ready() early call failed:', e);
}

// Detect Farcaster context
const inFarcaster =
  typeof window !== 'undefined' && !!window.farcaster;
console.log(inFarcaster ? '📱 Running inside Farcaster Mini App' : '🌐 Running in browser preview');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const logEl = document.getElementById('log');
  const log = (msg) => {
    if (logEl) {
      logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent;
    }
    console.log(msg);
  };

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // ✅ ABI now matches deployed BaseTap.sol
  const ABI = [
    'function tap() external',
    'function tapFor(address user) external',
    'function getClicks(address user) view returns (uint256)',
    'function clicks(address user) view returns (uint256)',
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // 🧩 FIXED: Farcaster wallet connect flow (new SDK permission system)
  async function getAddress() {
    try {
      const perms = await sdk.wallet.getPermissions?.();
      if (!perms || !perms.includes('eth_accounts')) {
        log('Requesting wallet permissions…');
        await sdk.wallet.requestPermissions?.(['eth_accounts']);
      }

      const w = await sdk.wallet.getAddress?.();
      if (w?.address) {
        log(`👛 Connected wallet: ${w.address}`);
        return w.address;
      }

      if (sdk.wallet.getEthereumProvider) {
        const provider = await sdk.wallet.getEthereumProvider();
        const accounts = await provider.request({
          method: 'eth_requestAccounts',
        });
        if (accounts.length > 0) {
          log(`👛 Connected via provider: ${accounts[0]}`);
          return accounts[0];
        }
      }

      throw new Error('Wallet unavailable');
    } catch (err) {
      log(`⚠️ getAddress error: ${err.message}`);
      alert('Please open this Mini App inside Warpcast and allow wallet access.');
      return null;
    }
  }

  // 🧠 Refresh clicks — with fallback for older ABI
  async function refreshMyClicks(addr) {
    if (!addr) return;
    try {
      let count;
      try {
        count = await contract.getClicks(addr);
      } catch {
        count = await contract.clicks(addr);
      }
      document.getElementById('myClicks').textContent = count.toString();
    } catch (err) {
      log(`❌ Read clicks error: ${err.message}`);
    }
  }

  // 🧠 Load leaderboard
  async function loadLeaderboard() {
    const box = document.getElementById('leaderboard');
    if (!box) return;
    if (!BACKEND_ORIGIN) {
      box.innerHTML = "<div class='small'>Backend not configured</div>";
      return;
    }
    try {
      const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const rows = (data.top || [])
        .map(
          (x, i) =>
            `<tr><td>${i + 1}</td><td>${x.user.slice(0, 6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`
        )
        .join('');
      box.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (err) {
      log(`⚠️ Leaderboard error: ${err.message}`);
      box.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
    }
  }

  // 🔌 Connect Wallet button
  const connectBtn = document.getElementById('connectBtn');
  connectBtn?.addEventListener('click', async () => {
    log('🔗 Connect Wallet clicked');
    const addr = await getAddress();
    if (addr) {
      alert(`Wallet connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
      await refreshMyClicks(addr);
    }
  });

  // 🔘 On-chain TAP
  const tapBtn = document.getElementById('tap');
  tapBtn?.addEventListener('click', async () => {
    log('🖱️ TAP clicked');
    if (!inFarcaster) {
      alert('Please open this app inside Warpcast to send onchain transactions.');
      return;
    }

    const addr = await getAddress();
    if (!addr) return;

    try {
      const tx = await sdk.wallet.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: contract.interface.encodeFunctionData('tap', []),
        value: '0x0',
        chainId: 8453,
      });

      document.getElementById('lastTx').textContent = tx.hash.slice(0, 10) + '…';
      log(`🚀 Tx sent: ${tx.hash}`);

      await provider.waitForTransaction(tx.hash, 1);
      await refreshMyClicks(addr);
    } catch (err) {
      log(`❌ Tx error: ${err.message}`);
    }
  });

  // 🔘 Gasless TAP (optional backend)
  const tapFreeBtn = document.getElementById('tapFree');
  tapFreeBtn?.addEventListener('click', async () => {
    log('🖱️ Gasless TAP clicked');
    if (!BACKEND_ORIGIN) {
      alert('Gasless sponsor API not configured.');
      return;
    }

    try {
      const addr = inFarcaster ? await getAddress() : '0x000000000000000000000000000000000000dEaD';
      const res = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: addr }),
      });

      const data = await res.json();
      if (data.txHash) {
        document.getElementById('lastTx').textContent = data.txHash.slice(0, 10) + '…';
        log(`✅ Sponsored tx: ${data.txHash}`);
        await provider.waitForTransaction(data.txHash, 1);
        await refreshMyClicks(addr);
      } else {
        log(`⚠️ Sponsor failed: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      log(`❌ Gasless error: ${err.message}`);
    }
  });

  // 🚀 Init done
  await loadLeaderboard();
  log('✅ UI ready — SDK initialized successfully.');
}
