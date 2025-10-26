// ✅ BaseTap Royale — Farcaster MiniApp (fixed ready issue)
// Fortune MiniApp pattern applied

import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.0';
import { ethers } from 'https://esm.sh/ethers@6.8.0';

// 🔹 Call ready() immediately (fix splash issue)
try {
  sdk.actions.ready();
  console.log('✅ SDK ready() called immediately');
} catch (e) {
  console.warn('⚠️ sdk.actions.ready() failed early:', e);
}

// 🔹 Detect environment
const inFarcaster = typeof window !== 'undefined' && !!window.farcaster;
console.log(inFarcaster ? '📱 Farcaster Mini App context' : '🌐 Browser / Preview context');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const logEl = document.getElementById('log');
  const log = (m) => {
    if (logEl) logEl.textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + logEl.textContent;
    console.log(m);
  };

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function tap() external',
    'function getClicks(address user) view returns (uint256)'
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // 🧠 Helper: get Farcaster wallet address
  async function getAddress() {
    try {
      const w = await sdk.wallet.getAddress();
      if (w?.address) return w.address;
    } catch {}
    try {
      if (sdk.wallet.requestPermissions) await sdk.wallet.requestPermissions();
      const w2 = await sdk.wallet.getAddress();
      if (w2?.address) return w2.address;
    } catch (e) {
      log(`⚠️ getAddress error: ${e?.message}`);
    }
    log('⚠️ Wallet unavailable — open inside Warpcast.');
    alert('Please open this Mini App inside Warpcast to use your wallet.');
    return null;
  }

  // 🧠 Helper: refresh user taps
  async function refreshMyClicks(addr) {
    if (!addr) return;
    try {
      const v = await contract.getClicks(addr);
      document.getElementById('myClicks').textContent = v.toString();
    } catch (e) {
      log(`Read clicks error: ${e.message}`);
    }
  }

  // 🧠 Helper: fetch leaderboard
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
        .map((x, i) => `<tr><td>${i + 1}</td><td>${x.user.slice(0, 6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`)
        .join('');
      box.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) {
      box.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
      log(`Leaderboard fetch error: ${e.message}`);
    }
  }

  // 🔘 TAP button (on-chain)
  const tapBtn = document.getElementById('tap');
  tapBtn?.addEventListener('click', async () => {
    log('🖱️ TAP clicked');
    if (!inFarcaster) {
      alert('Open this app inside Warpcast → Open as Mini App to send transactions.');
      return;
    }
    const addr = await getAddress();
    if (!addr) return;
    try {
      const tx = await sdk.wallet.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: contract.interface.encodeFunctionData('tap', []),
        value: '0x0',
        chainId: 8453
      });
      document.getElementById('lastTx').textContent = tx.hash.slice(0, 10) + '…';
      log(`🚀 Sent tx: ${tx.hash}`);
      await provider.waitForTransaction(tx.hash, 1);
      await refreshMyClicks(addr);
    } catch (e) {
      log(`❌ Tx error: ${e.message}`);
    }
  });

  // 🔘 Gasless TAP button (backend sponsor)
  const tapFreeBtn = document.getElementById('tapFree');
  tapFreeBtn?.addEventListener('click', async () => {
    log('🖱️ Gasless TAP clicked');
    if (!BACKEND_ORIGIN) {
      alert('Backend not configured for gasless mode.');
      return;
    }
    try {
      const addr = inFarcaster ? await getAddress() : '0x000000000000000000000000000000000000dEaD';
      const res = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: addr })
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
    } catch (e) {
      log(`❌ Gasless error: ${e.message}`);
    }
  });

  // Load leaderboard
  await loadLeaderboard();
  log('🧩 UI ready — SDK initialized.');
}
