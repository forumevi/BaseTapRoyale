# BaseTap Royale — Farcaster Mini App (Mainnet / Base)
Minimal, viral clicker game for Farcaster Mini Apps that records taps on **Base**.
Includes:
- Solidity contract (`ClickGame.sol`) with normal `tap()` and sponsored `tapFor(address)`
- Static frontend (HTML + JS) Mini App
- Optional Node server for leaderboard and sponsored taps
- Foundry deployment script

> Optional gas sponsor: run the server and set a funded SPONSOR_PRIVATE_KEY. The contract allows `tapFor(user)` by the sponsor to simulate gasless taps.

## Quick Start

### 1) Contracts (Foundry)
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup

# in this folder
forge install
forge build

# set env and deploy to Base mainnet
export BASE_RPC_URL="https://mainnet.base.org"
export PRIVATE_KEY="0x...deployerPrivKey"
forge script script/Deploy.s.sol:Deploy \
  --broadcast --rpc-url $BASE_RPC_URL --private-key $PRIVATE_KEY
```

Copy the contract address it prints and put into `.env` files below.

### 2) Frontend (static)
Edit `frontend/src/config.js` and set `CONTRACT_ADDRESS` and `RPC_URL`. Then serve the folder:
```bash
cd frontend
python3 -m http.server 8080
# open http://localhost:8080
```

### 3) Leaderboard + Sponsor Server (optional)
```bash
cd server
cp .env.example .env
# edit .env (RPC, CONTRACT, SPONSOR_PRIVATE_KEY, ORIGIN_ALLOW)
npm i
npm run dev   # or: npm run build && npm start
```
Endpoints:
- `GET /api/leaderboard` — computes top users from `Clicked` events
- `POST /api/tap-sponsor` — body: `{ "user": "0xUser" }` — calls `tapFor(user)` using sponsor key

### 4) Farcaster Mini App
Host the frontend publicly and set the Mini App manifest URL to the hosted origin (see `frontend/miniapp.json`).

---

## Files
- `contracts/ClickGame.sol`
- `script/Deploy.s.sol`
- `frontend/index.html`
- `frontend/miniapp.json`
- `frontend/src/config.js`
- `frontend/src/main.js`
- `abi/ClickGame.json`
- `server/index.ts` (Express API)
- `server/package.json`

**Security note:** `tapFor` is for demo gasless flow. In production, prefer ERC‑4337 Paymaster or meta-tx with signature verification.
