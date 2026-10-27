// Peer-to-peer via PeerJS: lærerens browser er vært, eleverne forbinder direkte.
const PREFIX = 'klassequiz-arena-jnz-';
export const peerId = code => PREFIX + code;

export function peerOptions() {
  const o = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };
  const h = new URLSearchParams(location.search).get('peer'); // kun til test: ?peer=localhost:9000
  if (h) { const [host, port] = h.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false }); }
  return o;
}
export const p2pAvailable = () => typeof window.Peer === 'function';

export function openHost(code) {
  return new Promise((res, rej) => {
    if (!p2pAvailable()) return rej(new Error('nolib'));
    const p = new window.Peer(peerId(code), peerOptions());
    let done = false;
    const fail = e => { if (done) return; done = true; try { p.destroy(); } catch (x) { /* */ } rej(e); };
    p.on('open', () => { if (done) return; done = true; res(p); });
    p.on('error', fail);
    setTimeout(() => fail(new Error('timeout')), 15000);
  });
}

export class Client {
  constructor(code, { onData, onStatus }) {
    this.code = code; this.onData = onData; this.onStatus = onStatus;
    this.conn = null; this.dead = false; this.retryT = 0; this.tries = 0;
    this.peer = new window.Peer(peerOptions());
    this.peer.on('open', () => this.dial());
    this.peer.on('error', e => {
      if (this.dead) return;
      if (e && e.type === 'peer-unavailable') { this.onStatus('notfound'); this.retry(3000); }
      else if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed')) { this.onStatus('neterror'); this.retry(4000); }
      else { this.onStatus('error'); this.retry(4000); }
    });
    this.peer.on('disconnected', () => { if (!this.dead) { try { this.peer.reconnect(); } catch (x) { /* */ } } });
  }
  dial() {
    if (this.dead || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (x) { /* */ } this.retry(2500); return; }
    const c = this.peer.connect(peerId(this.code), { reliable: true });
    if (!c) { this.retry(2500); return; }
    c.on('open', () => { if (this.dead) return; this.conn = c; this.tries = 0; this.onStatus('open'); });
    c.on('data', d => { if (!this.dead && this.conn === c) this.onData(d); });
    c.on('close', () => { if (this.conn === c) { this.conn = null; if (!this.dead) { this.onStatus('lost'); this.retry(2000); } } });
    c.on('error', () => { if (this.conn === c) this.conn = null; });
  }
  retry(ms) {
    if (this.dead) return;
    clearTimeout(this.retryT);
    this.tries++;
    this.retryT = setTimeout(() => { if (!this.conn || !this.conn.open) this.dial(); }, Math.min(ms * Math.max(1, this.tries / 3), 8000));
  }
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); return true; } catch (e) { return false; } } return false; }
  close() { this.dead = true; clearTimeout(this.retryT); try { this.peer.destroy(); } catch (e) { /* */ } }
}
