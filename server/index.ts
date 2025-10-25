import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ORIGIN_ALLOW?.split(',') || true }));

const RPC_URL = process.env.RPC_URL!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const SPONSOR_PK = process.env.SPONSOR_PRIVATE_KEY || "";
const MAX_LOGS = parseInt(process.env.MAX_LOGS || "10000", 10);

const provider = new ethers.JsonRpcProvider(RPC_URL);

const ABI = [
  "function tapFor(address user) external",
  "event Clicked(address indexed user, uint256 total)"
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const iface = new ethers.Interface(ABI);
    const topic = iface.getEvent("Clicked").topicHash;
    const latest = await provider.getBlockNumber();
    const from = Math.max(0, latest - 1_000_000); // ~safety window
    const logs = await provider.getLogs({
      address: CONTRACT_ADDRESS,
      topics: [topic],
      fromBlock: from,
      toBlock: latest
    });

    const counts = new Map<string, number>();
    for (let i = Math.max(0, logs.length - MAX_LOGS); i < logs.length; i++) {
      const l = logs[i];
      const ev = iface.decodeEventLog("Clicked", l.data, l.topics);
      const user = (ev.user as string).toLowerCase();
      const total = Number(ev.total);
      counts.set(user, Math.max(counts.get(user)||0, total));
    }

    const top = Array.from(counts.entries())
      .map(([user, total]) => ({ user, total }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 20);

    res.json({ top, totalPlayers: counts.size });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/api/tap-sponsor', async (req, res) => {
  try {
    if (!SPONSOR_PK) return res.status(400).json({ error: "Sponsor disabled" });
    const { user } = req.body || {};
    if (!user || !ethers.isAddress(user)) return res.status(400).json({ error: "Invalid user" });

    const wallet = new ethers.Wallet(SPONSOR_PK, provider);
    const sponsorContract = contract.connect(wallet);
    const tx = await sponsorContract.tapFor(user);
    res.json({ txHash: tx.hash });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Server on :${port}`);
});
