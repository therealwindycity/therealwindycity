/* ============================================================================
   WorkDesk — wizard.js
   The guided setup. Every step is a pop-up with a real "Check it" button that
   verifies the step actually worked before letting you move on — so the app
   advances as YOU work through it, and never lies about being ready.

   Also lives here:
     • the coach bubble (the nudge that pops up when you're stuck or idle)
     • "Advance the program" — packages your current state + errors into a
       pre-filled GitHub issue addressed to whoever is building this, so the
       next upgrade can be aimed at your actual situation instead of a guess.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { el, $, esc, toast, modal, closeModal, copy, iso, truncate } = WD;

  const REPO = 'therealwindycity/therealwindycity';   // where "advance the program" issues land
  const SPINOFF_REPO = '';                            // filled in by spin-off.sh if you split it out

  function repo() { return SPINOFF_REPO || REPO; }

  /* -------------------------------------------------------- the stages */
  const STAGES = [
    {
      key: 'welcome', title: 'What WorkDesk actually is', kicker: 'Read this once — 40 seconds',
      render: welcomeBody, verify: async () => ({ ok: true }), next: 'profile',
      cta: 'Got it — start setup'
    },
    {
      key: 'profile', title: 'Your base, your floor, your skills', kicker: 'Step 1 of 6 · 2 minutes',
      render: profileBody, verify: verifyProfile, cta: 'Save & check', next: 'sidekick'
    },
    {
      key: 'sidekick', title: 'Install the Sidekick', kicker: 'Step 2 of 6 · the bridge that makes this work',
      render: sidekickBody, verify: verifySidekick, cta: 'Check connection', next: 'load'
    },
    {
      key: 'load', title: 'Get work orders onto the board', kicker: 'Step 3 of 6',
      render: loadBody, verify: verifyLoad, cta: 'Check the board', next: 'pitch'
    },
    {
      key: 'pitch', title: 'Your pitch + contact details', kicker: 'Step 4 of 6 · do this once, reuse forever',
      render: pitchBody, verify: verifyPitch, cta: 'Save & preview', next: 'apply'
    },
    {
      key: 'apply', title: 'Apply to your first one', kicker: 'Step 5 of 6',
      render: applyBody, verify: verifyApply, cta: 'Check my applied list', next: 'auto'
    },
    {
      key: 'auto', title: 'Optional: alerts + auto-sync', kicker: 'Step 6 of 6',
      render: autoBody, verify: async () => ({ ok: true }), cta: 'Finish', next: null
    }
  ];
  const byKey = {}; STAGES.forEach((s, i) => { s.index = i; byKey[s.key] = s; });

  /* ------------------------------------------------------- progress */
  function progress(settings) {
    const done = (settings.wizard && settings.wizard.done) || [];
    return Math.round((done.length / STAGES.length) * 100);
  }
  function isDone(settings, key) {
    return ((settings.wizard && settings.wizard.done) || []).includes(key);
  }
  async function markDone(key) {
    const s = await WD.store.getSettings();
    s.wizard = s.wizard || {};
    s.wizard.done = WD.uniq((s.wizard.done || []).concat([key]));
    s.wizard.stage = Math.min(STAGES.length - 1, (byKey[key] ? byKey[key].index + 1 : 0));
    s.wizard.lastDoneAt = iso(new Date());
    await WD.store.setSettings(s);
    WD.app && WD.app.refreshChrome && WD.app.refreshChrome();
    return s;
  }
  function nextUndone(settings) {
    const done = (settings.wizard && settings.wizard.done) || [];
    return STAGES.find(s => !done.includes(s.key)) || null;
  }

  /* ================================================================ bodies */

  function welcomeBody(host) {
    host.appendChild(el('div', { class: 'wz-prose', html: `
      <p><b>WorkDesk puts Field Nation and WorkMarket on one board.</b> One feed, one ranking,
      one place to track what you applied to.</p>
      <div class="callout">
        <div class="callout-h">The honest part — read this</div>
        <ul>
          <li><b>Neither platform gives individual techs an API.</b> Field Nation's API is
            <i>buyer-side only</i> (it needs a Buyer account and an integration contract).
            WorkMarket's Open API is for the <i>companies</i> posting work. There is no
            supported "show me available work" endpoint for a provider.</li>
          <li><b>So WorkDesk uses a bridge, not an API key.</b> The Sidekick runs in your own
            browser, on the pages you are already logged into, and reads the listings you are
            already allowed to see. Nothing is scraped anonymously, nothing is automated
            behind your back, and no password ever enters this app.</li>
          <li><b>Applying stays human.</b> WorkDesk gets you to the exact work order in one
            click with your pitch ready. <i>You</i> press submit. That is deliberate: both
            platforms prohibit automated applications, and a bot-sent application is the
            fastest way to lose an account you depend on.</li>
          <li><b>Your data stays on your device.</b> Orders, tracking and notes live in this
            browser's IndexedDB. There is no server, no account, no analytics.</li>
        </ul>
      </div>
      <p class="dim">If a step ever breaks — the platforms change their pages sometimes — use
      <b>🚀 Advance the program</b> in the ⋯ menu. It packages your diagnostics into a report so
      the fix can be aimed at what actually happened.</p>` }));
  }

  function profileBody(host, entry) {
    WD.app.getSettings().then(s => {
      const p = s.profile;
      const form = el('div', { class: 'wz-form' });
      const F = (label, input, hint) => el('label', { class: 'wz-fld' }, [
        el('span', { text: label }), input, hint ? el('small', { class: 'dim', text: hint }) : null
      ]);
      const homeLabel = el('input', { type: 'text', value: p.home.label || '', placeholder: 'Cheyenne, WY' });
      const homeCity  = el('input', { type: 'text', value: p.home.city || '', placeholder: 'Cheyenne' });
      const homeState = el('input', { type: 'text', value: p.home.state || '', maxlength: '2', placeholder: 'WY' });
      const lat = el('input', { type: 'number', step: '0.0001', value: p.home.lat != null ? p.home.lat : '' });
      const lng = el('input', { type: 'number', step: '0.0001', value: p.home.lng != null ? p.home.lng : '' });
      const floor = el('input', { type: 'number', step: '5', value: p.payFloorHourly });
      const target = el('input', { type: 'number', step: '5', value: p.payTargetHourly });
      const flat = el('input', { type: 'number', step: '10', value: p.payFloorFlat });
      const maxmi = el('input', { type: 'number', step: '10', value: p.maxMiles });
      const ideal = el('input', { type: 'number', step: '5', value: p.idealMiles });
      const hrs = el('input', { type: 'number', step: '0.5', min: '0.5', value: p.defaultJobHours });
      const skills = el('textarea', { rows: '3', placeholder: 'cabling, fiber, POS, network…' });
      skills.value = (p.skills || []).join(', ');
      const blocked = el('input', { type: 'text', placeholder: 'roof, overnight, unpaid' });
      blocked.value = (p.blockedKeywords || []).join(', ');

      const useLoc = el('button', { class: 'btn ghost sm', text: '📍 Use my current location', onclick: () => {
        if (!navigator.geolocation) return toast('This browser has no geolocation', 'warn');
        navigator.geolocation.getCurrentPosition(pos => {
          lat.value = pos.coords.latitude.toFixed(4);
          lng.value = pos.coords.longitude.toFixed(4);
          toast('Coordinates set from your device', 'ok');
        }, err => toast('Location blocked: ' + err.message, 'warn'));
      }});
      const useCity = el('button', { class: 'btn ghost sm', text: 'Look up from city/state', onclick: () => {
        const hit = WD.lookupCity(homeCity.value, homeState.value);
        if (!hit) return toast('No match in the built-in table (' + WD.CITY_COUNT + ' cities). Type the coordinates or click 📍.', 'warn');
        lat.value = hit.lat.toFixed(4); lng.value = hit.lng.toFixed(4);
        homeLabel.value = hit.city + ', ' + hit.state;
        toast('Set to ' + hit.city + ', ' + hit.state, 'ok');
      }});

      const fnCut = el('input', { type: 'number', step: '1', min: '0', max: '40',
        value: Math.round(((p.platformHaircut || {}).fieldnation || 0) * 100) });
      const wmCut = el('input', { type: 'number', step: '1', min: '0', max: '40',
        value: Math.round(((p.platformHaircut || {}).workmarket || 0) * 100) });

      form.append(
        el('div', { class: 'wz-sec', html: '<h4>Where you start from</h4><p class="dim">Every distance, every "$/hr after driving", every ranking depends on this.</p>' }),
        el('div', { class: 'wz-grid' }, [
          F('Base label', homeLabel), F('City', homeCity), F('State', homeState),
          F('Latitude', lat), F('Longitude', lng)
        ]),
        el('div', { class: 'wz-row' }, [useLoc, useCity]),
        el('div', { class: 'wz-sec', html: '<h4>What work is worth your time</h4>' }),
        el('div', { class: 'wz-grid' }, [
          F('Pay floor ($/hr net)', floor, 'Below this it gets buried, not deleted'),
          F('Pay target ($/hr net)', target, 'At or above this = full marks'),
          F('Minimum flat rate ($)', flat),
          F('Max miles', maxmi), F('Ideal miles', ideal),
          F('Typical job length (hrs)', hrs, 'Used to turn "$150 flat" into an $/hr when no window is posted')
        ]),
        el('div', { class: 'wz-sec', html: '<h4>Platform fee you actually pay</h4><p class="dim">Field Nation takes a provider-side marketplace fee that varies by plan — put in YOUR number so "$/hr net" is true. WorkMarket does not normally charge the worker. Check your own account statement; do not trust a default.</p>' }),
        el('div', { class: 'wz-grid' }, [F('Field Nation fee %', fnCut), F('WorkMarket fee %', wmCut)]),
        el('div', { class: 'wz-sec', html: '<h4>Skills &amp; deal-breakers</h4>' }),
        F('My skills (comma separated)', skills, 'Used to score how well a job fits you'),
        F('Always hide jobs containing', blocked, 'Comma separated. These get ranked to the bottom.')
      );

      const save = el('button', { class: 'btn primary', text: 'Save & check', onclick: async () => {
        const st = await WD.app.getSettings();
        const la = parseFloat(lat.value), lo = parseFloat(lng.value);
        st.profile = Object.assign({}, st.profile, {
          home: { label: homeLabel.value || (homeCity.value + ', ' + homeState.value),
                  city: homeCity.value, state: homeState.value.toUpperCase(),
                  lat: isNaN(la) ? null : la, lng: isNaN(lo) ? null : lo },
          payFloorHourly: parseFloat(floor.value) || 0,
          payTargetHourly: parseFloat(target.value) || 0,
          payFloorFlat: parseFloat(flat.value) || 0,
          maxMiles: parseFloat(maxmi.value) || 250,
          idealMiles: parseFloat(ideal.value) || 35,
          defaultJobHours: parseFloat(hrs.value) || 3,
          skills: skills.value.split(',').map(x => x.trim()).filter(Boolean),
          blockedKeywords: blocked.value.split(',').map(x => x.trim()).filter(Boolean),
          platformHaircut: { fieldnation: (parseFloat(fnCut.value) || 0) / 100,
                             workmarket: (parseFloat(wmCut.value) || 0) / 100 }
        });
        await WD.store.setSettings(st);
        await runVerify(entry, 'profile');
      }});
      host.appendChild(form);
      host.appendChild(el('div', { class: 'wz-actions' }, [save]));
      entry.__form = { homeCity, homeState, lat, lng };
    });
  }

  function sidekickBody(host, entry) {
    const skUrl = WD.appUrl('sidekick/workdesk-sidekick.user.js');
    const raw = skUrl;
    const steps = el('div', { class: 'wz-steps' });
    const step = (n, title, body) => el('div', { class: 'wz-step' }, [
      el('div', { class: 'wz-n', text: String(n) }),
      el('div', { class: 'wz-stepb' }, [el('h4', { text: title }), body])
    ]);

    steps.append(
      step(1, 'Install a userscript manager (one time)',
        el('div', { html: `Chrome / Edge / Brave → <a href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noopener">Tampermonkey</a>.
        Firefox → <a href="https://addons.mozilla.org/firefox/addon/tampermonkey/" target="_blank" rel="noopener">Tampermonkey for Firefox</a>.
        Safari → <a href="https://apps.apple.com/app/userscripts/id1463298887" target="_blank" rel="noopener">Userscripts</a>.
        It's free and open source; it just lets a page run a script you installed yourself.` })),
      step(2, 'Open the Sidekick script',
        el('div', {}, [
          el('p', { class: 'dim', text: 'Click this link. Tampermonkey will pop up an install screen — press Install.' }),
          el('div', { class: 'code-line' }, [
            el('code', { text: raw }),
            el('button', { class: 'btn ghost sm', text: 'Copy', onclick: async () => toast(await copy(raw) ? 'Link copied — paste it in your address bar' : 'Copy failed', 'ok') }),
            el('a', { class: 'btn sm', href: raw, target: '_blank', rel: 'noopener', text: '↗ Open' })
          ]),
          el('p', { class: 'dim', html: 'If the install screen does not appear, open Tampermonkey → <b>Dashboard</b> → <b>+</b> (Create new script), delete everything in the editor, paste the file contents, and press <b>Ctrl/Cmd+S</b>. The file is also in the repo at <code>workdesk/sidekick/workdesk-sidekick.user.js</code>.' })
        ])),
      step(3, 'Log in to your platforms like normal',
        el('div', { html: `Open <a href="https://app.fieldnation.com/" target="_blank" rel="noopener">app.fieldnation.com</a> and/or
          <a href="https://app.workmarket.com/" target="_blank" rel="noopener">app.workmarket.com</a> and browse work the way you always do.
          A small <b>⚡ WorkDesk</b> badge appears in the corner and starts counting what it sees.` })),
      step(4, 'Send them here',
        el('div', { html: `Click the badge → <b>Send to WorkDesk</b>. This tab reloads with the orders on the board.
          The badge can also auto-send on a timer if you turn that on inside its settings.
          <span class="dim">Blocked pop-up? Use <b>Copy sync code</b> in the badge, then paste it below.</span>` })),
      el('div', { class: 'wz-sec' }, [
        el('h4', { text: 'Or paste a sync code / raw JSON' }),
        el('textarea', { id: 'wz-paste', rows: '4', placeholder: 'WD1-…  (or paste raw JSON / CSV straight from the page)' }),
        el('div', { class: 'wz-row' }, [
          el('button', { class: 'btn ghost sm', text: 'Ingest pasted data', onclick: async () => {
            const t = $('#wz-paste').value.trim();
            if (!t) return toast('Paste something first', 'warn');
            let r;
            if (/^WD1-/.test(t)) r = await WD.bridge.acceptSyncCode(t);
            else r = await WD.bridge.importText(t, { source: 'sidekick', channel: 'synccode', method: 'paste' });
            if (r && r.ok) { toast('Ingested ' + r.added + ' new / ' + r.updated + ' updated', 'ok'); WD.app.reload(); await runVerify(entry, 'sidekick'); }
            else toast('That did not work: ' + (r && r.error || 'unknown'), 'err', 7000);
          }}),
          el('button', { class: 'btn ghost sm', text: 'Load sample board instead', onclick: async () => {
            const n = await WD.app.loadSample();
            toast(n + ' sample orders loaded — good for testing filters and ranking', 'ok');
            WD.app.reload(); await runVerify(entry, 'sidekick');
          }})
        ])
      ])
    );
    host.appendChild(steps);
    host.appendChild(el('div', { class: 'callout warn' }, [
      el('div', { class: 'callout-h', text: 'Why not just an API key?' }),
      el('p', { html: 'Field Nation&rsquo;s REST API (<code>api.fieldnation.com/api/rest/v2</code>) requires an <b>active Buyer account plus a signed integration contract</b>, and every endpoint is about work orders <i>you post</i>. WorkMarket&rsquo;s Open API is sold to the companies managing contractors. As a provider you are the supply side, and neither exposes supply-side search. The Sidekick reads <b>your own authenticated session</b> — the same HTML your browser already downloaded — which is why it needs no key and no password.' })
    ]));
  }

  function loadBody(host, entry) {
    const wrap = el('div', { class: 'wz-prose' });
    wrap.innerHTML = `
      <p>Three ways to get orders onto the board. Any one of them is enough.</p>
      <div class="wz-cards">
        <div class="wz-card"><b>1 · Sidekick (best)</b><span>Browse the sites normally, hit ⚡ → Send. Auto-sync available.</span></div>
        <div class="wz-card"><b>2 · Sync code</b><span>Sidekick → Copy sync code → paste it into Setup. Works across two devices.</span></div>
        <div class="wz-card"><b>3 · Import file</b><span>Drop a JSON/CSV/TXT export onto the board, or paste listing text.</span></div>
      </div>`;
    host.appendChild(wrap);
    host.appendChild(el('div', { class: 'dropzone', id: 'wz-drop' }, [
      el('div', { html: '<b>Drop a file here</b><span class="dim">JSON · CSV · TSV · TXT — anything with listings in it</span>' }),
      el('label', { class: 'btn ghost sm' }, ['Choose file', el('input', { type: 'file', id: 'wz-file', hidden: true, accept: '.json,.csv,.tsv,.txt,application/json,text/csv,text/plain' })])
    ]));
    host.appendChild(el('div', { class: 'wz-row' }, [
      el('button', { class: 'btn ghost sm', text: '🧪 Load sample board', onclick: async () => {
        const n = await WD.app.loadSample(); toast(n + ' samples loaded', 'ok'); WD.app.reload(); await runVerify(entry, 'load');
      }}),
      el('button', { class: 'btn ghost sm', text: 'Pull relay / committed feed now', onclick: async () => {
        const s = await WD.store.getSettings();
        const r1 = await WD.bridge.pullCommittedFeed();
        const r2 = await WD.bridge.pullRelay(s);
        const added = (r1.added || 0) + (r2.added || 0);
        toast(added ? added + ' new from the feed' : 'No feed available yet (' + (r2.error || r1.error || 'relay off') + ')', added ? 'ok' : 'warn', 6000);
        WD.app.reload(); await runVerify(entry, 'load');
      }})
    ]));
  }

  function pitchBody(host, entry) {
    WD.app.getSettings().then(s => {
      const m = s.my || {};
      const grid = el('div', { class: 'wz-grid' });
      const fld = (k, label, ph) => {
        const i = el('input', { type: 'text', value: m[k] || '', placeholder: ph || '' });
        i.dataset.k = k; grid.appendChild(el('label', { class: 'wz-fld' }, [el('span', { text: label }), i]));
        return i;
      };
      fld('first_name', 'First name', 'Ray');
      fld('last_name', 'Last name', 'Cortez');
      fld('phone', 'Phone', '(307) 555-0134');
      fld('email', 'Email', 'you@example.com');
      fld('certifications', 'Certifications', 'BICSI, OSHA-10, CompTIA A+, CDL');
      fld('experience_years', 'Years in field service', '9');
      fld('tools', 'Tools you bring', 'fluke tester, toner, punchdown, cordless, 24ft ladder');
      fld('vehicle', 'Vehicle', 'a truck and trailer');

      const sel = el('select', { id: 'wz-tpl' });
      (s.templates || []).forEach(t => sel.appendChild(el('option', { value: t.id, text: t.name, selected: t.id === s.activeTemplate })));
      const ta = el('textarea', { id: 'wz-tplbody', rows: '10', spellcheck: 'true' });
      const find = id => (s.templates || []).find(t => t.id === id);
      ta.value = (find(s.activeTemplate) || s.templates[0]).body;
      sel.addEventListener('change', () => { ta.value = find(sel.value).body; renderPreview(); });
      ta.addEventListener('input', WD.debounce(renderPreview, 250));

      const prev = el('div', { class: 'wz-preview', id: 'wz-prev' });
      const sample = WD.app.firstOpenOrder ? WD.app.firstOpenOrder() : null;

      function renderPreview() {
        const filled = WD.app.fillTemplate(ta.value, sample);
        prev.textContent = filled.text;
        const left = filled.missing;
        const badge = $('#wz-badge', host);
        if (badge) { badge.textContent = left.length ? left.length + ' unfilled token(s): ' + left.join(', ') : '✓ nothing missing'; badge.className = 'wz-badge ' + (left.length ? 'bad' : 'good'); }
      }

      host.appendChild(el('div', { class: 'wz-sec' }, [el('h4', { text: 'Your details (used to fill {placeholders})' }), grid]));
      host.appendChild(el('div', { class: 'wz-sec' }, [
        el('h4', { text: 'Pick a pitch template' }),
        el('div', { class: 'wz-row' }, [sel,
          el('button', { class: 'btn ghost sm', text: '+ New template', onclick: () => toast('Add templates from ⋯ → Pitch templates', 'info') })]),
        ta,
        el('div', { class: 'wz-badge', id: 'wz-badge' }),
        el('div', { class: 'wz-sec' }, [el('h4', { text: 'Live preview against a real order' }), prev])
      ]));
      host.appendChild(el('div', { class: 'wz-actions' }, [
        el('button', { class: 'btn primary', text: 'Save & preview', onclick: async () => {
          const st = await WD.app.getSettings();
          const inputs = grid.querySelectorAll('input');
          inputs.forEach(i => { st.my[i.dataset.k] = i.value.trim(); });
          const t = find(sel.value) || st.templates[0];
          t.body = ta.value; t.name = t.name;
          st.activeTemplate = sel.value;
          await WD.store.setSettings(st);
          await runVerify(entry, 'pitch');
        }})
      ]));
      renderPreview();
    });
  }

  function applyBody(host, entry) {
    host.appendChild(el('div', { class: 'wz-prose', html: `
      <p>Open the board, pick the top-ranked job, and hit <b>Apply</b>. Here is exactly what happens:</p>
      <ol class="wz-list">
        <li>WorkDesk opens <b>that exact work order</b> on the platform in a new tab — not the search page, not the homepage.</li>
        <li>Your pitch is copied to your clipboard, already filled in with that job's company, city, distance and start day.</li>
        <li>The order moves to your <b>Applied</b> tab with a timestamp, so you can chase it and never double-apply.</li>
        <li>If the Sidekick is running on that tab, an extra <b>⚡ Fill pitch</b> button appears next to the platform's own
            application box — it types your pitch in. <b>You still press submit.</b></li>
      </ol>
      <div class="callout warn"><div class="callout-h">Why it stops at your finger</div>
      <p>Fully automated applying means driving your logged-in session with a bot. Both Field Nation's and
      WorkMarket's terms prohibit that, and providers get accounts suspended for it. You asked for speed, so this is
      ~5 seconds per application instead of ~5 — with none of the risk.</p></div>` }));
    host.appendChild(el('div', { class: 'wz-row' }, [
      el('button', { class: 'btn', text: '← Back to the board', onclick: () => { closeModal(entry); WD.app.goTab('available'); } })
    ]));
  }

  function autoBody(host, entry) {
    host.appendChild(el('div', { class: 'wz-prose', html: `
      <p>Everything below is optional. WorkDesk is fully usable with none of it.</p>` }));
    const list = el('div', { class: 'wz-cards' });
    list.append(
      el('div', { class: 'wz-card' }, [el('b', { text: '🔔 Desktop alerts' }),
        el('span', { text: 'Notify me when a new order clears my score/pay/distance bar while this tab is open.' }),
        el('button', { class: 'btn ghost sm', text: 'Turn on', onclick: () => WD.app.enableNotifications() })]),
      el('div', { class: 'wz-card' }, [el('b', { text: '📡 Relay (auto-sync)' }),
        el('span', { text: 'Pull from a GitHub Gist, a raw repo file, or an ntfy.sh topic. Lets a second device or the Actions poller feed this board without you touching it.' }),
        el('button', { class: 'btn ghost sm', text: 'Configure', onclick: () => WD.app.openSettings('relay') })]),
      el('div', { class: 'wz-card' }, [el('b', { text: '🤖 Actions poller (needs real API keys)' }),
        el('span', { text: 'worker/poll.py + worker/poll.yml are pre-wired for Field Nation and WorkMarket APIs. Add repo secrets and it commits data/feed.json, which this page reads automatically.' }),
        el('button', { class: 'btn ghost sm', text: 'How to enable', onclick: () => WD.app.openDocs('#api-poller') })]),
      el('div', { class: 'wz-card' }, [el('b', { text: '📱 Phone push' }),
        el('span', { text: 'The Sidekick can post a summary to an ntfy.sh topic — subscribe in the ntfy app and your phone buzzes when new work lands.' }),
        el('button', { class: 'btn ghost sm', text: 'Set up', onclick: () => WD.app.openSettings('relay') })])
    );
    host.appendChild(list);
    host.appendChild(el('div', { class: 'wz-actions' }, [
      el('button', { class: 'btn primary', text: 'Finish setup', onclick: async () => { await runVerify(entry, 'auto'); } })
    ]));
  }

  /* ============================================================== verify */
  async function verifyProfile() {
    const s = await WD.app.getSettings();
    const p = s.profile;
    const errs = [];
    if (!p.home || p.home.lat == null || p.home.lng == null) errs.push('Set your base coordinates — click 📍 or "Look up from city/state".');
    if (!(p.payTargetHourly > p.payFloorHourly)) errs.push('Your pay target must be higher than your pay floor.');
    if (!(p.maxMiles > p.idealMiles)) errs.push('Max miles must be greater than ideal miles.');
    if (!(p.skills && p.skills.length)) errs.push('Add at least one skill so jobs can be matched to you.');
    if (p.defaultJobHours <= 0) errs.push('Typical job length must be above 0.');
    return { ok: !errs.length, errs };
  }

  async function verifySidekick() {
    const rows = await WD.store.allOrders();
    const fromSidekick = rows.filter(r => /sidekick|relay/.test(String(r.source || '')));
    const env = WD.detectEnv();
    const seen = await WD.bridge.sidekickSeen().catch(() => null);
    const info = ['bridge counts: ' + JSON.stringify(WD.bridge.state.counts),
                  'env: ' + (env.isPages ? 'GitHub Pages' : env.isFile ? 'local file' : location.host)];

    if (fromSidekick.length) return { ok: true, note: fromSidekick.length + ' order(s) arrived via the Sidekick ✓' };
    if (seen && seen.at) return { ok: true, note: 'Sidekick v' + seen.version + ' checked in ' + WD.ago(seen.at) +
      (seen.platform ? ' from ' + seen.platform : '') + ' ✓ — it is installed and reaching this board.' };
    if (rows.length) return { ok: true, note: 'Board has ' + rows.length + ' order(s) from another source — the Sidekick can be added any time.' };
    return { ok: false,
      errs: ['No orders yet and no Sidekick check-in. On a platform page click ⚡ → "Send to WorkDesk", or paste a sync code, or load the sample board to prove the pipeline works.'],
      info };
  }

  async function verifyLoad() {
    const rows = await WD.store.allOrders();
    if (!rows.length) return { ok: false, errs: ['The board is still empty.'] };
    const noPay = rows.filter(r => !r.pay || r.pay.amount == null).length;
    const noLoc = rows.filter(r => r.distance_mi == null).length;
    const note = rows.length + ' orders · ' + WD.uniq(rows.map(r => r.platform)).join('/') +
      (noPay ? ' · ' + noPay + ' with no pay posted' : '') +
      (noLoc ? ' · ' + noLoc + ' with no resolvable location' : '');
    return { ok: true, note };
  }

  async function verifyPitch() {
    const s = await WD.app.getSettings();
    const errs = [];
    if (!s.my || !s.my.first_name) errs.push('Add at least your first name — the pitch needs it.');
    const t = (s.templates || []).find(x => x.id === s.activeTemplate) || (s.templates || [])[0];
    if (!t) errs.push('No template found.');
    else {
      const filled = WD.app.fillTemplate(t.body, WD.app.firstOpenOrder());
      const critical = filled.missing.filter(k => ['first_name', 'company', 'skills'].includes(k));
      if (critical.length) errs.push('Template still has unfilled tokens: ' + critical.join(', '));
    }
    return { ok: !errs.length, errs, note: errs.length ? '' : 'Pitch renders clean ✓' };
  }

  async function verifyApply() {
    const rows = await WD.store.allOrders();
    const applied = rows.filter(r => r.my && r.my.state === 'applied');
    if (!applied.length) return { ok: false, errs: ['Nothing marked Applied yet. Open a job and hit Apply — it counts even if you just want to test the flow.'], soft: true };
    return { ok: true, note: applied.length + ' application(s) tracked ✓' };
  }

  async function runVerify(entry, key) {
    const stage = byKey[key];
    const box = $('.wz-verify', entry.root) || (() => {
      const b = el('div', { class: 'wz-verify' });
      (entry.body || $('.modal-body', entry.root)).appendChild(b); return b;
    })();
    box.innerHTML = '<div class="spin"></div> checking…';
    let r;
    try { r = await stage.verify(); }
    catch (e) { r = { ok: false, errs: ['check failed: ' + (e.message || e)] }; }

    box.innerHTML = '';
    if (r.ok) {
      box.className = 'wz-verify good';
      box.appendChild(el('div', { html: '<b>✓ Passed.</b> ' + esc(r.note || '') }));
      await markDone(key);
      celebrate();
      if (stage.next) {
        box.appendChild(el('div', { class: 'wz-row' }, [
          el('button', { class: 'btn primary', text: 'Next: ' + byKey[stage.next].title + ' →', onclick: () => open(stage.next) }),
          el('button', { class: 'btn ghost', text: 'Close', onclick: () => closeModal(entry) })
        ]));
      } else {
        box.appendChild(el('div', { class: 'wz-row' }, [
          el('button', { class: 'btn primary', text: '🎉 Done — take me to the board', onclick: () => { closeModal(entry); WD.app.goTab('available'); } }),
          el('button', { class: 'btn ghost', text: 'Ask to advance the program', onclick: () => advanceModal() })
        ]));
      }
      WD.app.reload();
    } else {
      box.className = 'wz-verify bad';
      box.appendChild(el('div', { html: '<b>Not yet.</b>' }));
      (r.errs || []).forEach(e => box.appendChild(el('div', { class: 'wz-err', text: '• ' + e })));
      if (r.info) r.info.forEach(i => box.appendChild(el('div', { class: 'dim small', text: i })));
      box.appendChild(el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn ghost sm', text: 'Check again', onclick: () => runVerify(entry, key) }),
        r.soft ? el('button', { class: 'btn ghost sm', text: 'Skip this step', onclick: async () => { await markDone(key); closeModal(entry); } }) : null,
        el('button', { class: 'btn ghost sm', text: '🚀 Ask for help on this step', onclick: () => advanceModal(key, (r.errs || []).join('\n')) })
      ]));
    }
  }

  function celebrate() {
    const c = el('div', { class: 'confetti' });
    for (let i = 0; i < 28; i++) {
      const p = el('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.animationDelay = (Math.random() * 0.4) + 's';
      p.style.background = ['#ffb020', '#4dd4ac', '#ff6b6b', '#7aa2ff', '#f4ecd8'][i % 5];
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1600);
  }

  /* ---------------------------------------------------------------- open */
  function open(keyOrIndex) {
    const stage = typeof keyOrIndex === 'number' ? STAGES[keyOrIndex] : (byKey[keyOrIndex] || STAGES[0]);
    if (!stage) return;
    const body = el('div', { class: 'wz-body' });
    const entry = modal({
      title: stage.title, kicker: stage.kicker, body, width: stage.key === 'welcome' ? '720px' : '760px',
      foot: [
        el('div', { class: 'wz-progress' }, [
          el('div', { class: 'wz-bar' }, [el('i', { id: 'wz-fill' })]),
          el('span', { id: 'wz-pct', class: 'dim' })
        ]),
        el('button', { class: 'btn ghost', text: 'Skip step', onclick: async () => { await markDone(stage.key); closeModal(entry); open(stage.next || 0); } }),
        stage.verify && stage.key !== 'welcome' && stage.key !== 'auto'
          ? el('button', { class: 'btn', text: 'Check it', onclick: () => runVerify(entry, stage.key) }) : null,
        el('button', { class: 'btn ghost', text: 'Close', onclick: () => closeModal(entry) })
      ].filter(Boolean),
      onMount: h => {
        const done = (WD.app.cachedSettings().wizard || {}).done || [];
        $('#wz-fill', h).style.width = Math.round(done.length / STAGES.length * 100) + '%';
        $('#wz-pct', h).textContent = done.length + ' / ' + STAGES.length + ' steps done';
      }
    });
    stage.render(body, entry);
    return entry;
  }

  /* ------------------------------------------------------- coach bubble */
  let coachTimer = null, coachHidden = false;
  function coachText(stage) {
    return {
      welcome: 'Start here — 40 seconds, tells you exactly what this can and can\'t do.',
      profile: 'Set your base and pay floor. Until you do, every distance and $/hr number on the board is a guess.',
      sidekick: 'Install the Sidekick — it\'s the bridge that pulls your listings in. Nothing works without some bridge.',
      load: 'The board is empty. Send orders from the Sidekick, or load the sample board to see how it all behaves.',
      pitch: 'Write your pitch once. After this, applying is one click + one paste.',
      apply: 'Apply to one job to prove the whole loop end to end.',
      auto: 'Last step: optional alerts and auto-sync.'
    }[stage.key] || '';
  }

  async function maybeCoach(force) {
    const s = await WD.app.getSettings();
    if (s.wizard.dismissedCoach && !force) return hideCoach();
    const stage = nextUndone(s);
    if (!stage) return hideCoach();
    if (progress(s) >= 100) return hideCoach();
    const c = $('#coach');
    $('#coach-step', c).textContent = 'Step ' + (stage.index + 1) + ' of ' + STAGES.length;
    $('#coach-text', c).textContent = coachText(stage);
    c.hidden = false;
    $('#coach-do').onclick = () => { hideCoach(); open(stage.key); };
    $('#coach-later').onclick = () => { hideCoach(); scheduleCoach(1000 * 60 * 10); };
    $('#coach-close').onclick = async () => {
      const st = await WD.app.getSettings(); st.wizard.dismissedCoach = true; await WD.store.setSettings(st);
      hideCoach(); toast('Nudges off. Reopen any time from ⋯ → Guided setup wizard.', 'info');
    };
  }
  function hideCoach() { const c = $('#coach'); if (c) c.hidden = true; }
  function scheduleCoach(ms) {
    clearTimeout(coachTimer);
    coachTimer = setTimeout(() => maybeCoach(), ms == null ? 45000 : ms);
  }

  /* ============================================ advance the program */
  async function diagnostics() {
    const s = await WD.app.getSettings();
    const st = await WD.store.stats();
    const env = WD.detectEnv();
    const log = await WD.store.getLog(25);
    const safe = {
      version: WD.VERSION, env,
      page: location.href.split('#')[0],
      backend: st.backend,
      stats: st,
      bridge: { counts: WD.bridge.state.counts, lastHandoffAt: WD.bridge.state.lastHandoffAt,
                lastRelayAt: WD.bridge.state.lastRelayAt, errors: WD.bridge.state.errors.slice(-8) },
      wizard: s.wizard,
      relay: { mode: s.relay.mode, hasUrl: !!s.relay.url, hasToken: !!s.relay.token, gistId: s.relay.gistId },
      profile: { home: s.profile.home && s.profile.home.label, floor: s.profile.payFloorHourly,
                 target: s.profile.payTargetHourly, maxMiles: s.profile.maxMiles,
                 idealMiles: s.profile.idealMiles, defaultJobHours: s.profile.defaultJobHours,
                 skills: (s.profile.skills || []).length, haircut: s.profile.platformHaircut },
      template: s.activeTemplate,
      notifications: { enabled: s.notifications.enabled, permission: 'Notification' in window ? Notification.permission : 'unsupported' },
      userAgent: navigator.userAgent,
      recentLog: log.slice(-15).map(l => l.t + ' ' + l.kind + ' ' + JSON.stringify(l.detail || '')),
      cities: WD.CITY_COUNT
    };
    return safe;
  }

  function advanceModal(stageKey, prefillError) {
    const host = el('div', {});
    const what = el('textarea', { rows: '5', placeholder: 'What happened, what you expected, and what you want next. Example: "Sidekick badge shows 0 on Field Nation — the listings load but nothing is captured."' });
    if (prefillError) what.value = 'This step failed verification:\n' + prefillError + '\n\nWhat I want:\n';
    const include = el('input', { type: 'checkbox', checked: true });
    const out = el('pre', { class: 'wz-diag' });
    host.append(
      el('div', { class: 'wz-prose', html: `<p>This packages your setup state, what the bridge saw, and any errors into a
        report, then opens a pre-filled GitHub issue on <b>${esc(repo())}</b>. That report is how the next change gets aimed
        at your actual situation instead of a guess. <b>No passwords, tokens, or order contents are included</b> — counts and
        settings only.</p>` }),
      el('label', { class: 'wz-fld' }, [el('span', { text: 'What do you need?' }), what]),
      el('label', { class: 'wz-row check' }, [include, el('span', { text: 'Attach diagnostics (settings shape + counts + errors, no credentials)' })]),
      el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn primary', text: '🚀 Open the pre-filled issue', onclick: async () => {
          const d = include.checked ? await diagnostics() : null;
          const body = buildIssue(what.value, d, stageKey);
          const url = 'https://github.com/' + repo() + '/issues/new?title=' +
            encodeURIComponent('[WorkDesk] ' + (stageKey ? stageKey + ': ' : '') + truncate(what.value.split('\n')[0] || 'advance the program', 70)) +
            '&body=' + encodeURIComponent(body) + '&labels=' + encodeURIComponent('workdesk,advance');
          window.open(url, '_blank', 'noopener');
          toast('Issue draft opened in a new tab — review it and press Create', 'ok');
        }}),
        el('button', { class: 'btn ghost', text: 'Copy diagnostics instead', onclick: async () => {
          const d = await diagnostics();
          toast(await copy(JSON.stringify(d, null, 1)) ? 'Diagnostics copied to your clipboard' : 'Copy failed', 'ok');
        }}),
        el('button', { class: 'btn ghost', text: 'Show me what gets sent', onclick: async () => {
          out.textContent = JSON.stringify(await diagnostics(), null, 1);
        }})
      ]),
      out
    );
    modal({ title: 'Advance the program', kicker: stageKey ? 'Context: step "' + stageKey + '"' : 'Tell the builder what to do next', body: host, width: '720px' });
  }

  function buildIssue(text, d, stageKey) {
    const L = [];
    L.push('### What I need');
    L.push(text || '(describe it)');
    L.push('');
    L.push('### Where I am in setup');
    if (d) {
      L.push('- Stage: **' + (stageKey || 'n/a') + '** · wizard ' + ((d.wizard.done || []).length) + '/' + STAGES.length + ' steps done: ' + (d.wizard.done || []).join(', '));
      L.push('- Board: ' + d.stats.total + ' orders (' + d.stats.fieldnation + ' Field Nation / ' + d.stats.workmarket + ' WorkMarket / ' + d.stats.unknown + ' unmapped)');
      L.push('- Pipeline: ' + d.stats.applied + ' applied · ' + d.stats.saved + ' saved · ' + d.stats.won + ' won · ' + d.stats.lost + ' lost');
      L.push('- Bridge counts: ' + JSON.stringify(d.bridge.counts));
      L.push('- Last handoff: ' + (d.bridge.lastHandoffAt || 'never') + ' · last relay pull: ' + (d.bridge.lastRelayAt || 'never'));
      L.push('- Relay mode: ' + d.relay.mode + (d.relay.gistId ? ' (gist ' + d.relay.gistId + ')' : ''));
      L.push('- Storage backend: ' + d.backend + ' · hosting: ' + (d.env.isPages ? 'GitHub Pages' : d.env.isFile ? 'local file' : d.env.origin));
      L.push('- WorkDesk ' + d.version + ' · ' + d.userAgent);
      if (d.bridge.errors && d.bridge.errors.length) {
        L.push('');
        L.push('### Bridge errors');
        L.push('```');
        d.bridge.errors.forEach(e => L.push(e.at + ' [' + e.where + '] ' + e.message));
        L.push('```');
      }
      L.push('');
      L.push('<details><summary>Full diagnostics JSON (no credentials)</summary>');
      L.push('');
      L.push('```json');
      L.push(JSON.stringify(d, null, 1));
      L.push('```');
      L.push('');
      L.push('</details>');
    }
    L.push('');
    L.push('---');
    L.push('*Filed from inside the app via ⋯ → 🚀 Advance the program.*');
    return L.join('\n');
  }

  /* ---------------------------------------------------------- resume */
  async function resume() {
    const s = await WD.app.getSettings();
    const stage = nextUndone(s);
    WD.app.setSetupPill(progress(s));
    if (!stage) return;
    if (!s.wizard.dismissedCoach) scheduleCoach(s.wizard.lastDoneAt ? 90000 : 4000);
  }

  Object.assign(WD, {
    wizard: {
      STAGES, byKey, open, resume, progress, isDone, markDone, nextUndone,
      maybeCoach, hideCoach, scheduleCoach, diagnostics, advanceModal, buildIssue,
      get repo() { return repo(); },
      set repo(v) { /* replaced at build time by spin-off.sh */ }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
