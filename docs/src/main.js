import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';

// Farcaster Mini App SDK via ESM CDN
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

// --- ✅ 1️⃣ Initialize Farcaster context
async function initSDK() {
  try {
    await sdk.actions.ready();
    log("✅ Farcaster SDK ready");
  } catch (e) {
    log("⚠️ Non-Farcaster environment, limited functionality");
  }
}
await initSDK();

// --- ✅ 2️⃣ Base provider setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

let cachedAddress = null;

// --- ✅ 3️⃣ Get Farcaster wallet address
async function getMyAddress() {
  if (cachedAddress) return cachedAddress;
  try {
    const w = await sdk.wallet.getAddress();
    if (w?.address) {
      cachedAddress = w.address;
      return cachedAddress;
    } else {
      throw new Error("Wallet unavailable");
    }
  } catch {
    log("⚠️ Connect via Farcaster client to sign");
    return null;
  }
}

// --- ✅ 4️⃣ Read clicks for user
async function refreshMyClicks(addr) {
  if (!addr) return;
  try {
    const v = await contract.getClicks(addr);
    document.getElementById('myClicks').textContent = v.toString();
  } catch (e) {
    log(`Error fetching clicks: ${e.message}`);
  }
}

// --- ✅ 5️⃣ Fetch leaderboard
async function leaderboard() {
  const el = document.getElementById('leaderboard');
  if (!BACKEND_ORIGIN) {
    el.innerHTML = "<div class='small'>Backend not configured</div>";
    return;
  }
  try {
    const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`);
    const data = await r.json();
    const rows = data.top
      .map((x, i) =>
        `<tr><td>${i + 1}</td><td class="mono">${x.user.slice(0, 6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`
      )
      .join("");
    el.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (e) {
    el.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
  }
}

// --- ✅ 6️⃣ Tap button: On-chain tx
document.getElementById('tap').addEventListener('click', async () => {
  const addr = await getMyAddress();
  if (!addr) {
    log("Connect via Farcaster client to sign");
    alert("⚠️ Please open this app inside Warpcast or a Farcaster MiniApp client.");
    return;
  }
  try {
    const tx = await sdk.wallet.sendTransaction({
      to: CONTRACT_ADDRESS,
      data: contract.interface.encodeFunctionData("tap", []),
      value: "0x0",
      chainId: 8453 // Base mainnet
    });
    document.getElementById('lastTx').textContent = tx.hash.slice(0, 10) + "…";
    log(`Sent tx: ${tx.hash}`);
    await provider.waitForTransaction(tx.hash, 1);
    await refreshMyClicks(addr);
  } catch (e) {
    log(`❌ Tx Error: ${e.message || e}`);
  }
});

// --- ✅ 7️⃣ Gasless tap (Paymaster backend)
document.getElementById('tapFree').addEventListener('click', async () => {
  const addr = await getMyAddress();
  if (!addr) { log("Connect via Farcaster client"); return; }
  if (!BACKEND_ORIGIN) { log("Sponsor backend not configured"); return; }
  try {
    const r = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: addr })
    });
    const data = await r.json();
    if (data.txHash) {
      document.getElementById('lastTx').textContent = data.txHash.slice(0, 10) + "…";
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

// --- ✅ 8️⃣ Init page data
const me = await getMyAddress();
await refreshMyClicks(me);
await leaderboard();
