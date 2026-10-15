const $ = s => document.querySelector(s);
const page = document.body.dataset.page;

/* ---------- Fundo: faíscas verdes ---------- */
(() => {
  const c = $('#fx'), x = c.getContext('2d'); let w, h, p = [];
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight;
    p = Array.from({ length: Math.min(70, w / 14) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2.2 + .6, v: Math.random() * .6 + .2 })); };
  size(); addEventListener('resize', size);
  (function loop() {
    x.clearRect(0, 0, w, h);
    const col = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#39ff14';
    x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 10;
    p.forEach(o => { o.y -= o.v; if (o.y < -5) { o.y = h + 5; o.x = Math.random() * w; }
      x.globalAlpha = .25 + o.r / 4; x.beginPath(); x.arc(o.x, o.y, o.r, 0, 7); x.fill(); });
    requestAnimationFrame(loop);
  })();
})();

const toast = (t, err) => { const e = $('#toast'); e.textContent = t; e.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 3200); };
const omni = $('#omni'); omni?.addEventListener('click', () => { omni.classList.add('spin'); setTimeout(() => omni.classList.remove('spin'), 700); });
const go = url => { $('#flash').classList.add('on'); setTimeout(() => location.href = url, 650); };
const api = async (url, body, token) => {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.erro || 'Erro de conexão.'), { status: r.status }); return d;
};

/* ---------- Cadastro / Login ---------- */
if (page === 'cadastro' || page === 'login') {
  if (page === 'login') { const e = new URLSearchParams(location.search).get('email'); if (e) $('#email').value = e; }
  $('#form').addEventListener('submit', async ev => {
    ev.preventDefault(); const btn = ev.submitter; btn.disabled = true;
    const body = Object.fromEntries(
      ['usuario', 'email', 'senha']
        .filter(k => $('#' + k))
        .map(k => [k, $('#' + k).value.trim()])
    );
    try {
      if (page === 'cadastro') { await api('/api/cadastro', body); toast('Conta criada! Vamos ao login.'); omni.classList.add('spin'); setTimeout(() => go('login.html?email=' + encodeURIComponent(body.email)), 700); }
      else { const d = await api('/api/login', body); localStorage.setItem('b10', JSON.stringify(d)); go('chat.html'); }
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  });
}

/* ---------- Chat ---------- */
if (page === 'chat') {
  const s = JSON.parse(localStorage.getItem('b10') || 'null');
  if (!s) location.replace('login.html');
  const ALIENS = [
    { id: 'ben', n: 'Ben Tennyson', e: '🧑', c: '#39ff14', hi: 'E aí! Eu sou o Ben. Qual alien você quer ver em ação?' },
    { id: 'quatro', n: 'Quatro Braços', e: '💪', c: '#ff4d4d', hi: 'QUATRO BRAÇOS! Pergunte, mas sem me irritar!' },
    { id: 'xlr8', n: 'XLR8', e: '⚡', c: '#4da6ff', hi: 'XLR8! Fala logo, não tenho o dia todo!' },
    { id: 'diamante', n: 'Diamante', e: '💎', c: '#7df9ff', hi: 'Diamante. Calmo, firme e brilhante. Pode perguntar.' },
    { id: 'chama', n: 'Chama', e: '🔥', c: '#ff9d1c', hi: 'Chama! Cuidado, a conversa vai esquentar!' },
    { id: 'fantasmatico', n: 'Fantasmático', e: '👻', c: '#c084fc', hi: 'Buuu! Sou o Fantasmático. Atravessei a parede só pra te ouvir.' }
  ];
  const CHIPS = ['Como funciona o Omnitrix?', 'Quem é o Vilgax?', 'Qual o alien mais forte?', 'Me conte uma piada!'];
  let cur = ALIENS[0], hist = [], busy = false;
  const box = $('#msgs');
  $('#hello').textContent = 'Olá, ' + s.usuario + '!';
  $('#logout').onclick = () => { localStorage.removeItem('b10'); location.href = 'login.html'; };

  const add = (t, who, cls = '') => { const d = document.createElement('div'); d.className = `m ${who} ${cls}`; d.textContent = t; box.appendChild(d); box.scrollTop = box.scrollHeight; return d; };
  const pick = a => {
    cur = a; hist = []; document.documentElement.style.setProperty('--accent', a.c);
    $('#alien-name').textContent = a.n; document.querySelectorAll('.al').forEach(b => b.classList.toggle('on', b.dataset.id === a.id));
    omni.classList.add('spin'); setTimeout(() => omni.classList.remove('spin'), 700);
    box.innerHTML = ''; add(a.hi, 'bot');
  };
  ALIENS.forEach(a => { const b = document.createElement('button'); b.className = 'al'; b.dataset.id = a.id; b.style.setProperty('--c', a.c);
    b.textContent = a.e + ' ' + a.n; b.onclick = () => pick(a); $('#aliens').appendChild(b); });
  CHIPS.forEach(t => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => send(t); $('#chips').appendChild(b); });

  async function send(text) {
    text = text.trim(); if (!text || busy) return; busy = true;
    add(text, 'me'); hist.push({ role: 'user', content: text }); $('#msg').value = '';
    const t = add('', 'bot'); t.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    try {
      const d = await api('/api/chat', { messages: hist, alien: cur.id }, s.token);
      t.textContent = d.answer; hist.push({ role: 'assistant', content: d.answer });
    } catch (e) {
      if (e.status === 401) { localStorage.removeItem('b10'); location.href = 'login.html'; return; }
      t.textContent = e.message; t.classList.add('err'); hist.pop();
    }
    busy = false; box.scrollTop = box.scrollHeight;
  }
  $('#form').addEventListener('submit', e => { e.preventDefault(); send($('#msg').value); });
  api('/api/me', null, s.token).then(() => pick(ALIENS[0])).catch(() => { localStorage.removeItem('b10'); location.replace('login.html'); });
}
