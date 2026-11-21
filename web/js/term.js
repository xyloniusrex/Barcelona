/* term.js — summonable command line + keyboard navigation.
 *
 * Summon with ` (backquote). Hidden by default; nothing renders until it is
 * opened. Commands: go <screen>, settings:theme:dark|light,
 * settings:language:en|ro, settings:mode:explore|journey, refresh, login,
 * admin, logout, help, clear, close. ArrowUp/ArrowDown (with no text field
 * focused) move keyboard focus through the active screen; Enter activates.
 */
const Term = (() => {
  let box = null, out = null, input = null;
  let open = false;
  let history = [], histPos = -1;

  function build() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'term';
    box.hidden = true;
    box.innerHTML =
      '<div id="term-out" class="term-out" aria-live="polite"></div>' +
      '<div class="term-in-row"><span class="term-prompt">&gt;</span>' +
      '<input id="term-in" autocomplete="off" spellcheck="false" /></div>' +
      '<p class="term-hint">` close</p>';
    document.body.appendChild(box);
    out = box.querySelector('#term-out');
    input = box.querySelector('#term-in');
    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const line = input.value.trim();
        input.value = '';
        histPos = -1;
        if (line) { history.push(line); await exec(line); }
      } else if (e.key === 'ArrowUp') {
        if (histPos < 0) histPos = history.length;
        histPos = Math.max(0, histPos - 1);
        input.value = history[histPos] || '';
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        histPos = Math.min(history.length, histPos + 1);
        input.value = history[histPos] || '';
      } else if (e.key === 'Escape') {
        hide();
      }
    });
    print('poligo terminal - type help');
  }

  function show() {
    build();
    open = true;
    box.hidden = false;
    input.focus();
    print('ready.');
  }

  function hide() {
    open = false;
    if (box) { box.hidden = true; input.blur(); }
  }

  function toggle() { open ? hide() : show(); }

  function print(line, cls) {
    if (!out) return;
    const el = document.createElement('p');
    if (cls) el.className = cls;
    el.textContent = line;
    out.appendChild(el);
    out.scrollTop = out.scrollHeight;
  }

  function focusables() {
    const all = document.querySelectorAll('#app button, #app input, #app select, #app textarea, #app [tabindex="0"], #bottomNav button, #topBar button');
    return [].filter.call(all, el => el.offsetParent !== null && !el.disabled);
  }

  function arrowFocus(dir) {
    const els = focusables();
    if (!els.length) return;
    const cur = document.activeElement;
    let i = els.indexOf(cur);
    if (i === -1) i = dir > 0 ? -1 : 0;
    const next = els[(i + dir + els.length) % els.length];
    if (next) next.focus();
  }

  const SCREENS = ['landing', 'auth', 'onboarding', 'docsSetup', 'map', 'universities', 'shortlist', 'subjects', 'profile', 'today', 'calendar', 'timeline', 'docs', 'admin', 'uni', 'scanJ'];

  const COMMANDS = {
    help: () => [
      'go <screen>       ' + SCREENS.join(' / '),
      'settings:theme:dark|light',
      'settings:language:en|ro',
      'settings:mode:explore|journey',
      'login             open the upt mail sign-in screen',
      'admin             open the admin screen (token entry inside)',
      'logout            end the session on this device',
      'refresh           reload all data from the server and re-render',
      'clear, close      clear output / hide this terminal',
      'keyboard: arrows move focus between controls, activate with Enter',
    ],
    go: (arg) => {
      const s = (arg || '').trim().toLowerCase();
      if (SCREENS.indexOf(s) === -1) return ['unknown screen: ' + s + ' - try: ' + SCREENS.join(' / ')];
      App.go(s === 'uni' ? 'universities' : s, { replace: true });
      return ['-> ' + s];
    },
    settings: (arg) => {
      const parts = (arg || '').split(':').map(x => x.trim().toLowerCase());
      const key = parts[0], val = parts[1];
      if (!val) return ['usage: settings:<key>:<value>  keys: theme, language, mode'];
      if (key === 'theme') {
        if (val !== 'dark' && val !== 'light') return ['theme must be dark or light'];
        Store.setTheme(val);
        App.render();
        return ['theme -> ' + val];
      }
      if (key === 'language') {
        return ['language...']; // replaced below (async)
      }
      if (key === 'mode') {
        if (['explore', 'journey'].indexOf(val) === -1) return ['mode must be explore or journey'];
        Store.saveProfile({}, val).then(() => App.render());
        return ['mode -> ' + val];
      }
      return ['unknown setting: ' + key + ' - keys: theme, language, mode'];
    },
    login: () => { App.go('auth', { replace: true }); return ['-> auth: enter your upts mail']; },
    admin: () => { App.go('admin', { replace: true }); return ['-> admin']; },
    logout: async () => { await Store.logout(); App.go('landing', { replace: true }); return ['signed out']; },
    refresh: async () => {
      await Store.boot();
      App.render();
      return ['data refreshed from server'];
    },
    clear: () => { if (out) out.innerHTML = ''; return []; },
    close: () => { hide(); return []; },
  };

  async function exec(line) {
    print('> ' + line, 'term-echo');
    const [cmdRaw, ...rest] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    let fn = COMMANDS[cmd];
    let result;
    if (!fn) {
      // dotted form: settings:theme:dark comes in as one token
      const parts = line.split(':');
      if (COMMANDS[parts[0].toLowerCase()]) fn = COMMANDS[parts[0].toLowerCase()], rest[0] = parts.slice(1).join(':');
    }
    if (!fn) { print('unknown command: ' + cmd + ' - try help'); return; }
    try {
      if (cmd === 'settings' && rest[0] && rest[0].indexOf(':') !== -1) {
        const kv = rest[0].split(':');
        if (kv[0].toLowerCase() === 'language') {
          const out2 = await Store.setLanguage(kv[1] || 'en');
          App.render();
          result = ['language -> ' + (kv[1] || 'en') + (out2 && out2.saved ? ' (translations cached)' : '')];
        } else {
          result = await fn(rest.join(' '));
        }
      } else {
        result = await fn(rest.join(' '));
      }
      for (const l of result || []) print(l);
    } catch (e) {
      print((e && e.code ? e.code + ': ' : '') + (e && e.message ? e.message : 'command failed'), 'term-err');
    }
  }

  document.addEventListener('keydown', e => {
    const inField = /^(input|textarea|select)$/i.test(document.activeElement.tagName);
    if (e.key === '`' || (e.ctrlKey && e.key === '`')) {
      e.preventDefault();
      toggle();
      return;
    }
    if (open) {
      if (e.key === 'Escape') { hide(); }
      return;
    }
    if (document.activeElement && document.activeElement.id === 'anim') return;
    if (inField) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      arrowFocus(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape') {
      App.goBack();
    }
  });

  return { toggle, show, hide, exec: l => { show(); return exec(l); }, isOpen: () => open };
})();
