/* term.js — summonable command line + keyboard navigation.
 *
 * Summon with ` or ~ (any keyboard layout, detection by physical key) or
 * Ctrl+`. Hidden by default. Fish-style completion: a ghost suggestion is
 * shown while typing; Tab or ArrowRight (at the end of the line) accepts it;
 * Tab lists all completions when several commands share the prefix. Input
 * history on ArrowUp/ArrowDown. Outside the input, arrows move keyboard
 * focus between controls and Escape goes back.
 */
const Term = (() => {
  let box = null, out = null, input = null, gTyped = null, gRest = null;
  let open = false;
  let history = [], histPos = -1;

  const SCREENS = ['home', 'landing', 'auth', 'onboarding', 'map', 'universities', 'shortlist', 'subjects', 'profile', 'today', 'plan', 'docs', 'admin', 'uni', 'scanJ'];
  const THEME_VALUES = ['dark', 'light'];
  const LANGUAGE_VALUES = ['en', 'ro'];
  const MODE_VALUES = ['explore', 'journey'];

  function completionsFor(line) {
    line = line.toLowerCase();
    if (line === 'go' || line.startsWith('go ')) {
      const arg = line.slice(line.length > 2 ? 3 : 2);
      return SCREENS.filter(s => arg === '' || s.startsWith(arg)).map(s => 'go ' + s);
    }
    const cmds = [
      'help', '--help', 'go ', 'login', 'admin', 'logout', 'refresh', 'clear', 'close',
      'settings:theme:dark', 'settings:theme:light',
      'settings:language:en', 'settings:language:ro',
      'settings:mode:explore', 'settings:mode:journey',
    ];
    if (line.startsWith('settings:')) {
      return COMPLETE_settings(line).map(s => 'settings:' + s);
    }
    return cmds.filter(c => c.startsWith(line));
  }

  function COMPLETE_settings(line) {
    const keys = ['theme:', 'language:', 'mode:'];
    const rest = line.slice(9);
    if (rest === '') return keys.map(k => k.slice(0, -1));
    for (const [k, values] of [['theme:', THEME_VALUES], ['language:', LANGUAGE_VALUES], ['mode:', MODE_VALUES]]) {
      if (rest.startsWith(k)) {
        return values.filter(v => v.startsWith(rest.slice(k.length))).map(v => k + v);
      }
      if (k.startsWith(rest)) return [k];
    }
    return [];
  }

  function build() {
    if (box) return;
    box = document.createElement('div');
    box.id = 'term';
    box.hidden = true;
    box.innerHTML =
      '<div id="term-out" class="term-out" aria-live="polite"></div>' +
      '<div class="term-in-row"><span class="term-prompt">&gt;</span>' +
      '<span class="term-line"><input id="term-in" autocomplete="off" spellcheck="false" />' +
      '<span class="term-ghost" aria-hidden="true"><span class="g-typed"></span><span class="g-rest"></span></span>' +
      '</span></div>' +
      '<p class="term-hint">` close - tab or right arrow accepts - arrows move focus outside the input</p>';
    document.body.appendChild(box);
    out = box.querySelector('#term-out');
    input = box.querySelector('#term-in');
    gTyped = box.querySelector('.g-typed');
    gRest = box.querySelector('.g-rest');

    input.addEventListener('input', () => drawGhost());
    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const line = suggestion() || input.value.trim();
        input.value = '';
        drawGhost();
        histPos = -1;
        if (!line) return;
        history.push(line);
        await exec(line);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        completeOrList();
      } else if (e.key === 'ArrowRight' && atEnd()) {
        const sugg = suggestion();
        if (sugg) { e.preventDefault(); input.value = sugg; drawGhost(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histPos < 0) histPos = history.length;
        histPos = Math.max(0, histPos - 1);
        input.value = history[histPos] || '';
        drawGhost();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        histPos = Math.min(history.length, histPos + 1);
        input.value = history[histPos] || '';
        drawGhost();
      } else if (e.key === 'Escape') {
        e.preventDefault();   // the document handler below must not also go "back"
        hide();
      }
    });
    print('poligo terminal - type --help for the full tutorial - tab completes like fish');
  }

  function atEnd() {
    return input.selectionStart === input.value.length && input.selectionStart === input.selectionEnd;
  }

  function suggestion() {
    const cands = completionsFor(input.value.trim().toLowerCase());
    if (!cands.length || cands.length === 1 && cands[0] === input.value.trim().toLowerCase()) return '';
    const v = input.value.trim().toLowerCase();
    const hit = cands.find(c => c !== v);
    return hit || '';
  }

  function commonPrefix(lines) {
    if (!lines.length) return '';
    let p = lines[0];
    for (const l of lines) {
      let i = 0;
      while (i < p.length && i < l.length && p[i] === l[i]) i++;
      p = p.slice(0, i);
    }
    return p;
  }

  function completeOrList() {
    const v = input.value.trim().toLowerCase();
    if (!v) { drawGhost(); return; }
    const cands = completionsFor(v);
    if (!cands.length) return;
    if (cands.length === 1) {
      input.value = cands[0];
    } else {
      const common = commonPrefix(cands);
      if (common.length > v.length) input.value = common;
      print(cands.join('   '));
    }
    drawGhost();
  }

  function drawGhost() {
    const rest = suggestion();
    const v = input.value;
    gTyped.textContent = v;
    gRest.textContent = rest.slice(v.length);
  }

  function show() {
    build();
    open = true;
    box.hidden = false;
    drawGhost();
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
    const all = document.querySelectorAll('#app button, #app input, #app select, #app textarea, #app [tabindex="0"], #topBar button');
    return [].filter.call(all, el => el.offsetParent !== null && !el.disabled && el.id !== 'term-in');
  }

  function arrowFocus(dir) {
    const els = focusables();
    if (!els.length) return;
    const cur = document.activeElement;
    let i = els.indexOf(cur);
    if (i === -1) i = dir > 0 ? -1 : 0;
    const next = els[(i + dir + els.length) % els.length];
    if (next) {
      next.focus();
      if (next.scrollIntoView) next.scrollIntoView({ block: 'nearest' });
    }
  }

  const TUTORIAL = [
    'poligo terminal - what and how',
    '',
    'summoning this box:      ` (backquote) or ~ - any layout - also ctrl+`',
    'closing:                 ` again, or escape',
    '',
    'completion (fish style): while you type, dim ghost text shows the suggestion behind the cursor.',
    '  tab                    accept the suggestion, or complete to the shared prefix',
    '  tab (many matches)     lists every matching command',
    '  right arrow            accept, same as tab',
    '  enter                  runs what is visible (suggestion included)',
    '  up / down in input     walk through your command history',
    '',
    'navigation (when this input is NOT focused):',
    '  up / down / left / right arrows   move a highlight through every control on screen',
    '  enter                             activate the highlighted control',
    '  escape                            back one screen',
    '',
    'commands:',
    '  -- help                 show this tutorial',
    '  go <screen>             jump anywhere. screens:',
    '                            map  universities  shortlist  subjects  profile',
    '                            today  plan  docs',
    '                            admin  (admin panel)',
    '  settings:<key>:<value>  change app settings instantly:',
    '                            theme:    dark | light',
    '                            language: en | ro   (generated once, cached)',
    '                            mode:     explore | journey',
    '                            example:  settings:theme:light',
    '  refresh                 re-pull all data from the server and re-render',
    '  login                   open the upt mail sign-in screen',
    '  admin                   open the admin panel (token prompt inside)',
    '  logout                  end the session on this device',
    '  clear / close           wipe the output / hide this terminal',
    '',
    'try: type se and watch the ghost, then press tab until settings:language:ro is complete, then enter.',
  ];

  const COMMANDS = {
    help: () => TUTORIAL,
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
        if (THEME_VALUES.indexOf(val) === -1) return ['theme must be dark or light'];
        Store.setTheme(val);
        App.render();
        return ['theme -> ' + val];
      }
      if (key === 'mode') {
        if (MODE_VALUES.indexOf(val) === -1) return ['mode must be explore or journey'];
        Store.saveProfile({}, val).then(() => App.render());
        return ['mode -> ' + val];
      }
      return ['unknown setting: ' + key + ' - keys: theme, language, mode'];
    },
    login: () => { App.go('auth', { replace: true }); return ['-> auth: enter your upt mail']; },
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
    try {
      if (line.toLowerCase().startsWith('settings:')) {
        const out2 = await settingsCommand(line);
        if (typeof out2 === 'string') { print(out2, 'term-err'); return; }
        for (const l of out2) print(l);
        return;
      }
      const [cmd, ...rest] = line.split(/\s+/);
      const c = cmd.toLowerCase();
      const fn = COMMANDS[c === '--help' || c === '-h' || c === '?' ? 'help' : c];
      if (!fn) { print('unknown command: ' + cmd + ' - try help', 'term-err'); return; }
      const result = await fn(rest.join(' '));
      for (const l of result || []) print(l);
    } catch (e) {
      print((e && e.code ? e.code + ': ' : '') + (e && e.message ? e.message : 'command failed'), 'term-err');
    }
  }

  async function settingsCommand(line) {
    // line: settings:<key>:<value>
    const parts = line.split(':').map(x => x.trim().toLowerCase());
    const key = parts[1], val = parts[2];
    if (!key) return 'usage: settings:<key>:<value>  keys: theme, language, mode';
    if (key === 'theme') {
      if (THEME_VALUES.indexOf(val) === -1) return 'theme must be dark or light';
      Store.setTheme(val);
      App.render();
      return ['theme -> ' + val];
    }
    if (key === 'language') {
      const lang = LANGUAGE_VALUES.indexOf(val) !== -1 ? val : 'en';
      await Store.setLanguage(lang);
      App.render();
      return ['language -> ' + lang];
    }
    if (key === 'mode') {
      if (MODE_VALUES.indexOf(val) === -1) return 'mode must be explore or journey';
      await Store.saveProfile({}, val);
      App.render();
      return ['mode -> ' + val];
    }
    return 'unknown setting: ' + key + ' - keys: theme, language, mode';
  }

  document.addEventListener('keydown', e => {
    const inField = /^(input|textarea|select)$/i.test(document.activeElement.tagName);
    if (e.code === 'Backquote' && !inField) {
      e.preventDefault();
      toggle();
      return;
    }
    if (e.defaultPrevented) return;
    if (open) {
      if (e.key === 'Escape' && document.activeElement !== input) hide();
      return;
    }
    if (inField) return;
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) !== -1) {
      e.preventDefault();
      const dirs = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1 };
      arrowFocus(dirs[e.key]);
    } else if (e.key === 'Escape') {
      App.goBack();
    }
  });

  return { toggle, show, hide, exec: l => { show(); return exec(l); }, isOpen: () => open, _complete: completionsFor };
})();
