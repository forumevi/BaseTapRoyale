// src/main.js
import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';

// 🔒 SDK sürümünü sabitle
const sdkUrl = 'https://esm.sh/@farcaster/miniapp-sdk@0.0.17';
const ethersUrl = 'https://esm.sh/ethers@6';

// DOM hazır olunca başla (event listener'ların kesin bağlanması için)
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const logEl = document.getElementById('log');
  const log = (m) => {
    if (!logEl) return;
    logEl.textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + logEl.textContent;
  };

  // SDK + ethers yükle
  let sdk, ethers;
  try {
    const [{ sdk: _sdk }, _ethers] = await Promise.all([import(sdkUrl), import(ethersUrl)]);
    sdk = _sdk;
    ethers = _ethers;
  } catch (e) {
    log(`❌ SDK import error: ${e?.message || e}`);
    return;
  }

  // Ortam bilgisi
  const inFarcaster = typeof window !== 'undefined' && !!window.farcaster;
  log(inFarcaster ? '📱 Farcaster environment detected' : '🌐 No Farcaster context (browser/preview)');

  // SDK ready
  try {
    await sdk.actions.ready();
    log('✅ Farcaster SDK ready');
  } catch {
    log('⚠️ SDK ready failed (non-Farcaster env)');
  }

  // Provider & contract
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function tap() external',
    'function tapFor(address user) external',
    'function getClicks(address user) view returns (uint256)',
    'event Clicked(address indexed user, uint256 total)'
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // Helpers
  async function requestAddressWithPrompt() {
    // 1) hızlı dene
    try {
      const w = await sdk.wallet.getAddress();
      if (w?.address) {
        log(`✅ Connected as ${w.address}`);
        return w.address;
      }
    } catch {}
    // 2) izin iste (SDK sürümüne göre değişebilir)
    try {
      if (sdk.wallet.requestPermissions) await sdk.wallet.requestPermissions();
      else if (sdk.wallet.connect) await sdk.wallet.connect();
      else if (sdk.wallet.requestAddress) await sdk.wallet.requestAddress();
    } catch (e) {
      log(`⚠️ Permission request failed: ${e?.message || e}`);
    }
    // 3) tekrar dene
    try {
      const w2 = await sdk.wallet.getAddress();
      if (w2?.address) {
        log(`✅ Connected as ${w2.address}`);
        return w2.address;
      }
    } catch {}
    // 4) olmadıysa net uyarı
    log('⚠️ Please open this app inside Warpcast → Open as Mini App (wallet required).');
    alert('Please open this app inside Warpcast → Open as Mini App (wallet required).');
    return null;
  }

  async function refreshMyClicks(addr) {
    if (!addr) return;
    try {
      const v = await contract.getClicks(addr);
      const el = document.getElementById('myClicks');
      if (el) el.textContent = v.toString();
    } catch (e) {
      log(`⚠️ Read clicks error: ${e?.message || e}`);
    }
  }

  async function loadLeaderboard() {
    const box = document.getElementById('leaderboard');
    if (!box) return;
    if (!BACKEND_ORIGIN) {
      box.innerHTML = "<div class='small'>Backend not configured</div>";
      return;
    }
    try {
      const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const rows = (data.top || [])
        .map((x, i) => `<tr><td>${i + 1}</td><td class="mono">${x.user.slice(0, 6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`)
        .join('');
      box.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) {
      box.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
      log(`⚠️ Leaderboard error: ${e?.message || e}`);
    }
  }

  // Button: TAP (on-chain tx)
  const tapBtn = document.getElementById('tap');
  if (tapBtn) {
    tapBtn.addEventListener('click', async () => {
      log('🖱️ TAP clicked');
      if (!inFarcaster) {
        log('⚠️ Not a Mini App context (this is Preview Tool / browser). Use Warpcast → Open as Mini App.');
        alert('Open in Warpcast → Open as Mini App to sign transactions.');
        return;
      }
      const addr = await requestAddressWithPrompt();
      if (!addr) return;
      try {
        const tx = await sdk.wallet.sendTransaction({
          to: CONTRACT_ADDRESS,
          data: contract.interface.encodeFunctionData('tap', []),
          value: '0x0',
          chainId: 8453 // Base mainnet
        });
        const lastTx = document.getElementById('lastTx');
        if (lastTx) lastTx.textContent = tx.hash.slice(0, 10) + '…';
        log(`🚀 Sent tx: ${tx.hash}`);
        await provider.waitForTransaction(tx.hash, 1);
        await refreshMyClicks(addr);
      } catch (e) {
        log(`❌ Tx error: ${e?.message || e}`);
      }
    });
  }

  // Button: Gasless TAP (backend sponsor)
  const tapFreeBtn = document.getElementById('tapFree');
  if (tapFreeBtn) {
    tapFreeBtn.addEventListener('click', async () => {
      log('🖱️ Gasless TAP clicked');
      if (!BACKEND_ORIGIN) {
        alert('Sponsor backend not configured');
        log('⚠️ Sponsor backend not configured');
        return;
      }
      // Farcaster şart değil; mock backend ise txHash döner
      try {
        const addr =
          inFarcaster ? (await requestAddressWithPrompt()) : '0x000000000000000000000000000000000000dEaD';
        const r = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: addr })
        });
        const data = await r.json();
        if (data.txHash) {
          const lastTx = document.getElementById('lastTx');
          if (lastTx) lastTx.textContent = data.txHash.slice(0, 10) + '…';
          log(`✅ Sponsored tx: ${data.txHash}`);
          try { await provider.waitForTransaction(data.txHash, 1); } catch {}
          if (inFarcaster && addr) await refreshMyClicks(addr);
        } else {
          log(`⚠️ Sponsor failed: ${JSON.stringify(data)}`);
        }
      } catch (e) {
        log(`❌ Sponsor err: ${e?.message || e}`);
      }
    });
  }

  // İlk yükleme
  await loadLeaderboard();
  // Preview Tool’da sessiz kalmasın diye butonların bağlı olduğunu logla
  log('🧩 UI ready (buttons wired).');
}
