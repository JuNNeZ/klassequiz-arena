// Peer-to-peer via PeerJS: lærerens browser er vært, eleverne forbinder direkte.
// Lukkede netværk: falder tilbage til et TURN-relæ (Open Relay) over port 443/80.
const PREFIX = 'klassequiz-arena-jnz-';
export const peerId = code => PREFIX + code;
export const p2pAvailable = () => typeof window.Peer === 'function';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
let turnCache = null;
// Open Relay "static auth": midlertidigt brugernavn + HMAC af den offentlige nøgle
async function turnServers() {
  if (turnCache && turnCache.exp > Date.now() + 3600e3) return turnCache.list;
  try {
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const username = exp + ':klassequiz';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('openrelayprojectsecret'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
    let bin = ''; sig.forEach(b => { bin += String.fromCharCode(b); });
    const credential = btoa(bin);
    const h = 'staticauth.openrelay.metered.ca';
    const list = [{ urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`], username, credential }];
    turnCache = { exp: exp * 1000, list };
    return list;
  } catch (e) { return []; }
}

export async function peerOptions(relayOnly = false) {
  const o = { debug: 0, config: { iceServers: [...STUN, ...(await turnServers())] } };
  if (relayOnly) o.config.iceTransportPolicy = 'relay';
  const h = new URLSearchParams(location.search).get('peer'); // kun til test: ?peer=localhost:9000
  if (h) { const [host, port] = h.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false }); }
  return o;
}

export async function openHost(code) {
  if (!p2pAvailable()) throw new Error('nolib');
  const opts = await peerOptions();
  return new Promise((res, rej) => {
    const p = new window.Peer(peerId(code), opts);
    let done = false;
    const fail = e => { if (done) return; done = true; try { p.destroy(); } catch (x) { /* */ } rej(e); };
    p.on('open', () => { if (done) return; done = true; res(p); });
    p.on('error', fail);
    setTimeout(() => fail(new Error('timeout')), 15000);
  });
}

/* Elevens forbindelse med genforsøg, tidsgrænse og relæ-fallback.
   onStatus(st, diag): st = connecting | open | lost | notfound | neterror
   diag = { server: 'wait'|'ok'|'fail', host: 'wait'|'try'|'ok'|'fail', tries, relay } */
export class Client {
  constructor(code, { onData, onStatus }) {
    this.code = code; this.onData = onData; this.onStatus = onStatus;
    this.conn = null; this.dead = false; this.retryT = 0; this.openT = 0; this.fails = 0; this.relay = false;
    this.diag = { server: 'wait', host: 'wait', tries: 0, relay: false, turn: 'wait' };
    this.makePeer();
  }
  emit(st) { if (!this.dead) this.onStatus(st, { ...this.diag }); }
  async makePeer() {
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* */ } }
    const opts = await peerOptions(this.relay);
    if (this.dead) return;
    const peer = this.peer = new window.Peer(opts);
    this.diag.server = 'wait'; this.emit('connecting');
    peer.on('open', () => { if (peer !== this.peer) return; this.diag.server = 'ok'; this.dial(); });
    peer.on('error', e => {
      if (this.dead || peer !== this.peer) return;
      const t = e && e.type;
      if (t === 'peer-unavailable') { this.diag.host = 'fail'; this.emit('notfound'); this.retry(3000); }
      else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') { this.diag.server = 'fail'; this.emit('neterror'); this.retry(4000, true); }
      else { this.emit('neterror'); this.retry(4000); }
    });
    peer.on('disconnected', () => { if (!this.dead && peer === this.peer && !peer.destroyed) { try { peer.reconnect(); } catch (x) { /* */ } } });
  }
  dial() {
    if (this.dead || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (x) { /* */ } this.retry(2500); return; }
    this.diag.tries++; this.diag.host = 'try'; this.diag.relay = this.relay; this.emit('connecting');
    const c = this.peer.connect(peerId(this.code), { reliable: true });
    if (!c) { this.retry(2500); return; }
    clearTimeout(this.openT);
    // Ingen "open" efter 12 s = den direkte forbindelse er blokeret. Prøv igen, og skift til relæ.
    this.openT = setTimeout(() => {
      if (this.dead || (this.conn && this.conn.open)) return;
      try { c.close(); } catch (e) { /* */ }
      this.failed();
    }, 12000);
    c.on('open', () => {
      if (this.dead) return;
      clearTimeout(this.openT);
      this.conn = c; this.fails = 0; this.diag.host = 'ok'; this.emit('open');
    });
    c.on('data', d => { if (!this.dead && this.conn === c) this.onData(d); });
    c.on('close', () => { if (this.conn === c) { this.conn = null; if (!this.dead) { this.emit('lost'); this.retry(1500); } } });
    c.on('error', () => { /* close følger */ });
    try {
      const pc = c.peerConnection;
      if (pc) {
        pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed' && !(this.conn && this.conn.open)) { clearTimeout(this.openT); this.failed(); } });
        // Kan enheden nå relæserveren? Den skal bruges, når skolens net blokerer direkte forbindelser.
        pc.addEventListener('icecandidate', ev => { const cd = ev.candidate; if (cd && / typ relay/.test(cd.candidate || '') && this.diag.turn !== 'ok') { this.diag.turn = 'ok'; if (!(this.conn && this.conn.open)) this.emit('connecting'); } });
        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete' && this.diag.turn !== 'ok') { this.diag.turn = 'fail'; if (!(this.conn && this.conn.open)) this.emit('connecting'); } });
      }
    } catch (e) { /* */ }
  }
  failed() {
    this.fails++; this.diag.host = 'fail';
    this.emit('connecting');
    if (this.fails >= 2 && !this.relay) { this.relay = true; this.makePeer(); return; }
    this.retry(1500);
  }
  retry(ms, newPeer) {
    if (this.dead) return;
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => {
      if (this.conn && this.conn.open) return;
      if (newPeer || !this.peer || this.peer.destroyed) this.makePeer(); else this.dial();
    }, ms);
  }
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); return true; } catch (e) { return false; } } return false; }
  close() { this.dead = true; clearTimeout(this.retryT); clearTimeout(this.openT); try { this.peer.destroy(); } catch (e) { /* */ } }
}
