import * as db from './db.js';
import { scoreOf, computeStandings, computeLeaders, generateRoundRobin } from './stats.js';
import { ADMIN_EMAIL } from './config.js';

const MAX_PLAYERS = 25;
const DEFAULT_TITLE = 'Insider One Cup';

const state = { teams: [], matches: [], settings: {}, user: null, teamsLoaded: false, matchesLoaded: false };
const app = document.getElementById('app');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');

let currentView = null;
let modalUpdate = null;

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => crypto.randomUUID().slice(0, 8);
const loaded = () => state.teamsLoaded && state.matchesLoaded;
const teamById = (id) => state.teams.find((t) => t.id === id);
const teamName = (id) => teamById(id)?.name ?? 'Silinmiş takım';
const sortedTeams = () => [...state.teams].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

function playerName(id) {
  for (const t of state.teams) {
    const p = (t.players || []).find((x) => x.id === id);
    if (p) return p.name;
  }
  return 'Bilinmiyor';
}

function fmtDate(s) {
  if (!s) return 'Tarih belirlenmedi';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3000);
}

async function run(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(`Hata: ${e.message}`, true);
    return false;
  }
}

function fillTeamSelect(select, placeholder) {
  const prev = select.value;
  select.innerHTML =
    `<option value="">${esc(placeholder)}</option>` +
    sortedTeams().map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  if (teamById(prev)) select.value = prev;
}

// ---------- admin (Google sign-in, enforced by firestore.rules) ----------

const isAdmin = () => Boolean(ADMIN_EMAIL) && state.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

async function requireAdmin() {
  if (isAdmin()) return true;
  if (!ADMIN_EMAIL) {
    toast('Yönetici e-postası js/config.js içinde tanımlı değil.', true);
    return false;
  }
  try {
    const user = await db.signIn();
    state.user = user;
    if (isAdmin()) return true;
    await db.signOut();
    toast('Bu Google hesabı yönetici değil.', true);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(`Giriş başarısız: ${e.message}`, true);
  }
  return false;
}

// ---------- shared renderers ----------

function matchRow(m) {
  const s = scoreOf(m);
  const played = m.status === 'played';
  const showScore = played || (m.goals || []).length > 0;
  return `
    <button class="match ${played ? 'played' : ''}" data-match="${esc(m.id)}">
      <span class="m-meta">${esc(fmtDate(m.date))}${m.pitch ? ` · ${esc(m.pitch)}` : ''}${!played && showScore ? ' · <b>devam ediyor</b>' : ''}</span>
      <span class="m-line">
        <span class="home">${esc(teamName(m.homeTeamId))}</span>
        <span class="score">${showScore ? `${s.home} - ${s.away}` : 'vs'}</span>
        <span class="away">${esc(teamName(m.awayTeamId))}</span>
      </span>
    </button>`;
}

const matchList = (list, empty) => (list.length ? `<div class="matches">${list.map(matchRow).join('')}</div>` : `<p class="muted">${empty}</p>`);

function standingsTable() {
  const rows = computeStandings(state.teams, state.matches);
  if (!rows.length) return '<p class="muted">Henüz takım yok.</p>';
  return `
    <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th class="left">Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>Y</th><th>AV</th><th>P</th></tr></thead>
      <tbody>${rows
        .map(
          (r, i) => `<tr>
            <td>${i + 1}</td>
            <td class="left"><button class="link" data-team="${esc(r.teamId)}">${esc(r.name)}</button></td>
            <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
            <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.points}</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
}

function leadersTable(field, unit) {
  const rows = computeLeaders(state.teams, state.matches, field);
  if (!rows.length) return `<p class="muted">Henüz ${unit} yok.</p>`;
  return `<table class="leaders"><tbody>${rows
    .map((r, i) => `<tr><td>${i + 1}</td><td class="left"><b>${esc(r.name)}</b><br><span class="muted">${esc(r.teamName)}</span></td><td class="pts">${r.count}</td></tr>`)
    .join('')}</tbody></table>`;
}

// ---------- views ----------

