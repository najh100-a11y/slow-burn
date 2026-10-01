/* 『1도의 가격』 함께 읽기 — 앱 본체
   화면: 이번 주 / 모든 모임 / 내 노트 / 설정 / 처음 시작
   모임 자료: 읽기 / 나누기(내 문장, 함께 보기) / 이야기 / 더 깊이 */
(function () {
  'use strict';

  var CFG = window.BOOKCLUB_CONFIG || {};
  var SHARING = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var KEY = 'bookclub-1do-v1';
  var $app = document.getElementById('app');
  var $toast = document.getElementById('toast');
  var DAY = ['일', '월', '화', '수', '목', '금', '토'];
  var ORD = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟'];
  var KN = ['하나', '둘', '셋', '넷', '다섯', '여섯'];
  var SIZES = [['m', '보통'], ['l', '크게'], ['xl', '아주 크게']];

  /* ---------- 저장 ---------- */
  var DEFAULTS = { deviceId: '', name: '', joined: false, code: '', size: 'm', leaderPin: '', checks: {}, notes: [], drafts: {} };
  var S = load();
  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 공간 없음 */ } }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  if (!S.deviceId) { S.deviceId = uid(); save(); }
  document.documentElement.setAttribute('data-size', S.size);

  var ui = { sel: null, q: {}, acc: {}, nfilter: 'all', bfilter: 'all', board: {}, big: null, joinErr: '', busy: false };
  var INDEX = null;
  var SESS = {};
  var pollTimer = null;

  /* ---------- 도우미 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { $toast.classList.remove('show'); }, 2600);
  }
  function pd(s) { var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function today0() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function fmt(d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAY[d.getDay()] + '요일'; }
  function readOpenAt(s) { return s.readOpens ? pd(s.readOpens) : addDays(pd(s.date), -4); }
  function allOpenAt(s) { return s.allOpens ? pd(s.allOpens) : pd(s.date); }
  function isLeader() { return !!S.leaderPin; }
  function readReallyOpen(s) { return new Date() >= readOpenAt(s); }
  function allReallyOpen(s) { return new Date() >= allOpenAt(s); }
  function readOpen(s) { return isLeader() || readReallyOpen(s); }
  function allOpen(s) { return isLeader() || allReallyOpen(s); }
  function canShare() { return SHARING && S.joined && !!S.code; }
  function pageLabel(p) { if (!p) return ''; return /^\d+$/.test(p) ? p + '쪽' : p; }
  function kindLabel(k) { return k === 'moved' ? '공감·놀람' : k === 'doubt' ? '의심' : '질문 메모'; }
  function notesOf(sid, kind) { return S.notes.filter(function (n) { return n.sid === sid && (!kind || n.kind === kind); }); }

  function svg(paths, size, sw) {
    size = size || 24; sw = sw || 1.9;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var I = {
    home: svg('<path d="M3 10.5L12 3l9 7.5"></path><path d="M5 9.5V20h14V9.5"></path>'),
    book: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path><path d="M5 17a3 3 0 0 1 3-3h11"></path>'),
    note: svg('<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path><path d="M9 13h7"></path><path d="M9 17h5"></path>'),
    back: svg('<path d="M15 5l-7 7 7 7"></path>', 22, 2),
    next: svg('<path d="M9 5l7 7-7 7"></path>', 18, 2),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"></path>', 20, 2.2),
    expand: svg('<path d="M4 9V4h5"></path><path d="M20 9V4h-5"></path><path d="M4 15v5h5"></path><path d="M20 15v5h-5"></path>', 16, 2),
    ext: svg('<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v6H4V6h6"></path>', 18, 2),
    share: svg('<path d="M12 3v12"></path><path d="M7 8l5-5 5 5"></path><path d="M5 13v7h14v-7"></path>', 20),
    gear: svg('<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>', 20, 1.6),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>', 13, 2.2),
    up: svg('<path d="M6 15l6-6 6 6"></path>', 18, 2),
    down: svg('<path d="M6 9l6 6 6-6"></path>', 18, 2),
    plus: svg('<path d="M12 5v14"></path><path d="M5 12h14"></path>', 18, 2)
  };

  /* ---------- 자료 불러오기 ---------- */
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function meta(id) { return INDEX.sessions.filter(function (s) { return s.id === id; })[0]; }
  function loadSess(id) {
    if (SESS[id]) return Promise.resolve(SESS[id]);
    var m = meta(id);
    if (!m || !m.file) return Promise.resolve(null);
    return getJSON('content/' + m.file).then(function (d) {
      SESS[id] = Object.assign({}, m, d, { id: id });
      return SESS[id];
    }).catch(function () { return null; });
  }
  function currentIdx() {
    var t = today0(), list = INDEX.sessions;
    for (var i = 0; i < list.length; i++) { if (pd(list[i].date) >= t) return i; }
    return list.length - 1;
  }

  /* ---------- 나눔판 서버 ---------- */
  function rpc(fn, args) {
    var base = String(CFG.supabaseUrl).replace(/\/$/, '');
    return fetch(base + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': CFG.supabaseAnonKey,
        'Authorization': 'Bearer ' + CFG.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    }).then(function (r) {
      if (!r.ok) throw new Error(fn + ' ' + r.status);
      return r.text();
    }).then(function (t) { return t ? JSON.parse(t) : null; });
  }
  function postNote(n) {
    return rpc('bookclub_post', {
      p_code: S.code, p_session: n.sid, p_kind: n.kind, p_body: n.body,
      p_page: n.page || '', p_name: n.anon ? '' : (S.name || ''), p_device: S.deviceId
    }).then(function (rid) {
      n.remoteId = rid; n.shared = true; save(); return true;
    }).catch(function () {
      toast('나눔판에 올리지 못했어요. 인터넷 연결을 확인하고 다시 올려 주세요.');
      return false;
    });
  }
  function refreshBoard(id, rerender) {
    var s = SESS[id];
    if (!canShare() || !s) return Promise.resolve();
    var p = allOpen(s)
      ? rpc('bookclub_list', { p_code: S.code, p_session: id, p_device: S.deviceId }).then(function (rows) {
          ui.board[id] = { rows: rows || [], count: (rows || []).length, err: false };
        })
      : rpc('bookclub_count', { p_code: S.code, p_session: id }).then(function (n) {
          ui.board[id] = { count: n || 0, err: false };
        });
    return p.catch(function () {
      ui.board[id] = Object.assign({}, ui.board[id] || {}, { err: true });
    }).then(function () {
      if (rerender === false) return;
      var r = parse();
      if (r.name === 's' && r.id === id && r.tab === 'board') render();
      else if (r.name === 's' && r.id === id && r.tab === 'share') updateBadge(id);
    });
  }
  function updateBadge(id) {
    var el = document.querySelector('[data-badge="' + id + '"]');
    var b = ui.board[id];
    if (el && b && typeof b.count === 'number') el.textContent = b.count;
  }

  /* ---------- 경로 ---------- */
  function parse() {
    var h = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    return { name: h[0] || 'home', id: h[1], tab: h[2] || 'read' };
  }
  window.addEventListener('hashchange', function () { ui.sel = null; ui.big = null; window.scrollTo(0, 0); route(); });

  function route() {
    clearInterval(pollTimer); pollTimer = null;
    var r = parse();
    if (SHARING && !S.joined && r.name !== 'join') { location.replace('#/join'); return; }
    var jobs = [];
    if (r.name === 'home') {
      var ci = currentIdx(), list = INDEX.sessions;
      jobs.push(loadSess(list[ci].id));
      if (ci > 0) jobs.push(loadSess(list[ci - 1].id));
    }
    if (r.name === 's') jobs.push(loadSess(r.id));
    Promise.all(jobs).then(function () {
      render();
      if (r.name === 's' && SESS[r.id] && canShare()) {
        if (r.tab === 'board') {
          refreshBoard(r.id);
          pollTimer = setInterval(function () { refreshBoard(r.id); }, 20000);
        } else if (r.tab === 'share') {
          refreshBoard(r.id, true);
        }
      }
    });
  }

  /* ---------- 공통 조각 ---------- */
  function sizeBtn(plain) {
    return '<button class="icon-btn' + (plain ? ' plain' : '') + '" data-act="size" aria-label="글자 크기 바꾸기">가</button>';
  }
  function tabbar(active) {
    function t(k, href, label, icon) {
      return '<a class="tab" href="' + href + '"' + (active === k ? ' aria-current="page"' : '') + '>' + icon + label + '</a>';
    }
    return '<nav class="tabbar" aria-label="주요 메뉴"><div class="wrap">' +
      t('home', '#/home', '이번 주', I.home) + t('sessions', '#/sessions', '모든 모임', I.book) + t('notes', '#/notes', '내 노트', I.note) +
      '</div></nav>';
  }
  function lockedCard(title, sub) {
    return '<div class="locked"><div class="t">' + esc(title) + '</div><div class="s">' + esc(sub) + '</div></div>';
  }
  function previewBanner(when) {
    return '<div class="preview-banner">인도자 미리보기예요. 다른 사람들에게는 ' + esc(fmt(when)) + '에 열려요.</div>';
  }

  /* ---------- 이번 주 ---------- */
  function vHome() {
    var list = INDEX.sessions, ci = currentIdx(), m = list[ci], s = SESS[m.id];
    var mains = list.filter(function (x) { return !x.optional; });
    var mi = mains.indexOf(m);
    var club = INDEX.club || {};
    var h = '<div class="screen"><div class="wrap">';
    h += '<div class="top"><div><div class="club">' + esc(club.name || '') + '</div><div class="title">' + esc(club.book || '') + '</div></div>' + sizeBtn() + '</div>';
    h += '<main class="main">';

    if (mi >= 0) {
      var bars = mains.map(function (x, i) { return '<div class="bar' + (i < mi ? ' done' : i === mi ? ' now' : '') + '"></div>'; }).join('');
      h += '<div class="progress"><div class="small">' + (mains.length === 6 ? '여섯' : mains.length) + ' 번의 모임 가운데 <b style="color:var(--ink)">' + ORD[mi] + ' 번째</b></div><div class="bars" style="grid-template-columns:repeat(' + mains.length + ',minmax(0,1fr))">' + bars + '</div></div>';
    }

    var time = m.time || club.time, place = m.place || club.place;
    h += '<section class="card" aria-label="이번 주 모임">';
    h += '<div style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow">이번 주 ' + esc(m.label) + (m.label === '오리엔테이션' || m.optional ? '' : ' 모임') + '</div><div class="big-title">' + esc(m.title) + '</div></div>';
    h += '<div class="meta">';
    if (m.range) h += '<div><span>읽을 범위</span><span>' + esc(m.range) + '</span></div>';
    h += '<div><span>일시</span><span>' + esc(fmt(pd(m.date))) + (time ? ' ' + esc(time) : '') + '</span></div>';
    if (place) h += '<div><span>장소</span><span>' + esc(place) + '</span></div>';
    h += '</div>';
    if (s) h += '<a class="btn" href="#/s/' + m.id + '/read">모임 자료 열기 ' + I.next + '</a>';
    else h += '<p class="sub">이번 주 자료를 준비하고 있어요.</p>';
    h += '</section>';

    if (s) {
      var c = S.checks[m.id] || {};
      var nCount = notesOf(m.id).filter(function (n) { return n.kind !== 'memo'; }).length;
      var prev = ci > 0 ? SESS[list[ci - 1].id] : null;
      var task = prev && prev.next && prev.next.task;
      var ro = readOpen(s);
      h += '<section style="display:flex;flex-direction:column;gap:10px" aria-label="모임 전에 해 볼 것"><div class="label-strong">모임 전에 해 볼 것</div><div class="checklist">';
      h += checkRow(m.id, 'read', !!c.read, '요약 읽기', ro ? (s.read.title + ', 약 ' + (s.read.minutes || 10) + '분') : (fmt(readOpenAt(s)) + '에 열려요'), '#/s/' + m.id + '/read');
      h += checkRow(m.id, 'note', !!c.note || nCount > 0, '마음에 남은 문장 적기', nCount > 0 ? (nCount + '개 적었어요') : '공감되거나 놀라운 것 하나, 의심스러운 것 하나', '#/s/' + m.id + '/share');
      if (task) h += checkRow(m.id, 'task', !!c.task, '관찰 과제', task, null);
      h += '</div><p class="small" style="margin:0">해 오면 좋고, 못 해 와도 모임은 온전합니다.</p></section>';
    }
    h += '</main></div>' + tabbar('home') + '</div>';
    return h;
  }
  function checkRow(sid, k, on, title, sub, href) {
    var btn = '<button class="check' + (on ? ' on' : '') + '" data-act="check" data-sid="' + sid + '" data-k="' + k + '" aria-pressed="' + on + '" aria-label="' + esc(title) + ' ' + (on ? '완료 표시 해제' : '완료 표시') + '">' + (on ? I.check : '') + '</button>';
    var body = '<span class="t">' + esc(title) + '</span><span class="s">' + esc(sub) + '</span>';
    var inner = href
      ? '<a class="check-body check-link" href="' + href + '"><span style="display:flex;flex-direction:column;gap:2px;min-width:0">' + body + '</span><span style="color:var(--faint)">' + I.next + '</span></a>'
      : '<div class="check-body">' + body + '</div>';
    return '<div class="check-row' + (on ? ' done' : '') + '">' + btn + inner + '</div>';
  }

  /* ---------- 모든 모임 ---------- */
  function vSessions() {
    var list = INDEX.sessions, ci = currentIdx();
    var h = '<div class="screen"><div class="wrap"><div class="top"><div style="display:flex;flex-direction:column;gap:6px"><h1 class="h-page">모든 모임</h1><p class="sub">책의 네 부분을 따라 여섯 번 만납니다. 자료는 모임 주간에 열려요.</p></div>' + sizeBtn() + '</div><main class="main"><div class="sess-list">';
    list.forEach(function (m, i) {
      var st = i < ci ? 'past' : i === ci ? 'now' : 'next';
      var num = st === 'past' ? I.check : (m.optional ? I.plus : (/^s\d+$/.test(m.id) && m.id !== 's0' ? m.id.slice(1) : '시'));
      var pill = st === 'now' ? '<span class="pill now">이번 주</span>' : st === 'past' ? '<span class="pill plain">지난 모임</span>' : '<span class="pill plain">' + (m.optional ? '선택' : (pd(m.date).getMonth() + 1) + '월 ' + pd(m.date).getDate() + '일') + '</span>';
      var k = esc(m.part) + (m.range ? ' · ' + esc(m.range) : '');
      var inner = '<span class="num">' + num + '</span><span class="body"><span class="k">' + k + '</span><span class="t">' + esc(m.title) + '</span></span>' + pill;
      h += m.file ? '<a class="sess ' + st + '" href="#/s/' + m.id + '/read">' + inner + '</a>' : '<div class="sess ' + st + '">' + inner + '</div>';
    });
    h += '</div><div class="hint-box"><div class="t">네 가지 질문만 기억하세요</div><div class="s">우리는 왜 보지 못하는가, 더위는 사람을 어떻게 바꾸는가, 누가 더 다치는가, 그렇다면 무엇을 할 것인가.</div></div>';
    h += '</main></div>' + tabbar('sessions') + '</div>';
    return h;
  }

  /* ---------- 내 노트 ---------- */
  function vNotes() {
    var f = ui.nfilter;
    var h = '<div class="screen"><div class="wrap"><div class="top"><div style="display:flex;flex-direction:column;gap:6px"><h1 class="h-page">내 노트</h1><p class="sub">내가 적은 문장과 생각이 모임별로 모입니다. 이 휴대폰에 저장돼요.</p></div>' +
      '<div class="row"><button class="icon-btn" data-act="export" aria-label="내 노트 내보내기">' + I.share + '</button><a class="icon-btn" href="#/settings" aria-label="설정">' + I.gear + '</a></div></div><main class="main">';
    h += '<div class="chips" role="group" aria-label="노트 거르기">' + [['all', '전체'], ['moved', '공감·놀람'], ['doubt', '의심'], ['memo', '질문 메모']].map(function (x) {
      return '<button class="chip" data-act="nfilter" data-v="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var any = false;
    INDEX.sessions.forEach(function (m) {
      var ns = notesOf(m.id).filter(function (n) { return f === 'all' || n.kind === f; });
      if (!ns.length) return;
      any = true;
      h += '<section style="display:flex;flex-direction:column;gap:10px"><div class="group-h"><span>' + esc(m.label) + ' ' + esc(m.title) + '</span>' + (m.file ? '<a href="#/s/' + m.id + '/read">모임 자료</a>' : '') + '</div>';
      ns.forEach(function (n) { h += noteCard(n, true); });
      h += '</section>';
    });
    if (!any) {
      var cur = INDEX.sessions[currentIdx()];
      h += '<div class="empty">' + (f === 'all' ? '아직 적은 내용이 없어요.<br>모임 자료의 나누기 칸에서 마음에 남은 문장을 적어 보세요.' : '이 종류로 적은 내용이 없어요.') + '</div>';
      if (f === 'all' && cur.file) h += '<a class="btn ghost" href="#/s/' + cur.id + '/share">이번 주 문장 적으러 가기</a>';
    }
    h += '</main></div>' + tabbar('notes') + '</div>';
    return h;
  }
  function noteCard(n, withActions) {
    var cls = n.kind === 'moved' ? '' : n.kind === 'doubt' ? ' doubt' : ' memo';
    var metaR = n.kind === 'memo' ? esc(n.qTitle || '질문') : esc(pageLabel(n.page));
    var shared = n.kind !== 'memo' ? (n.remoteId ? '나눔판에 올림' + (n.anon || !S.name ? ', 익명' : ', ' + esc(S.name)) : '') : '';
    var acts = '';
    if (withActions) {
      if (n.kind !== 'memo' && !n.remoteId && canShare()) acts += '<button class="linkish" data-act="postnote" data-id="' + n.id + '">나눔판에 올리기</button>';
      acts += '<button class="linkish danger" data-act="delnote" data-id="' + n.id + '">지우기</button>';
    }
    return '<div class="post"><div class="head"><span class="tag' + cls + '">' + kindLabel(n.kind) + '</span><span class="small">' + metaR + '</span></div>' +
      '<div class="body' + (n.kind === 'moved' ? ' serif' : '') + '">' + esc(n.body) + '</div>' +
      '<div class="foot"><span class="small">' + shared + '</span><span class="row" style="gap:14px">' + acts + '</span></div></div>';
  }

  /* ---------- 설정 ---------- */
  function vSettings() {
    var h = '<div class="screen"><div class="wrap"><div class="sbar"><div class="row"><a class="icon-btn plain" href="#/notes" aria-label="내 노트로 돌아가기" style="color:var(--ink)">' + I.back + '</a><div class="mid"><span class="b">설정</span></div><span style="width:44px"></span></div></div><main class="smain">';
    h += '<section class="card"><div class="set-row"><div class="label-strong">글자 크기</div><div class="sizes" role="group" aria-label="글자 크기">' + SIZES.map(function (x) {
      return '<button data-act="setsize" data-v="' + x[0] + '" aria-pressed="' + (S.size === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div></div></section>';

    h += '<section class="card"><div class="set-row"><div class="label-strong">나눔판</div>';
    if (!SHARING) h += '<p class="sub">나눔판은 아직 준비 중이에요.</p>';
    else if (canShare()) {
      h += '<p class="sub">모임 코드로 연결되어 있어요.</p><div class="field"><label for="nm">나눔판에 보일 이름 <span>(비워 두면 익명)</span></label><input id="nm" type="text" maxlength="30" autocomplete="nickname" value="' + esc(S.name) + '"></div><button class="btn small ghost" data-act="savename">이름 저장</button>';
    } else {
      h += '<p class="sub">모임 코드를 넣으면 서로의 문장을 함께 볼 수 있어요.</p><a class="btn small ghost" href="#/join">모임 코드 넣기</a>';
    }
    h += '</div></section>';

    h += '<section class="card"><div class="set-row"><div class="label-strong">인도자 모드</div>';
    if (isLeader()) h += '<p class="sub">켜져 있어요. 아직 열리지 않은 자료를 미리 볼 수 있고, 나눔판의 글을 숨길 수 있어요.</p><button class="btn small ghost" data-act="leaderoff">인도자 모드 끄기</button>';
    else h += '<p class="sub">모임을 인도하는 분만 쓰는 기능이에요.</p><div class="field"><label for="pin">인도자 PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off"></div><button class="btn small ghost" data-act="leaderon">인도자 모드 켜기</button>';
    h += '</div></section>';

    h += '<section class="card"><div class="set-row"><div class="label-strong">내 기록</div><p class="sub">내 노트는 이 휴대폰에만 저장돼요. 휴대폰을 바꾸기 전에 내보내 두세요.</p><button class="btn small ghost" data-act="export">내 노트 내보내기</button><button class="linkish danger" data-act="resetall" style="align-self:flex-start">이 휴대폰의 기록 모두 지우기</button></div></section>';
    h += '</main></div></div>';
    return h;
  }

  /* ---------- 처음 시작 ---------- */
  function vJoin() {
    var club = (INDEX && INDEX.club) || {};
    var h = '<div class="wrap"><form class="join" id="joinform" novalidate><div style="display:flex;flex-direction:column;gap:34px">';
    h += '<div style="display:flex;flex-direction:column;gap:10px"><div class="small" style="font-size:.875rem;font-weight:500">' + esc(club.name || '') + '</div><h1>『1도의 가격』<br>함께 읽기</h1><p class="sub" style="font-size:.9375rem;color:var(--ink-2)">여섯 번의 모임 동안 읽고, 적고, 나누는 자리입니다.</p></div>';
    h += '<div style="display:flex;flex-direction:column;gap:18px"><div class="field"><label for="code">모임 코드</label><input id="code" type="text" autocomplete="off" autocapitalize="off" placeholder="모임에서 받은 코드" value="' + esc(ui.joinCode || '') + '"></div>';
    h += '<div class="field"><label for="nick">나눔판에 보일 이름 <span>(선택)</span></label><input id="nick" type="text" maxlength="30" autocomplete="nickname" placeholder="비워 두면 익명으로 올라가요" value="' + esc(S.name) + '"></div>';
    if (ui.joinErr) h += '<div class="err" role="alert">' + esc(ui.joinErr) + '</div>';
    h += '</div></div><div style="display:flex;flex-direction:column;gap:12px"><button class="btn" type="submit"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? '확인하는 중…' : '시작하기') + '</button>';
    h += '<button class="linkish" type="button" data-act="joinskip" style="align-self:center">코드 없이 둘러보기</button>';
    h += '<p class="small" style="margin:0;text-align:center;line-height:1.65">코드는 처음 한 번만 넣으면 됩니다. 내 기록은 이 휴대폰에 저장되고, 내가 고른 문장만 나눔판에 올라갑니다.</p></div></form></div>';
    return h;
  }

  /* ---------- 모임 자료 ---------- */
  var TABS = [['read', '읽기'], ['share', '나누기'], ['talk', '이야기'], ['deep', '더 깊이']];
  function vSession(r) {
    var s = SESS[r.id];
    if (!s) {
      return '<div class="screen"><div class="wrap"><div class="sbar"><div class="row"><a class="icon-btn plain" href="#/home" aria-label="이번 주로 돌아가기" style="color:var(--ink)">' + I.back + '</a><span></span><span style="width:44px"></span></div></div><main class="smain"><div class="empty">아직 준비 중인 모임이에요.</div></main></div></div>';
    }
    var tab = r.tab === 'board' ? 'share' : r.tab;
    var h = '<div class="screen"><div class="wrap"><header class="sbar"><div class="row"><a class="icon-btn plain" href="#/home" aria-label="이번 주로 돌아가기" style="color:var(--ink)">' + I.back + '</a><div class="mid"><span class="a">' + esc(s.label) + '</span><span class="b">' + esc(s.range || s.title) + '</span></div>' + sizeBtn(true) + '</div>';
    h += '<nav class="seg" aria-label="모임 순서">' + TABS.map(function (t) {
      var locked = (t[0] === 'read' || t[0] === 'share') ? !readOpen(s) : !allOpen(s);
      return '<a href="#/s/' + s.id + '/' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + (locked ? '<span class="lock">' + I.lock + '</span>' : '') + '</a>';
    }).join('') + '</nav></header>';

    var body = '', action = '';
    if (r.tab === 'read') { body = tRead(s); action = nextBtn('#/s/' + s.id + '/share', '나누기로 넘어가기'); }
    else if (r.tab === 'share') { body = tShare(s); action = nextBtn('#/s/' + s.id + '/talk', '이야기로 넘어가기'); }
    else if (r.tab === 'board') { body = tBoard(s); action = nextBtn('#/s/' + s.id + '/talk', '이야기로 넘어가기'); }
    else if (r.tab === 'talk') { var tt = tTalk(s); body = tt[0]; action = tt[1]; }
    else if (r.tab === 'deep') { body = tDeep(s); action = nextBtn('#/home', '이번 주로 돌아가기'); }
    h += '<main class="smain">' + body + '</main></div>';
    h += '<div class="action"><div class="wrap' + (action.indexOf('data-two') > -1 ? ' two' : '') + '">' + action + '</div></div>';
    if (ui.big && ui.big.id === s.id) h += bigView(s);
    h += '</div>';
    return h;
  }
  function nextBtn(href, label) { return '<a class="btn" href="' + href + '">' + esc(label) + ' ' + I.next + '</a>'; }

  function tRead(s) {
    if (!readOpen(s)) return lockedCard(fmt(readOpenAt(s)) + '에 열려요', '그 전에 책을 먼저 읽어 두셔도 좋아요. 열리면 이번 주 화면에서 바로 보실 수 있어요.');
    var rd = s.read, h = '';
    if (!readReallyOpen(s)) h += previewBanner(readOpenAt(s));
    h += '<article class="reading"><div class="small">오늘 읽을 내용, 약 ' + (rd.minutes || 10) + '분. 문단을 누르면 내 문장으로 담을 수 있어요.</div>';
    h += '<div style="display:flex;flex-direction:column;gap:6px"><h1>' + esc(rd.title) + '</h1>' + (rd.subtitle ? '<div class="sub" style="font-size:.9375rem">' + esc(rd.subtitle) + '</div>' : '') + '</div>';
    var pi = 0;
    rd.blocks.forEach(function (b) {
      if (b.h) { h += '<h2>' + esc(b.h) + '</h2>'; return; }
      var i = pi++;
      h += '<button class="para' + (ui.sel === i ? ' sel' : '') + '" data-act="selp" data-i="' + i + '" aria-pressed="' + (ui.sel === i) + '">' + esc(b.p) + '</button>';
      if (ui.sel === i) h += '<button class="pill-btn grab" data-act="grab" data-i="' + i + '">' + I.plus + ' 이 문단을 내 문장으로 담기</button>';
    });
    if (rd.note) h += '<p class="note-small">' + esc(rd.note) + '</p>';
    var c = S.checks[s.id] || {};
    h += c.read ? '<p class="small" style="margin:0">다 읽음으로 표시했어요.</p>' : '<button class="btn ghost" data-act="readdone" data-sid="' + s.id + '">다 읽었어요</button>';
    h += '</article>';
    return h;
  }
  function paragraphs(s) { return s.read.blocks.filter(function (b) { return b.p; }).map(function (b) { return b.p; }); }

  function subtabs(s, which) {
    var b = ui.board[s.id], n = b && typeof b.count === 'number' ? b.count : '';
    return '<div class="subtabs"><a href="#/s/' + s.id + '/share"' + (which === 'mine' ? ' aria-current="page"' : '') + '>내 문장</a>' +
      '<a href="#/s/' + s.id + '/board"' + (which === 'board' ? ' aria-current="page"' : '') + '>함께 보기' + (canShare() ? ' <span class="count" data-badge="' + s.id + '">' + n + '</span>' : '') + '</a></div>';
  }

  function tShare(s) {
    if (!readOpen(s)) return lockedCard(fmt(readOpenAt(s)) + '에 열려요', '요약이 열리는 날부터 마음에 남은 문장을 적을 수 있어요.');
    var h = '';
    if (SHARING) h += subtabs(s, 'mine');
    h += '<p class="sub" style="color:var(--ink-2);font-size:.9375rem">' + esc((s.share && s.share.intro) || '') + '</p>';
    h += shareForm(s, 'moved', '공감되거나 놀랍게 다가온 부분', '문장을 그대로 옮겨도, 내 말로 적어도 좋아요');
    h += shareForm(s, 'doubt', '의심스럽거나 더 따져 보고 싶은 부분', '정말 그럴까? 싶었던 문장을 적어 보세요');
    if (SHARING && !canShare()) h += '<p class="small" style="margin:0">서로의 문장을 함께 보려면 <a href="#/join">모임 코드</a>를 넣어 주세요.</p>';
    h += '<p class="small" style="margin:0;line-height:1.65">의심하며 읽는 것은 이 책을 잘 읽는 방법입니다. ' + (canShare() ? '나눔판에 올리지 않은 문장은 이 휴대폰에만 남아요.' : '적은 내용은 이 휴대폰에 저장되고 내 노트에 모입니다.') + '</p>';
    return h;
  }
  function shareForm(s, kind, label, ph) {
    var k = s.id + ':' + kind;
    var shareOn = !!S.drafts[k + ':share'];
    var anon = S.drafts[k + ':anon'] !== '0';
    var h = '<section class="card tight"><label class="form-label" for="ta-' + kind + '"><span class="dot' + (kind === 'doubt' ? ' ember' : '') + '"></span>' + esc(label) + '</label>';
    notesOf(s.id, kind).forEach(function (n) {
      var st = n.remoteId ? ('나눔판에 올림' + (n.anon || !S.name ? ', 익명' : ', ' + esc(S.name))) : '내 휴대폰에만';
      var acts = (!n.remoteId && canShare() ? '<button class="linkish" data-act="postnote" data-id="' + n.id + '">나눔판에 올리기</button>' : '') + '<button class="linkish danger" data-act="delnote" data-id="' + n.id + '">지우기</button>';
      h += '<div class="saved' + (kind === 'doubt' ? ' doubt' : '') + '"><div class="q">' + esc(n.body) + '</div><div class="m"><span>' + esc(pageLabel(n.page)) + (n.page ? ', ' : '') + st + '</span><span class="row" style="gap:14px">' + acts + '</span></div></div>';
    });
    h += '<textarea id="ta-' + kind + '" rows="3" data-draft="' + k + '" placeholder="' + esc(ph) + '">' + esc(S.drafts[k] || '') + '</textarea>';
    if (canShare()) {
      h += '<div class="row between" style="flex-wrap:wrap"><button class="switch" data-act="shareon" data-k="' + k + '" aria-pressed="' + shareOn + '"><span class="track"><span class="knob"></span></span>나눔판에도 올리기</button>';
      if (shareOn) {
        h += S.name
          ? '<div class="toggle-2" role="group" aria-label="보이는 이름"><button data-act="anon" data-k="' + k + '" data-v="0" aria-pressed="' + !anon + '">' + esc(S.name) + '</button><button data-act="anon" data-k="' + k + '" data-v="1" aria-pressed="' + anon + '">익명</button></div>'
          : '<span class="small">익명으로 올라가요</span>';
      }
      h += '</div>';
    }
    h += '<div class="row"><label for="pg-' + kind + '" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">쪽수</label><input class="page" id="pg-' + kind + '" type="text" inputmode="numeric" placeholder="쪽" data-draft="' + k + ':page" value="' + esc(S.drafts[k + ':page'] || '') + '">';
    h += '<button class="btn small' + (kind === 'doubt' ? ' ember' : '') + '" data-act="savenote" data-sid="' + s.id + '" data-kind="' + kind + '">저장</button></div>';
    h += '</section>';
    return h;
  }

  function tBoard(s) {
    var h = subtabs(s, 'board');
    if (!SHARING) return h + '<div class="empty">나눔판은 아직 준비 중이에요.</div>';
    if (!canShare()) return h + '<div class="empty">서로의 문장을 함께 보려면 모임 코드가 필요해요.</div><a class="btn ghost" href="#/join">모임 코드 넣기</a>';
    var b = ui.board[s.id];
    if (!b) return h + '<div class="empty">불러오는 중…</div>';
    if (b.err && !b.rows && typeof b.count !== 'number') return h + '<div class="empty">나눔판을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div><button class="btn ghost" data-act="retryboard" data-sid="' + s.id + '">다시 불러오기</button>';
    if (!allOpen(s)) {
      return h + '<div class="locked"><div class="t">지금까지 ' + (b.count || 0) + '개의 문장이 올라왔어요</div><div class="s">서로의 문장은 ' + esc(fmt(allOpenAt(s))) + ' 모임 때 함께 봅니다. 그 전에 내 문장을 올려 두셔도 좋아요.</div><a class="btn small ghost" href="#/s/' + s.id + '/share" style="margin-top:6px">내 문장 적기</a></div>';
    }
    if (!allReallyOpen(s)) h += previewBanner(allOpenAt(s));
    var rows = b.rows || [], f = ui.bfilter;
    var nm = rows.filter(function (x) { return x.kind === 'moved'; }).length, nd = rows.length - nm;
    h += '<div class="row between"><div class="chips" role="group" aria-label="나눔판 거르기">' +
      '<button class="chip" data-act="bfilter" data-v="all" aria-pressed="' + (f === 'all') + '">전체</button>' +
      '<button class="chip" data-act="bfilter" data-v="moved" aria-pressed="' + (f === 'moved') + '">공감·놀람 ' + nm + '</button>' +
      '<button class="chip" data-act="bfilter" data-v="doubt" aria-pressed="' + (f === 'doubt') + '">의심 ' + nd + '</button></div>' +
      '<button class="icon-btn" data-act="bigboard" data-sid="' + s.id + '" aria-label="나눔판 크게 보기">' + I.expand + '</button></div>';
    h += '<div class="live"><span class="d"></span>나도요가 많은 순서예요. 새 문장은 저절로 나타나요.</div>';
    var shown = rows.filter(function (x) { return f === 'all' || x.kind === f; });
    if (!shown.length) h += '<div class="empty">아직 올라온 문장이 없어요. 첫 문장을 올려 보세요.</div>';
    shown.forEach(function (x) {
      var who = x.display_name ? esc(x.display_name) : '익명';
      var pg = pageLabel(x.page);
      h += '<div class="post"><div class="head"><span class="tag' + (x.kind === 'doubt' ? ' doubt' : '') + '">' + kindLabel(x.kind) + '</span><span class="small">' + who + (pg ? ', ' + esc(pg) : '') + '</span></div>' +
        '<div class="body' + (x.kind === 'moved' ? ' serif' : '') + '">' + esc(x.body) + '</div><div class="foot">' +
        '<button class="like" data-act="like" data-sid="' + s.id + '" data-id="' + esc(x.id) + '" aria-pressed="' + !!x.liked + '">나도요 ' + (x.likes || 0) + '</button>' +
        '<span class="row" style="gap:14px">' + (x.mine ? '<span class="small">내 글</span>' : '') + (isLeader() ? '<button class="linkish danger" data-act="hide" data-sid="' + s.id + '" data-id="' + esc(x.id) + '">숨기기</button>' : '') + '</span></div></div>';
    });
    return h;
  }

  function tTalk(s) {
    if (!allOpen(s)) return [lockedCard(fmt(allOpenAt(s)) + ' 모임 때 열려요', '세 가지 질문은 모임 자리에서 함께 열어 봅니다.'), nextBtn('#/s/' + s.id + '/share', '나누기로 돌아가기')];
    var qs = s.questions || [], n = qs.length, i = Math.min(ui.q[s.id] || 0, n - 1), q = qs[i];
    var h = '';
    if (!allReallyOpen(s)) h += previewBanner(allOpenAt(s));
    h += '<div class="qhead"><div class="row" style="gap:10px"><span style="font-size:.875rem;font-weight:600">질문 ' + (i + 1) + ' / ' + n + '</span><span class="dots" aria-hidden="true">' + qs.map(function (_, j) { return '<span' + (j === i ? ' class="on"' : '') + '></span>'; }).join('') + '</span></div>' +
      '<button class="pill-btn" data-act="bigq" data-sid="' + s.id + '">' + I.expand + ' 크게 보기</button></div>';
    h += '<section class="card"><div class="eyebrow">' + esc(KN[i] || '') + ', ' + esc(q.title) + '</div><div class="question">' + esc(q.q) + '</div>';
    if (q.hints && q.hints.length) h += '<div class="helps"><div class="t">생각을 돕는 물음</div>' + q.hints.map(function (x) { return '<div class="h">' + esc(x) + '</div>'; }).join('') + '</div>';
    if (q.bridge) h += '<div class="bridge"><b>책과 이어지는 곳</b> ' + esc(q.bridge) + '</div>';
    h += '</section>';
    var memo = S.notes.filter(function (x) { return x.sid === s.id && x.kind === 'memo' && x.qi === i; })[0];
    h += '<div class="field"><label for="memo">내 생각 메모</label><textarea id="memo" rows="3" data-memo="' + s.id + ':' + i + '" placeholder="떠오른 장면이나 사람을 짧게 적어 두세요. 내 노트에 저절로 모여요.">' + esc(memo ? memo.body : '') + '</textarea></div>';
    var prev = '<button class="btn ghost" data-act="qprev" data-sid="' + s.id + '"' + (i === 0 ? ' disabled' : '') + ' data-two="1">이전 질문</button>';
    var nxt = i < n - 1 ? '<button class="btn" data-act="qnext" data-sid="' + s.id + '">다음 질문</button>' : '<a class="btn" href="#/s/' + s.id + '/deep">더 깊이로 ' + I.next + '</a>';
    return [h, prev + nxt];
  }

  function tDeep(s) {
    if (!allOpen(s)) return lockedCard(fmt(allOpenAt(s)) + ' 모임 때 열려요', '더 깊이 알아볼 거리와 하나님 나라의 눈으로 읽기는 모임을 마칠 때 함께 엽니다.');
    var h = '';
    if (!allReallyOpen(s)) h += previewBanner(allOpenAt(s));
    ((s.deep && s.deep.sections) || []).forEach(function (sec) {
      if (sec.type === 'link') {
        h += '<section class="card tight"><div class="label-strong">' + esc(sec.title) + '</div><div class="prose"><p>' + esc(sec.p) + '</p></div><a class="ext" href="' + esc(sec.url) + '" target="_blank" rel="noopener" style="background:var(--ground)"><span class="t">' + esc(sec.label || sec.url) + '</span>' + I.ext + '</a></section>';
      } else if (sec.type === 'stats') {
        var max = Math.max.apply(null, sec.stats.map(function (x) { return x.value; }));
        h += '<section class="card tight"><div style="display:flex;flex-direction:column;gap:4px"><div class="eyebrow">' + esc(sec.title) + '</div>' + (sec.lead ? '<div style="font-size:1rem;font-weight:600;line-height:1.5">' + esc(sec.lead) + '</div>' : '') + '</div>';
        h += '<div style="display:flex;flex-direction:column;gap:10px">' + sec.stats.map(function (x) {
          return '<div class="stat"><div class="l"><span>' + esc(x.label) + '</span><b>' + x.value + esc(x.unit || '') + '</b></div><div class="track"><div class="fill" style="width:' + Math.max(2, Math.round(x.value / max * 100)) + '%"></div></div></div>';
        }).join('') + '</div>';
        if (sec.p) h += '<div class="prose"><p>' + esc(sec.p) + '</p></div>';
        if (sec.source) h += '<div class="small">' + esc(sec.source) + '</div>';
        h += '</section>';
      } else {
        h += '<section class="card tight"><div style="display:flex;flex-direction:column;gap:2px"><div class="label-strong">' + esc(sec.title) + '</div>' + (sec.lead ? '<div class="small">' + esc(sec.lead) + '</div>' : '') + '</div><div class="prose"><p>' + esc(sec.p) + '</p></div>' + (sec.q ? '<div class="ask">' + esc(sec.q) + '</div>' : '') + '</section>';
      }
    });
    if (s.kingdom && s.kingdom.items) {
      h += '<section style="display:flex;flex-direction:column;gap:8px"><div class="label-strong" style="padding-top:4px">하나님 나라의 눈으로</div>';
      if (s.kingdom.intro) h += '<p class="sub">' + esc(s.kingdom.intro) + '</p>';
      s.kingdom.items.forEach(function (it, j) {
        var key = s.id + ':' + j, open = ui.acc[key] != null ? ui.acc[key] : j === 0;
        h += '<div class="acc"><button data-act="acc" data-k="' + key + '" data-open="' + open + '" aria-expanded="' + open + '"><span style="display:flex;flex-direction:column;gap:2px"><span class="t">' + esc(it.title) + '</span><span class="r">' + esc(it.ref) + '</span></span>' + (open ? I.up : I.down) + '</button>';
        if (open) h += '<div class="in"><p>' + esc(it.p) + '</p><div class="ask">' + esc(it.q) + '</div></div>';
        h += '</div>';
      });
      h += '</section>';
    }
    if (s.next) {
      h += '<section class="card tight" style="background:var(--forest-tint)"><div class="label-strong" style="color:var(--forest)">다음 모임까지</div><div class="meta">' +
        (s.next.range ? '<div><span>읽을 범위</span><span style="font-weight:400;line-height:1.6">' + esc(s.next.range) + '</span></div>' : '') +
        (s.next.task ? '<div><span>관찰 과제</span><span style="font-weight:400;line-height:1.6">' + esc(s.next.task) + '</span></div>' : '') + '</div></section>';
    }
    return h;
  }

  function bigView(s) {
    if (ui.big.type === 'q') {
      var qs = s.questions || [], n = qs.length, i = Math.min(ui.q[s.id] || 0, n - 1), q = qs[i];
      return '<div class="big" role="dialog" aria-modal="true" aria-label="질문 크게 보기"><div class="bar"><span class="k">' + esc(s.label) + ', 질문 ' + (i + 1) + ' / ' + n + '</span><button class="close" data-act="bigclose">닫기</button></div>' +
        '<div class="center"><div class="bq">' + esc(q.q) + '</div>' + (q.hints || []).map(function (x) { return '<div class="bh">' + esc(x) + '</div>'; }).join('') + '</div>' +
        '<div class="nav"><button data-act="qprev" data-sid="' + s.id + '"' + (i === 0 ? ' disabled' : '') + '>이전 질문</button><button data-act="qnext" data-sid="' + s.id + '"' + (i >= n - 1 ? ' disabled' : '') + '>다음 질문</button></div></div>';
    }
    var b = ui.board[s.id] || {}, rows = (b.rows || []).filter(function (x) { return ui.bfilter === 'all' || x.kind === ui.bfilter; });
    return '<div class="big" role="dialog" aria-modal="true" aria-label="나눔판 크게 보기"><div class="bar"><span class="k">' + esc(s.label) + ' 나눔판, ' + rows.length + '개의 문장</span><button class="close" data-act="bigclose">닫기</button></div>' +
      '<div class="wall">' + (rows.length ? rows.map(function (x) {
        return '<div class="w"><div class="x">' + esc(x.body) + '</div><div class="y"><span>' + kindLabel(x.kind) + ', ' + (x.display_name ? esc(x.display_name) : '익명') + '</span><span>나도요 ' + (x.likes || 0) + '</span></div></div>';
      }).join('') : '<div class="w"><div class="x">아직 올라온 문장이 없어요.</div></div>') + '</div></div>';
  }

  /* ---------- 그리기 ---------- */
  function render() {
    var r = parse(), html;
    if (r.name === 'join') html = vJoin();
    else if (r.name === 'sessions') html = vSessions();
    else if (r.name === 'notes') html = vNotes();
    else if (r.name === 'settings') html = vSettings();
    else if (r.name === 's') html = vSession(r);
    else html = vHome();
    $app.innerHTML = html;
    document.body.style.overflow = ui.big ? 'hidden' : '';
  }

  /* ---------- 동작 ---------- */
  function sessOf(el) { return SESS[el.getAttribute('data-sid')]; }
  var ACT = {
    size: function () {
      var order = SIZES.map(function (x) { return x[0]; });
      S.size = order[(order.indexOf(S.size) + 1) % order.length]; save();
      document.documentElement.setAttribute('data-size', S.size);
      toast('글자 크기: ' + SIZES.filter(function (x) { return x[0] === S.size; })[0][1]);
    },
    setsize: function (t) { S.size = t.getAttribute('data-v'); save(); document.documentElement.setAttribute('data-size', S.size); render(); },
    check: function (t) {
      var sid = t.getAttribute('data-sid'), k = t.getAttribute('data-k');
      S.checks[sid] = S.checks[sid] || {};
      var on = t.getAttribute('aria-pressed') === 'true';
      S.checks[sid][k] = !on; save(); render();
    },
    selp: function (t) { var i = Number(t.getAttribute('data-i')); ui.sel = ui.sel === i ? null : i; render(); },
    grab: function (t) {
      var r = parse(), s = SESS[r.id]; if (!s) return;
      var text = paragraphs(s)[Number(t.getAttribute('data-i'))] || '';
      var k = s.id + ':moved';
      S.drafts[k] = S.drafts[k] ? S.drafts[k] + '\n' + text : text;
      if (!S.drafts[k + ':page']) S.drafts[k + ':page'] = '요약';
      save();
      location.hash = '#/s/' + s.id + '/share';
      toast('문단을 담았어요. 필요한 만큼만 남기고 저장하세요.');
    },
    readdone: function (t) {
      var sid = t.getAttribute('data-sid');
      S.checks[sid] = S.checks[sid] || {}; S.checks[sid].read = true; save();
      toast('다 읽음으로 표시했어요'); render();
    },
    shareon: function (t) { var k = t.getAttribute('data-k'); S.drafts[k + ':share'] = !S.drafts[k + ':share']; save(); render(); },
    anon: function (t) { S.drafts[t.getAttribute('data-k') + ':anon'] = t.getAttribute('data-v'); save(); render(); },
    savenote: function (t) {
      var s = sessOf(t), kind = t.getAttribute('data-kind'), k = s.id + ':' + kind;
      var body = (S.drafts[k] || '').trim();
      if (!body) { toast('먼저 문장을 적어 주세요.'); var ta = document.getElementById('ta-' + kind); if (ta) ta.focus(); return; }
      var n = { id: uid(), sid: s.id, kind: kind, body: body.slice(0, 1000), page: (S.drafts[k + ':page'] || '').trim().slice(0, 20), anon: S.drafts[k + ':anon'] !== '0', createdAt: Date.now() };
      var wantShare = canShare() && !!S.drafts[k + ':share'];
      S.notes.push(n);
      S.drafts[k] = ''; S.drafts[k + ':page'] = '';
      save();
      if (wantShare) {
        t.disabled = true;
        return postNote(n).then(function (ok) {
          if (ok) toast('저장하고 나눔판에 올렸어요');
          render();
          if (ok) refreshBoard(s.id);
        });
      }
      toast('저장했어요'); render();
    },
    postnote: function (t) {
      var n = S.notes.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
      if (!n || !canShare()) return;
      t.disabled = true;
      return postNote(n).then(function (ok) { if (ok) toast('나눔판에 올렸어요'); render(); });
    },
    delnote: function (t) {
      var id = t.getAttribute('data-id');
      var n = S.notes.filter(function (x) { return x.id === id; })[0];
      if (!n) return;
      if (!window.confirm(n.remoteId ? '이 문장을 지울까요? 나눔판에서도 함께 지워져요.' : '이 기록을 지울까요?')) return;
      function drop() { S.notes = S.notes.filter(function (x) { return x.id !== id; }); save(); toast('지웠어요'); render(); }
      if (n.remoteId && canShare()) {
        return rpc('bookclub_delete_mine', { p_code: S.code, p_note: n.remoteId, p_device: S.deviceId })
          .then(function () { drop(); refreshBoard(n.sid, false); })
          .catch(function () { toast('나눔판에서 지우지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'); });
      }
      drop();
    },
    nfilter: function (t) { ui.nfilter = t.getAttribute('data-v'); render(); },
    bfilter: function (t) { ui.bfilter = t.getAttribute('data-v'); render(); },
    retryboard: function (t) { var sid = t.getAttribute('data-sid'); ui.board[sid] = null; render(); refreshBoard(sid); },
    like: function (t) {
      var sid = t.getAttribute('data-sid'), id = t.getAttribute('data-id');
      var b = ui.board[sid]; if (!b || !b.rows) return;
      var row = b.rows.filter(function (x) { return String(x.id) === id; })[0]; if (!row) return;
      row.liked = !row.liked; row.likes = (row.likes || 0) + (row.liked ? 1 : -1); render();
      return rpc('bookclub_toggle_like', { p_code: S.code, p_note: id, p_device: S.deviceId })
        .then(function (n) { if (typeof n === 'number') { row.likes = n; render(); } })
        .catch(function () { row.liked = !row.liked; row.likes += row.liked ? 1 : -1; render(); toast('나도요를 남기지 못했어요.'); });
    },
    hide: function (t) {
      var sid = t.getAttribute('data-sid'), id = t.getAttribute('data-id');
      if (!window.confirm('이 글을 나눔판에서 숨길까요?')) return;
      return rpc('bookclub_hide', { p_code: S.code, p_pin: S.leaderPin, p_note: id }).then(function (ok) {
        if (ok) { var b = ui.board[sid]; if (b && b.rows) b.rows = b.rows.filter(function (x) { return String(x.id) !== id; }); toast('숨겼어요'); render(); }
        else toast('인도자 PIN을 확인해 주세요.');
      }).catch(function () { toast('숨기지 못했어요. 인터넷 연결을 확인해 주세요.'); });
    },
    qprev: function (t) { var sid = t.getAttribute('data-sid'); ui.q[sid] = Math.max(0, (ui.q[sid] || 0) - 1); render(); if (!ui.big) window.scrollTo(0, 0); },
    qnext: function (t) { var s = sessOf(t); ui.q[s.id] = Math.min((s.questions || []).length - 1, (ui.q[s.id] || 0) + 1); render(); if (!ui.big) window.scrollTo(0, 0); },
    bigq: function (t) { ui.big = { type: 'q', id: t.getAttribute('data-sid') }; render(); },
    bigboard: function (t) { ui.big = { type: 'board', id: t.getAttribute('data-sid') }; render(); },
    bigclose: function () { ui.big = null; render(); },
    acc: function (t) { var k = t.getAttribute('data-k'); ui.acc[k] = t.getAttribute('data-open') !== 'true'; render(); },
    joinskip: function () { S.joined = true; S.code = ''; save(); location.hash = '#/home'; },
    savename: function () {
      var el = document.getElementById('nm'); S.name = (el ? el.value : '').trim().slice(0, 30); save();
      toast(S.name ? '이름을 저장했어요' : '이제 익명으로 올라가요'); render();
    },
    leaderon: function () {
      var pin = ((document.getElementById('pin') || {}).value || '').trim();
      if (!pin) { toast('인도자 PIN을 넣어 주세요.'); return; }
      function ok() { S.leaderPin = pin; save(); toast('인도자 모드를 켰어요'); render(); }
      if (SHARING && S.code) {
        return rpc('bookclub_check_leader', { p_code: S.code, p_pin: pin })
          .then(function (good) { if (good) ok(); else toast('PIN이 맞지 않아요.'); })
          .catch(function () { toast('확인하지 못했어요. 인터넷 연결을 확인해 주세요.'); });
      }
      if (CFG.leaderPin && String(CFG.leaderPin) === pin) ok(); else toast('PIN이 맞지 않아요.');
    },
    leaderoff: function () { S.leaderPin = ''; save(); toast('인도자 모드를 껐어요'); render(); },
    export: function () {
      var text = exportText();
      if (navigator.share) { navigator.share({ title: '내 노트', text: text }).catch(function () {}); return; }
      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { toast('내 노트를 복사했어요. 원하는 곳에 붙여 넣으세요.'); }); return; }
      window.prompt('아래 내용을 복사하세요', text);
    },
    resetall: function () {
      if (!window.confirm('이 휴대폰에 저장된 내 기록을 모두 지울까요? 나눔판에 올린 글은 남아요.')) return;
      S.notes = []; S.checks = {}; S.drafts = {}; save(); toast('모두 지웠어요'); render();
    }
  };
  function exportText() {
    var out = ['『1도의 가격』 함께 읽기, 내 노트', ''];
    INDEX.sessions.forEach(function (m) {
      var ns = notesOf(m.id); if (!ns.length) return;
      out.push('[' + m.label + '] ' + m.title);
      ns.forEach(function (n) {
        var extra = n.kind === 'memo' ? ' (' + (n.qTitle || '질문') + ')' : (n.page ? ' (' + pageLabel(n.page) + ')' : '');
        out.push('- ' + kindLabel(n.kind) + extra + ': ' + n.body);
      });
      out.push('');
    });
    if (out.length === 2) out.push('아직 적은 내용이 없어요.');
    return out.join('\n');
  }
  function setMemo(key, val) {
    var p = key.split(':'), sid = p[0], qi = Number(p[1]);
    var s = SESS[sid], existing = S.notes.filter(function (x) { return x.sid === sid && x.kind === 'memo' && x.qi === qi; })[0];
    var v = val.trim();
    if (!v) { if (existing) S.notes = S.notes.filter(function (x) { return x !== existing; }); save(); return; }
    if (existing) { existing.body = val.slice(0, 2000); }
    else S.notes.push({ id: uid(), sid: sid, kind: 'memo', qi: qi, qTitle: s && s.questions[qi] ? s.questions[qi].title : '', body: val.slice(0, 2000), createdAt: Date.now() });
    save();
  }

  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var fn = ACT[t.getAttribute('data-act')];
    if (fn) { e.preventDefault(); fn(t, e); }
  });
  $app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-draft')) { S.drafts[t.getAttribute('data-draft')] = t.value; save(); }
    if (t.hasAttribute('data-memo')) setMemo(t.getAttribute('data-memo'), t.value);
  });
  $app.addEventListener('submit', function (e) {
    if (e.target.id !== 'joinform') return;
    e.preventDefault();
    var code = (document.getElementById('code').value || '').trim();
    var nick = (document.getElementById('nick').value || '').trim().slice(0, 30);
    ui.joinCode = code;
    if (!code) { ui.joinErr = '모임 코드를 넣어 주세요. 코드가 없으면 아래의 코드 없이 둘러보기를 누르세요.'; render(); return; }
    ui.busy = true; ui.joinErr = ''; render();
    rpc('bookclub_check_code', { p_code: code }).then(function (ok) {
      ui.busy = false;
      if (ok) { S.code = code; S.name = nick; S.joined = true; save(); location.hash = '#/home'; toast('반가워요. 이제 함께 읽어요.'); }
      else { ui.joinErr = '코드가 맞지 않아요. 띄어쓰기까지 그대로 넣었는지 확인해 주세요.'; render(); }
    }).catch(function () {
      ui.busy = false; ui.joinErr = '연결하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'; render();
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.big) { ui.big = null; render(); }
  });

  /* ---------- 시작 ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  $app.innerHTML = '<div class="loading">불러오는 중…</div>';
  getJSON('content/index.json').then(function (d) { INDEX = d; route(); }).catch(function () {
    $app.innerHTML = '<div class="loading">자료를 불러오지 못했어요.<br>인터넷 연결을 확인한 뒤 다시 열어 주세요.</div>';
  });
})();
