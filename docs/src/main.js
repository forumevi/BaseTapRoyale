// src/main.js
import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';

const sdkUrl = 'https://esm.sh/@farcaster/miniapp-sdk@0.0.17';
const ethersUrl = 'https://esm.sh/ethers@6';

document.addEventListener('DOMContentLoaded', async () => {
  const log = (m) => {
    const el = document.getElementById('log');
    if (el) el.textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + el.textContent;
  };

  let sdk, ethers;
  try {
    const [{ sdk: _sdk }, _ethers] = await Promise.all([import(sdkUrl), import(ethersUrl)]);
    sdk = _sdk;
    ethers = _ethers;
  } catch (e) {
    log(`❌ SDK import error: ${e?.message || e}`);
    return;
  }

  // ✅ Ready çağrısı (Splash screen fix)
  try {
    await sdk.actions.ready();
    log('✅ Farcaster SDK ready');
  } catch (e) {
    log('⚠️ Ready failed (probably non-Farcaster env)');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = [
    'function tap() external',
    'function getClicks(address user) view returns (uint256)',
  ];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  // ————————————————————————————
  // Helpers
  async function getAddress() {
    try {
      const w = await sdk.wallet.getAddress();
      if (w?.address) return w.address;
    } catch {}
    try {
      if (sdk.wallet.requestPermissions) await sdk.wallet.requestPermissions();
      else if (sdk.wallet.connect) await sdk.wallet.connect();
      else if (sdk.wallet.requestAddress) await sdk.wallet.requestAddress();
    } catch (e) {
      log(`⚠️ Wallet connect failed: ${e?.message || e}`);
    }
    try {
      const w2 = await sdk.wallet.getAddress();
      if (w2?.address) return w2.address;
    } catch {}
    alert('Please open this app inside Warpcast → “Open as Mini App” to use wallet.');
    log('⚠️ Please open inside Warpcast or Farcaster MiniApp client.');
    return null;
  }

  async function refreshMyClicks(addr) {
    if (!addr) return;
    try {
      const v = await contract.getClicks(addr);
      document.getElementById('myClicks').textContent = v.toString();
    } catch (e) {
      log(`⚠️ Click read failed: ${e?.message || e}`);
    }
  }

  async function loadLeaderboard() {
    const el = document.getElementById('leaderboard');
    if (!BACKEND_ORIGIN) {
      el.innerHTML = "<div class='small'>Backend not configured</div>";
      return;
    }
    try {
      const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`, { cache: 'no-store' });
      const data = await r.json();
      const rows = (data.top || [])
        .map((x, i) => `<tr><td>${i + 1}</td><td class="mono">${x.user.slice(0, 6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`)
        .join('');
      el.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch {
      el.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
    }
  }

  // ————————————————————————————
  // Connect Wallet
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const addr = await getAddress();
      if (addr) {
        connectBtn.textContent = `Connected`;
        log(`✅ Wallet: ${addr}`);
        await refreshMyClicks(addr);
      }
    });
  }

  // ————————————————————————————
  // TAP
  const tapBtn = document.getElementById('tap');
  tapBtn?.addEventListener('click', async () => {
    log('🖱️ TAP clicked');
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
      log(`🚀 Sent tx: ${tx.hash}`);
      await provider.waitForTransaction(tx.hash, 1);
      await refreshMyClicks(addr);
    } catch (e) {
      log(`❌ Tx error: ${e?.message || e}`);
    }
  });

  // ————————————————————————————
  // Gasless TAP
  const tapFreeBtn = document.getElementById('tapFree');
  tapFreeBtn?.addEventListener('click', async () => {
    log('🪙 Gasless TAP clicked');
    if (!BACKEND_ORIGIN) {
      alert('Backend not configured');
      return;
    }
    const addr = await getAddress();
    if (!addr) return;
    try {
      const r = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: addr }),
      });
      const data = await r.json();
      if (data.txHash) {
        document.getElementById('lastTx').textContent = data.txHash.slice(0, 10) + '…';
        log(`✅ Sponsored tx: ${data.txHash}`);
        await provider.waitForTransaction(data.txHash, 1);
        await refreshMyClicks(addr);
      } else {
        log(`⚠️ Sponsor failed: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      log(`❌ Sponsor err: ${e?.message || e}`);
    }
  });

  // ————————————————————————————
  // Init
  await loadLeaderboard();
  log('🧩 UI ready (buttons wired)');
});