const views = {
  '': {
    mount() {
      app.innerHTML = `
        <section class="card"><h2>Puan Durumu</h2><div id="standings"></div></section>
        <div class="grid-2">
          <section class="card"><h2>Sıradaki Maçlar</h2><div id="upcoming"></div></section>
          <section class="card"><h2>Son Sonuçlar</h2><div id="recent"></div></section>
        </div>`;
    },
    update() {
      document.getElementById('standings').innerHTML = standingsTable();
      const upcoming = state.matches.filter((m) => m.status !== 'played').sort(byDate).slice(0, 5);
      const recent = state.matches.filter((m) => m.status === 'played').sort(byDate).reverse().slice(0, 5);
      document.getElementById('upcoming').innerHTML = matchList(upcoming, 'Planlanmış maç yok.');
      document.getElementById('recent').innerHTML = matchList(recent, 'Henüz oynanan maç yok.');
    },
  },

  maclar: {
    mount() {
      app.innerHTML = `
        <section class="card">
          <h2>Maç Ekle</h2>
          <form id="match-form" class="form-grid">
            <label>Ev sahibi<select name="home" required></select></label>
            <label>Deplasman<select name="away" required></select></label>
            <label>Tarih & saat<input type="datetime-local" name="date"></label>
            <label>Saha<input name="pitch" maxlength="40" placeholder="ör. Saha 1"></label>
            <button class="btn primary">Ekle</button>
          </form>
          <p class="muted small">Tüm fikstürü tek seferde oluşturmak için <a href="#/yonetim">Yönetim</a> sayfasını kullan.</p>
        </section>
        <section class="card"><h2>Oynanacak Maçlar</h2><div id="upcoming"></div></section>
        <section class="card"><h2>Oynanmış Maçlar</h2><div id="played"></div></section>`;

      document.getElementById('match-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        if (f.home.value === f.away.value) return toast('Bir takım kendisiyle oynayamaz.', true);
        const ok = await run(
          () => db.addMatch({ homeTeamId: f.home.value, awayTeamId: f.away.value, date: f.date.value, pitch: clean(f.pitch.value, 40) }),
          'Maç eklendi.',
        );
        if (ok) f.reset();
      });
    },
    update() {
      const f = document.getElementById('match-form');
      fillTeamSelect(f.home, 'Takım seç');
      fillTeamSelect(f.away, 'Takım seç');
      const upcoming = state.matches.filter((m) => m.status !== 'played').sort(byDate);
      const played = state.matches.filter((m) => m.status === 'played').sort(byDate).reverse();
      document.getElementById('upcoming').innerHTML = matchList(upcoming, 'Planlanmış maç yok.');
      document.getElementById('played').innerHTML = matchList(played, 'Henüz oynanan maç yok.');
    },
  },

  takimlar: {
    mount() {
      app.innerHTML = `
        <section class="card">
          <h2>Takımını Kaydet</h2>
          <form id="team-form" class="stack">
            <div class="form-grid">
              <label>Takım adı<input name="name" required maxlength="40"></label>
              <label>Kaptan<input name="captain" maxlength="40"></label>
            </div>
            <label>Oyuncular <span class="muted">(her satıra bir isim, en fazla ${MAX_PLAYERS})</span>
              <textarea name="players" rows="6" placeholder="Ahmet Yılmaz&#10;Mehmet Kaya&#10;..."></textarea>
            </label>
            <button class="btn primary">Takımı Kaydet</button>
          </form>
        </section>
        <section class="card"><h2>Kayıtlı Takımlar <span id="team-count" class="muted"></span></h2><div id="team-list" class="team-grid"></div></section>`;

      document.getElementById('team-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const name = clean(f.name.value, 40);
        if (!name) return;
        if (state.teams.some((t) => t.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
          return toast('Bu isimde bir takım zaten var.', true);
        }
        const players = f.players.value
          .split('\n')
          .map((s) => clean(s, 40))
          .filter(Boolean)
          .slice(0, MAX_PLAYERS)
          .map((n) => ({ id: uid(), name: n }));
        const ok = await run(() => db.addTeam({ name, captain: clean(f.captain.value, 40), players }), `${name} kaydedildi.`);
        if (ok) f.reset();
      });
    },
    update() {
      document.getElementById('team-count').textContent = `(${state.teams.length})`;
      const list = document.getElementById('team-list');
      list.innerHTML = state.teams.length
        ? sortedTeams()
            .map(
              (t) => `
              <button class="team-card" data-team="${esc(t.id)}">
                <b>${esc(t.name)}</b>
                <span class="muted small">${t.captain ? `Kaptan: ${esc(t.captain)} · ` : ''}${(t.players || []).length} oyuncu</span>
                <span class="small">${(t.players || []).map((p) => esc(p.name)).join(', ') || '<i class="muted">Oyuncu eklenmedi</i>'}</span>
              </button>`,
            )
            .join('')
        : '<p class="muted">Henüz kayıtlı takım yok. İlk sen ol!</p>';
    },
  },

  kralliklar: {
    mount() {
      app.innerHTML = `
        <div class="grid-2">
          <section class="card"><h2>⚽ Gol Krallığı</h2><div id="scorers"></div></section>
          <section class="card"><h2>🅰️ Asist Krallığı</h2><div id="assists"></div></section>
        </div>
        <p class="muted small center">Yalnızca "oynandı" olarak işaretlenmiş maçlar sayılır.</p>`;
    },
    update() {
      document.getElementById('scorers').innerHTML = leadersTable('scorerId', 'gol');
      document.getElementById('assists').innerHTML = leadersTable('assistId', 'asist');
    },
  },

  yonetim: {
    mount() {
      if (!isAdmin()) {
        app.innerHTML = `
          <section class="card center">
            <h2>Yönetim</h2>
            <p class="muted">Fikstür oluşturma, silme ve sıfırlama yalnızca yönetici Google hesabıyla yapılır.</p>
            <button id="unlock" class="btn primary">Google ile Giriş Yap</button>
          </section>`;
        document.getElementById('unlock').onclick = async () => {
          if (!(await requireAdmin())) return;
          this.mount();
          this.update();
        };
        return;
      }

      app.innerHTML = `
        <section class="card">
          <h2>Turnuva Adı</h2>
          <form id="settings-form" class="inline">
            <input name="tournamentName" maxlength="60" required>
            <button class="btn">Kaydet</button>
          </form>
        </section>

        <section class="card">
          <h2>Fikstür Oluştur (Lig)</h2>
          <p class="muted small">Her takım diğer her takımla bir kez oynar. <span id="fixture-info"></span></p>
          <form id="fixture-form" class="form-grid">
            <label>İlk hafta tarihi<input type="date" name="start" required></label>
            <label>İlk maç saati<input type="time" name="time" value="20:00" required></label>
            <label>Haftalar arası gün<input type="number" name="days" value="7" min="0" max="60" required></label>
            <label>Maçlar arası dakika<input type="number" name="gap" value="60" min="0" max="600" required></label>
            <label>Saha<input name="pitch" maxlength="40"></label>
            <label class="check"><input type="checkbox" name="replace"> Önce mevcut tüm maçları sil</label>
            <button class="btn primary">Fikstürü Oluştur</button>
          </form>
        </section>

        <section class="card">
          <h2>Yedek</h2>
          <p class="muted small">Tüm takım ve maç verisini JSON olarak indir.</p>
          <button id="backup" class="btn">Yedeği İndir</button>
        </section>

        <section class="card danger">
          <h2>Turnuvayı Sıfırla</h2>
          <p class="small">Tüm takımlar, oyuncular, maçlar, goller ve asistler <b>kalıcı olarak silinir</b>. Silmeden önce yedek otomatik indirilir.</p>
          <form id="reset-form" class="inline">
            <input name="confirm" placeholder='Onay için "SIFIRLA" yaz' autocomplete="off">
            <button class="btn danger">Her Şeyi Sıfırla</button>
          </form>
        </section>

        <p class="center muted small">${esc(state.user?.email)} · <button id="lock" class="btn small">Çıkış Yap</button></p>`;

      const settingsForm = document.getElementById('settings-form');
      settingsForm.tournamentName.value = state.settings.tournamentName || DEFAULT_TITLE;
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        run(() => db.saveSettings({ tournamentName: clean(settingsForm.tournamentName.value, 60) }), 'Kaydedildi.');
      });

      const fixtureForm = document.getElementById('fixture-form');
      fixtureForm.start.value = new Date().toISOString().slice(0, 10);
      fixtureForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const rounds = generateRoundRobin(sortedTeams().map((t) => t.id));
        if (!rounds.length) return toast('Fikstür için en az 2 takım gerekli.', true);

        const [h, min] = f.time.value.split(':').map(Number);
        const list = [];
        rounds.forEach((pairs, r) => {
          pairs.forEach(([home, away], k) => {
            const d = new Date(`${f.start.value}T00:00`);
            d.setDate(d.getDate() + r * Number(f.days.value));
            d.setHours(h, min + k * Number(f.gap.value), 0, 0);
            list.push({ homeTeamId: home, awayTeamId: away, date: toLocalInput(d), pitch: clean(f.pitch.value, 40) });
          });
        });

        await run(async () => {
          if (f.replace.checked) await db.deleteAllMatches();
          await db.addMatches(list);
        }, `${rounds.length} haftalık fikstür oluşturuldu (${list.length} maç).`);
      });

      document.getElementById('backup').onclick = downloadBackup;

      document.getElementById('reset-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.confirm.value.trim() !== 'SIFIRLA') return toast('Onay için "SIFIRLA" yazmalısın.', true);
        downloadBackup();
        const ok = await run(() => db.resetAll(), 'Turnuva sıfırlandı.');
        if (ok) e.target.reset();
      });

      document.getElementById('lock').onclick = () => run(() => db.signOut());
    },
    update() {
      const info = document.getElementById('fixture-info');
      if (!info) return;
      const n = state.teams.length;
      info.textContent = n >= 2 ? `${n} takım → ${n % 2 ? n : n - 1} hafta, ${(n * (n - 1)) / 2} maç.` : 'En az 2 takım gerekli.';
    },
  },
};

