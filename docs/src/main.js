import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';

// Farcaster Mini Apps SDK via ESM CDN
const sdkUrl = 'https://esm.sh/@farcaster/miniapp-sdk';
const ethersUrl = 'https://esm.sh/ethers@6';

const [{ sdk }, ethers] = await Promise.all([import(sdkUrl), import(ethersUrl)]);

const ABI = [
  "function tap() external",
  "function tapFor(address user) external",
  "function getClicks(address user) view returns (uint256)",
  "event Clicked(address indexed user, uint256 total)"
];

const log = (m) => {
  const el = document.getElementById('log');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + el.textContent;
};

async function ready() {
  try {
    await sdk.actions.ready();
  } catch (e) {
    // non-Farcaster environment fallback
  }
}
await ready();

// Base provider (read)
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

async function getMyAddress() {
  try {
    const w = await sdk.wallet.getAddress();
    return w.address;
  } catch (e) {
    // fallback: no Farcaster wallet; prompt for injected provider in future versions
    return null;
  }
}

async function refreshMyClicks(addr) {
  if (!addr) return;
  const v = await contract.getClicks(addr);
  document.getElementById('myClicks').textContent = v.toString();
}

async function leaderboard() {
  const el = document.getElementById('leaderboard');
  if (!BACKEND_ORIGIN) {
    el.innerHTML = "<div class='small'>Backend not configured</div>";
    return;
  }
  try {
    const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`);
    const data = await r.json();
    const rows = data.top.map((x, i) => `<tr><td>${i+1}</td><td class="mono">${x.user.slice(0,6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`).join("");
    el.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (e) {
    el.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
  }
}

document.getElementById('tap').addEventListener('click', async () => {
  const addr = await getMyAddress();
  if (!addr) { log("Connect via Farcaster client to sign"); return; }
  try {
    // request signature via Farcaster wallet
    const tx = await sdk.wallet.sendTransaction({
      to: CONTRACT_ADDRESS,
      data: contract.interface.encodeFunctionData("tap", []),
      value: "0x0",
      chainId: 8453, // Base mainnet
    });
    document.getElementById('lastTx').textContent = tx.hash.slice(0,10)+"…";
    log(`Sent tx: ${tx.hash}`);
    await provider.waitForTransaction(tx.hash, 1);
    await refreshMyClicks(addr);
  } catch (e) {
    log(`Error: ${e.message || e}`);
  }
});

document.getElementById('tapFree').addEventListener('click', async () => {
  const addr = await getMyAddress();
  if (!addr) { log("Connect via Farcaster client"); return; }
  if (!BACKEND_ORIGIN) { log("Sponsor backend not configured"); return; }
  try {
    const r = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ user: addr })
    });
    const data = await r.json();
    if (data.txHash) {
      document.getElementById('lastTx').textContent = data.txHash.slice(0,10)+"…";
      log(`Sponsored tx: ${data.txHash}`);
      await provider.waitForTransaction(data.txHash, 1);
      await refreshMyClicks(addr);
    } else {
      log(`Sponsor failed: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    log(`Sponsor err: ${e.message || e}`);
  }
});

// init
const me = await getMyAddress();
await refreshMyClicks(me);
await leaderboard();
