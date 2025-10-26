import { RPC_URL, CONTRACT_ADDRESS, BACKEND_ORIGIN } from './config.js';
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.0';
import { ethers } from 'https://esm.sh/ethers@6.8.0';

// --- Farcaster SDK hazır olana kadar bekle ---
async function waitForFarcasterReady() {
  let retries = 0;
  while ((!window.farcaster || !sdk?.actions) && retries < 20) {
    await new Promise(r => setTimeout(r, 250));
    retries++;
  }
  try {
    await sdk.actions.ready();
    console.log('✅ sdk.actions.ready() called after environment was ready');
  } catch (e) {
    console.warn('⚠ sdk.actions.ready() failed after retries:', e);
  }
}
waitForFarcasterReady();

const inFarcaster = typeof window !== 'undefined' && !!window.farcaster;
console.log('Context:', inFarcaster ? 'Farcaster' : 'Browser');

document.addEventListener('DOMContentLoaded', init);

async function init(){
  const logEl = document.getElementById('log');
  const log = (m)=>{
    const t = new Date().toLocaleTimeString();
    const text = `[${t}] ${m}\n`;
    if(logEl) logEl.textContent = text + logEl.textContent;
    console.log(m);
  };

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const ABI = ['function tap() external', 'function getClicks(address) view returns (uint256)'];
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  async function checkContractCode(){
    try{
      const code = await provider.getCode(CONTRACT_ADDRESS);
      log(`📦 contract code length: ${code.length}`);
      if(!code || code === '0x'){
        log('❌ No contract deployed at CONTRACT_ADDRESS (getCode returned 0x). Update config.CONTRACT_ADDRESS.');
        return false;
      }
      return true;
    } catch(err){
      log(`❌ getCode error: ${err.message}`);
      return false;
    }
  }

  // ✅ SDK wallet hazır bekleme eklendi
  async function getAddress(){
    try{
      // wallet API hazır mı, değilse bekle
      let retries = 0;
      while ((!sdk.wallet || !sdk.wallet.getAddress) && retries < 15) {
        await new Promise(r => setTimeout(r, 300));
        retries++;
      }

      if(sdk?.wallet?.getPermissions){
        const perms = await sdk.wallet.getPermissions?.();
        log(`🔐 current perms: ${JSON.stringify(perms)}`);
        if(!perms || !perms.includes('eth_accounts')){
          log('Requesting wallet permissions via SDK…');
          await sdk.wallet.requestPermissions?.(['eth_accounts']);
        }
        const w = await sdk.wallet.getAddress?.();
        if(w?.address){ log(`👛 SDK wallet address: ${w.address}`); return w.address; }
      }

      if(typeof window !== 'undefined' && window.ethereum){
        log('🔁 Falling back to window.ethereum provider');
        const winProv = window.ethereum;
        const accounts = await winProv.request({ method: 'eth_requestAccounts' });
        if(accounts && accounts.length) {
          log(`👛 Connected via provider: ${accounts[0]}`);
          return accounts[0];
        }
      }

      throw new Error('No wallet available');
    } catch(err){
      log(`⚠ getAddress error: ${err.message}`);
      alert('Please open in Warpcast and grant wallet permissions (or use MetaMask in browser).');
      return null;
    }
  }

  async function refreshMyClicks(addr){
    if(!addr) return;
    if(!(await checkContractCode())) return;
    try{
      const count = await contract.getClicks(addr);
      document.getElementById('myClicks').textContent = count.toString();
      log(`↺ clicks: ${count.toString()}`);
    } catch(err){
      log(`❌ Read clicks error: ${err.message}`);
    }
  }

  document.getElementById('connectBtn')?.addEventListener('click', async ()=>{
    log('🔗 Connect Wallet clicked');
    const addr = await getAddress();
    if(addr){ alert(`Wallet connected: ${addr.slice(0,6)}...${addr.slice(-4)}`); await refreshMyClicks(addr); }
  });

  document.getElementById('tap')?.addEventListener('click', async ()=>{
    log('🖱️ TAP clicked');
    const addr = await getAddress();
    if(!addr) return;

    if(inFarcaster && sdk?.wallet?.sendTransaction){
      try{
        if(!(await checkContractCode())) return;
        const tx = await sdk.wallet.sendTransaction({
          to: CONTRACT_ADDRESS,
          data: contract.interface.encodeFunctionData('tap', []),
          value: '0x0',
          chainId: 8453
        });
        document.getElementById('lastTx').textContent = tx.hash.slice(0,10) + '…';
        log(`🚀 SDK tx sent: ${tx.hash}`);
        await provider.waitForTransaction(tx.hash, 1);
        await refreshMyClicks(addr);
      } catch(err){
        log(`❌ SDK tx error: ${err.message}`);
      }
      return;
    }

    if(typeof window !== 'undefined' && window.ethereum){
      try{
        if(!(await checkContractCode())) return;
        const ep = new ethers.BrowserProvider(window.ethereum);
        const signer = await ep.getSigner();
        const contractWithSigner = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        const txResp = await contractWithSigner.tap();
        log(`🚀 Fallback tx sent (provider): ${txResp.hash || txResp}`);
        document.getElementById('lastTx').textContent = (txResp.hash||'tx').slice(0,10) + '…';
        await txResp.wait?.(1);
        await refreshMyClicks(addr);
      } catch(err){
        log(`❌ fallback tx error: ${err.message}`);
      }
      return;
    }

    alert('Onchain transactions require Warpcast/Farcaster wallet or MetaMask in browser.');
  });

  document.getElementById('tapFree')?.addEventListener('click', async ()=>{
    log('🖱️ Gasless TAP clicked');
    if(!BACKEND_ORIGIN){ alert('Backend not configured'); return; }
    try{
      const addr = (inFarcaster) ? await getAddress() : '0x000000000000000000000000000000000000dEaD';
      const res = await fetch(`${BACKEND_ORIGIN}/api/tap-sponsor`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user: addr })
      });
      const data = await res.json();
      if(data.txHash){ document.getElementById('lastTx').textContent = data.txHash.slice(0,10)+'…'; log(`✅ Sponsored tx: ${data.txHash}`); await provider.waitForTransaction(data.txHash,1); await refreshMyClicks(addr); }
      else log(`⚠ Sponsor failed: ${JSON.stringify(data)}`);
    } catch(err){ log(`❌ Gasless error: ${err.message}`); }
  });

  await (async ()=>{
    log('✅ UI ready — SDK initialized.');
    await loadLeaderboard().catch(e=>log('leader load err:'+e.message));
  })();

  async function loadLeaderboard(){
    const box = document.getElementById('leaderboard');
    if(!box) return;
    if(!BACKEND_ORIGIN){ box.innerHTML = "<div class='small'>Backend not configured</div>"; return; }
    try{
      const r = await fetch(`${BACKEND_ORIGIN}/api/leaderboard`, { cache: 'no-store' });
      if(!r.ok) throw new Error(r.status);
      const data = await r.json();
      const rows = (data.top||[]).map((x,i)=>`<tr><td>${i+1}</td><td>${x.user.slice(0,6)}…${x.user.slice(-4)}</td><td>${x.total}</td></tr>`).join('');
      box.innerHTML = `<table><thead><tr><th>#</th><th>User</th><th>Taps</th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch(err){
      log(`⚠️ Leaderboard error: ${err.message}`);
      box.innerHTML = "<div class='small'>Leaderboard unavailable</div>";
    }
  }

  // ✅ Splash görseli absolute URL ile eklendi
  const splash = document.getElementById('splash');
  if (splash) splash.src = "https://base-tap-royale.vercel.app/assets/splash.png";
}