function toLocalInput(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function downloadBackup() {
  const data = { exportedAt: new Date().toISOString(), settings: state.settings, teams: state.teams, matches: state.matches };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `turnuva-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- modals ----------

function openModal(html, update) {
  modalBody.innerHTML = `<button class="close" data-close aria-label="Kapat">✕</button>${html}`;
  modalUpdate = update;
  if (!modal.open) modal.showModal();
  update?.();
}

modal.addEventListener('close', () => (modalUpdate = null));
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.close();
});

function openMatch(id) {
  const m = state.matches.find((x) => x.id === id);
  if (!m) return;
  const home = teamById(m.homeTeamId);
  const away = teamById(m.awayTeamId);

  openModal(
    `
    <h2 class="center">${esc(teamName(m.homeTeamId))} <span class="muted">vs</span> ${esc(teamName(m.awayTeamId))}</h2>
    <p id="mm-score" class="big-score center"></p>

    <form id="mm-info" class="form-grid">
      <label>Tarih & saat<input type="datetime-local" name="date" value="${esc(m.date)}"></label>
      <label>Saha<input name="pitch" maxlength="40" value="${esc(m.pitch)}"></label>
      <label class="check"><input type="checkbox" name="played" ${m.status === 'played' ? 'checked' : ''}> Maç oynandı</label>
      <button class="btn">Kaydet</button>
    </form>

    <h3>Goller</h3>
    <ul id="mm-goals" class="goal-list"></ul>

    <form id="mm-goal" class="form-grid">
      <label>Takım<select name="team">
        <option value="${esc(m.homeTeamId)}">${esc(teamName(m.homeTeamId))}</option>
        <option value="${esc(m.awayTeamId)}">${esc(teamName(m.awayTeamId))}</option>
      </select></label>
      <label>Golü atan<select name="scorer"></select></label>
      <label>Asist<select name="assist"></select></label>
      <button class="btn primary">Gol Ekle</button>
    </form>

    <div class="modal-actions"><button id="mm-delete" class="btn danger small">Maçı Sil</button></div>`,
    () => {
      const cur = state.matches.find((x) => x.id === id);
      if (!cur) return modal.close();
      const s = scoreOf(cur);
      document.getElementById('mm-score').textContent = `${s.home} - ${s.away}`;
      const goals = cur.goals || [];
      document.getElementById('mm-goals').innerHTML = goals.length
        ? goals
            .map(
              (g) => `<li>
                <span>⚽ <b>${esc(g.scorerId ? playerName(g.scorerId) : 'Bilinmiyor')}</b>${g.assistId ? ` <span class="muted">(asist: ${esc(playerName(g.assistId))})</span>` : ''}
                <span class="muted small">— ${esc(teamName(g.teamId))}</span></span>
                <button class="icon" data-remove-goal="${esc(g.id)}" aria-label="Golü sil">✕</button>
              </li>`,
            )
            .join('')
        : '<li class="muted">Henüz gol yok.</li>';
    },
  );

  const goalForm = document.getElementById('mm-goal');
  const fillPlayers = () => {
    const team = goalForm.team.value === m.homeTeamId ? home : away;
    const opts = (team?.players || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    goalForm.scorer.innerHTML = `<option value="">Bilinmiyor</option>${opts}`;
    goalForm.assist.innerHTML = `<option value="">Yok</option>${opts}`;
  };
  goalForm.team.addEventListener('change', fillPlayers);
  fillPlayers();

  goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const cur = state.matches.find((x) => x.id === id);
    if (goalForm.scorer.value && goalForm.scorer.value === goalForm.assist.value) {
      return toast('Golü atan ve asist yapan aynı kişi olamaz.', true);
    }
    const goal = { id: uid(), teamId: goalForm.team.value, scorerId: goalForm.scorer.value || null, assistId: goalForm.assist.value || null };
    run(() => db.updateMatch(id, { goals: [...(cur.goals || []), goal] }), 'Gol eklendi.');
  });

  document.getElementById('mm-goals').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-goal]');
    if (!btn) return;
    const cur = state.matches.find((x) => x.id === id);
    run(() => db.updateMatch(id, { goals: (cur.goals || []).filter((g) => g.id !== btn.dataset.removeGoal) }), 'Gol silindi.');
  });

  document.getElementById('mm-info').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    run(
      () => db.updateMatch(id, { date: f.date.value, pitch: clean(f.pitch.value, 40), status: f.played.checked ? 'played' : 'scheduled' }),
      'Maç güncellendi.',
    );
  });

  document.getElementById('mm-delete').onclick = async () => {
    if (!(await requireAdmin())) return;
    if (await run(() => db.deleteMatch(id), 'Maç silindi.')) modal.close();
  };
}

function openTeam(id) {
  const t = teamById(id);
  if (!t) return;

  openModal(
    `
    <h2>${esc(t.name)}</h2>
    <form id="tm-info" class="form-grid">
      <label>Takım adı<input name="name" maxlength="40" required value="${esc(t.name)}"></label>
      <label>Kaptan<input name="captain" maxlength="40" value="${esc(t.captain)}"></label>
      <button class="btn">Kaydet</button>
    </form>

    <h3>Kadro</h3>
    <table class="leaders"><thead><tr><th class="left">Oyuncu</th><th>⚽</th><th>🅰️</th><th></th></tr></thead><tbody id="tm-players"></tbody></table>

    <form id="tm-add" class="inline">
      <input name="player" maxlength="40" placeholder="Oyuncu adı" required>
      <button class="btn primary">Oyuncu Ekle</button>
    </form>

    <h3>Maçlar</h3>
    <div id="tm-matches"></div>

    <div class="modal-actions"><button id="tm-delete" class="btn danger small">Takımı Sil</button></div>`,
    () => {
      const cur = teamById(id);
      if (!cur) return modal.close();
      const goals = new Map(computeLeaders(state.teams, state.matches, 'scorerId').map((r) => [r.playerId, r.count]));
      const assists = new Map(computeLeaders(state.teams, state.matches, 'assistId').map((r) => [r.playerId, r.count]));
      const players = cur.players || [];
      document.getElementById('tm-players').innerHTML = players.length
        ? players
            .map(
              (p) => `<tr><td class="left">${esc(p.name)}</td><td>${goals.get(p.id) || 0}</td><td>${assists.get(p.id) || 0}</td>
                <td><button class="icon" data-remove-player="${esc(p.id)}" aria-label="Oyuncuyu çıkar">✕</button></td></tr>`,
            )
            .join('')
        : '<tr><td colspan="4" class="muted left">Oyuncu yok.</td></tr>';
      const mine = state.matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id).sort(byDate);
      document.getElementById('tm-matches').innerHTML = matchList(mine, 'Bu takımın maçı yok.');
    },
  );

  document.getElementById('tm-info').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = clean(e.target.name.value, 40);
    const clash = state.teams.some((x) => x.id !== id && x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
    if (clash) return toast('Bu isimde bir takım zaten var.', true);
    run(() => db.updateTeam(id, { name, captain: clean(e.target.captain.value, 40) }), 'Takım güncellendi.');
  });

  document.getElementById('tm-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const players = teamById(id).players || [];
    if (players.length >= MAX_PLAYERS) return toast(`En fazla ${MAX_PLAYERS} oyuncu eklenebilir.`, true);
    const name = clean(e.target.player.value, 40);
    if (!name) return;
    if (await run(() => db.updateTeam(id, { players: [...players, { id: uid(), name }] }), 'Oyuncu eklendi.')) e.target.reset();
  });

  document.getElementById('tm-players').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-player]');
    if (!btn) return;
    const pid = btn.dataset.removePlayer;
    const used = state.matches.some((m) => (m.goals || []).some((g) => g.scorerId === pid || g.assistId === pid));
    if (used) return toast('Bu oyuncunun golü/asisti var. Önce o kayıtları sil.', true);
    run(() => db.updateTeam(id, { players: (teamById(id).players || []).filter((p) => p.id !== pid) }), 'Oyuncu çıkarıldı.');
  });

  document.getElementById('tm-delete').onclick = async () => {
    if (!(await requireAdmin())) return;
    if (await run(() => db.deleteTeam(id, state.matches), 'Takım ve maçları silindi.')) modal.close();
  };
}

document.addEventListener('click', (e) => {
  const match = e.target.closest('[data-match]');
  if (match) return openMatch(match.dataset.match);
  const team = e.target.closest('[data-team]');
  if (team) return openTeam(team.dataset.team);
});

// ---------- routing & data ----------

function route() {
  const key = location.hash.replace(/^#\/?/, '');
  const name = key in views ? key : '';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  currentView = views[name];
  if (!loaded()) {
    app.innerHTML = '<p class="muted center">Yükleniyor…</p>';
    return;
  }
  currentView.mount();
  currentView.update();
}

function refresh() {
  if (!loaded()) return;
  if (!app.dataset.ready) {
    app.dataset.ready = '1';
    return route();
  }
  currentView?.update();
  modalUpdate?.();
}

function renderTitle() {
  const title = state.settings.tournamentName || DEFAULT_TITLE;
  document.getElementById('tournament-name').textContent = title;
  document.title = title;
}

function showSetup() {
  app.innerHTML = `
    <section class="card">
      <h2>Kurulum gerekli</h2>
      <p>Site henüz bir Firebase projesine bağlı değil. <code>js/config.js</code> dosyasına Firebase web uygulaması ayarlarını gir.</p>
      <p class="muted small">Adım adım anlatım için repodaki README dosyasına bak.</p>
    </section>`;
}

window.addEventListener('hashchange', route);

if (!db.isConfigured) {
  showSetup();
} else {
  route();
  db.subscribe({
    onTeams: (teams) => {
      state.teams = teams;
      state.teamsLoaded = true;
      refresh();
    },
    onMatches: (matches) => {
      state.matches = matches;
      state.matchesLoaded = true;
      refresh();
    },
    onSettings: (settings) => {
      state.settings = settings;
      renderTitle();
    },
    onError: (e) => {
      console.error(e);
      toast(`Veritabanı hatası: ${e.message}`, true);
    },
  });
  db.onAuth((user) => {
    state.user = user;
    if (currentView === views.yonetim && loaded()) route();
  });
}
