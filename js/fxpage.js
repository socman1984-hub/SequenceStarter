'use strict';
// The "Effects for props" page: which effects ideas may use on each kind of
// prop, and how often (EffectPrefs). One grid for a part's steady lights, one
// for the hits on beats and drums; sets can be saved, shared and reset.
(() => {
    const $ = id => document.getElementById(id);
    const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let part = 'steady';
    try { if (localStorage.getItem('xlweb-fxpage-part') === 'hits') part = 'hits'; } catch (e) { /* storage blocked */ }

    const label = c => (Ideas.CLASS_LABELS[c] || c);
    // the kinds of prop in the open show (null: no show open)
    function inShow() {
        const sh = window.XLSeq && XLSeq.S && XLSeq.S.show;
        if (!sh) return null;
        const kinds = new Set(Ideas.candidates(sh).keys());
        // props whose kind can't be told from their name are "Other"
        for (const m of sh.models.values()) if (m.attrs.Controller !== 'No Controller' && Ideas.classify(sh, m.name) === 'generic') { kinds.add('generic'); break; }
        return kinds;
    }

    function drawSets() {
        const sel = $('fxpSet');
        const act = EffectPrefs.active;
        sel.innerHTML = EffectPrefs.presets.map(p => `<option value="${esc(p.id)}" ${p.id === act.id ? 'selected' : ''}>${esc(p.name)}${p.builtin ? ' (built in)' : ''}</option>`).join('');
        const dirty = EffectPrefs.dirty();
        $('fxpDirty').hidden = !dirty;
        $('fxpSave').disabled = !dirty;
        $('fxpSave').title = act.builtin ? 'Save these choices under a new name (the built-in sets stay as they are)' : `Save the changes into "${act.name}"`;
        $('fxpRename').disabled = $('fxpDelete').disabled = !!act.builtin;
        $('fxpDiscard').disabled = !dirty;
        $('fxpNote').textContent = act.builtin ? act.note + (dirty ? ' You changed it; Save keeps your changes under a new name.' : '') : (dirty ? 'Changed since it was saved.' : 'Your saved choices.');
        $('fxpOn').textContent = `Ideas use: ${act.name}${dirty ? ' (changed)' : ''}`;
    }

    function drawGrid() {
        const sel = EffectPrefs.current();
        const def = EffectPrefs.builtinDefault();
        const list = part === 'steady' ? EffectPrefs.steadyList() : EffectPrefs.hitList();
        const kinds = inShow();
        const mine = $('fxpMine').checked && kinds;
        const cols = EffectPrefs.CLASSES.filter(c => !mine || kinds.has(c));
        const find = $('fxpFind').value.trim().toLowerCase();
        const used = $('fxpUsed').checked;
        const tbl = sel[part];
        const sums = {};
        for (const c of cols) sums[c] = Object.values(tbl[c]).reduce((a, b) => a + b, 0);
        const rows = list.filter(e => (!find || e.label.toLowerCase().includes(find) || e.xl.toLowerCase().includes(find)) && (!used || cols.some(c => tbl[c][e.id] > 0)));
        const cats = Effects.CATS;
        let html = `<thead><tr><th class="fxp-eff">Effect</th>${cols.map(c => `<th class="fxp-col${kinds && !kinds.has(c) ? ' notmine' : ''}" title="${esc(label(c))}${kinds && !kinds.has(c) ? ' (none in your show)' : ''}"><span>${esc(label(c))}</span><span class="fxp-colbtns"><button type="button" class="btn tiny" data-coloff="${c}" title="Nothing on ${esc(label(c))}">none</button><button type="button" class="btn tiny" data-coldef="${c}" title="${esc(label(c))} back to the default">default</button></span></th>`).join('')}</tr></thead><tbody>`;
        for (const [cat, catLabel] of Object.entries(cats)) {
            const inCat = rows.filter(e => (e.cat || 'other') === cat);
            if (!inCat.length) continue;
            html += `<tr class="fxp-cat"><th colspan="${cols.length + 1}">${esc(catLabel)}</th></tr>`;
            for (const e of inCat) {
                html += `<tr><th class="fxp-eff" title="${esc(e.tip || e.label)}"><span class="fxp-name">${esc(e.label)}</span><span class="fxp-rowbtns"><button type="button" class="btn tiny" data-rowon="${e.id}" title="Use ${esc(e.label)} now and then on every kind of prop that has none of it">all</button><button type="button" class="btn tiny" data-rowoff="${e.id}" title="Never use ${esc(e.label)}">none</button></span></th>`;
                for (const c of cols) {
                    const w = tbl[c][e.id] || 0, d = def[part][c][e.id] || 0;
                    const share = sums[c] ? w / sums[c] : 0;
                    const tip = w ? `${e.label} on ${label(c)}: ${w}, picked about ${Math.round(share * 100)}% of the time` : `${e.label} is never used on ${label(c)}`;
                    html += `<td class="${w ? 'on' : ''}${w !== d ? ' chg' : ''}" style="--share:${Math.round(Math.min(1, share * 2.2) * 100)}%"><input type="number" class="fxw" min="0" max="999" step="1" inputmode="numeric" value="${w || ''}" placeholder="·" data-c="${c}" data-e="${e.id}" aria-label="${esc(e.label)} on ${esc(label(c))}" title="${esc(tip + (w !== d ? ` (default: ${d || 'never'})` : ''))}"></td>`;
                }
                html += '</tr>';
            }
        }
        if (!rows.length) html += `<tr><td colspan="${cols.length + 1}" class="muted">No effect matches.</td></tr>`;
        html += '</tbody>';
        $('fxpTable').innerHTML = html;
        // summary
        const usable = list.filter(e => EffectPrefs.CLASSES.some(c => tbl[c][e.id] > 0)).length;
        const empty = cols.filter(c => !sums[c]);
        $('fxpSummary').textContent = `${usable} of ${list.length} effects in use.` + (empty.length ? ` Nothing on: ${empty.map(label).join(', ')}${part === 'steady' ? ' (ideas leave these out)' : ' (these get no hits)'}.` : '');
        // hand-picked ones
        const hand = EffectPrefs.handOnly();
        $('fxpHand').innerHTML = hand.length ? `<h3>Pick these by hand</h3><p class="hint">Ideas don't choose these by themselves; add them to a light row in <b>2. Make a sequence</b>.</p><ul>${hand.map(e => `<li><b>${esc(e.label)}</b> <span class="muted">${esc(e.why || '')}</span></li>`).join('')}</ul>` : '';
    }

    // redraw, keeping the cell being typed in focused
    function draw() {
        const a = document.activeElement;
        const at = a && a.classList && a.classList.contains('fxw') ? [a.dataset.c, a.dataset.e] : null;
        drawSets(); drawGrid();
        if (at) { const n = $('fxpTable').querySelector(`.fxw[data-c="${at[0]}"][data-e="${at[1]}"]`); if (n) { n.focus(); n.select(); } }
    }

    function bind() {
        $('fxpTable').addEventListener('change', e => {
            const inp = e.target.closest('.fxw');
            if (!inp) return;
            EffectPrefs.setWeight(part, inp.dataset.c, inp.dataset.e, Math.max(0, Math.min(999, parseFloat(inp.value) || 0)));
        });
        $('fxpTable').addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            const d = EffectPrefs.builtinDefault();
            if (b.dataset.coloff) EffectPrefs.edit(s => { for (const k of Object.keys(s[part][b.dataset.coloff])) s[part][b.dataset.coloff][k] = 0; });
            else if (b.dataset.coldef) EffectPrefs.edit(s => { s[part][b.dataset.coldef] = { ...d[part][b.dataset.coldef] }; });
            else if (b.dataset.rowoff) EffectPrefs.edit(s => { for (const c of EffectPrefs.CLASSES) s[part][c][b.dataset.rowoff] = 0; });
            else if (b.dataset.rowon) {
                const eff = Effects.get(b.dataset.rowon);
                EffectPrefs.edit(s => { for (const c of EffectPrefs.CLASSES) if (!s[part][c][b.dataset.rowon]) s[part][c][b.dataset.rowon] = part === 'hits' ? 1 : (eff.everyWeight ?? 4); });
            }
        });
        // keyboard: Enter moves down like a spreadsheet
        $('fxpTable').addEventListener('keydown', e => {
            if (e.key !== 'Enter' || !e.target.classList.contains('fxw')) return;
            e.preventDefault();
            const all = [...$('fxpTable').querySelectorAll(`.fxw[data-c="${e.target.dataset.c}"]`)];
            const i = all.indexOf(e.target);
            e.target.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => { const n = [...$('fxpTable').querySelectorAll(`.fxw[data-c="${e.target.dataset.c}"]`)][i + (e.shiftKey ? -1 : 1)]; if (n) { n.focus(); n.select(); } }, 0);
        });
        const setPart = p => {
            part = p;
            try { localStorage.setItem('xlweb-fxpage-part', p); } catch (e) { /* storage blocked */ }
            $('fxpSteady').setAttribute('aria-pressed', String(p === 'steady'));
            $('fxpHits').setAttribute('aria-pressed', String(p === 'hits'));
            $('fxpPartNote').innerHTML = p === 'steady'
                ? 'The look each prop has for a whole part of the song (or a phrase of it).'
                : 'Short effects on beats, bars, kicks, snares and sung notes, on top of the steady looks.';
            drawGrid();
        };
        $('fxpSteady').addEventListener('click', () => setPart('steady'));
        $('fxpHits').addEventListener('click', () => setPart('hits'));
        setPart(part);
        $('fxpFind').addEventListener('input', drawGrid);
        $('fxpUsed').addEventListener('change', drawGrid);
        $('fxpMine').addEventListener('change', drawGrid);
        $('fxpSet').addEventListener('change', e => {
            if (EffectPrefs.dirty() && !confirm('You have changes that are not saved. Switch anyway and lose them?')) { drawSets(); return; }
            EffectPrefs.choose(e.target.value);
        });
        const askName = (q, d) => { const n = prompt(q, d); return n && n.trim() ? n.trim() : null; };
        $('fxpSave').addEventListener('click', () => {
            if (EffectPrefs.active.builtin) { const n = askName('Save these effect choices as:', 'My effects'); if (n) EffectPrefs.saveAs(n); }
            else EffectPrefs.saveActive();
        });
        $('fxpSaveAs').addEventListener('click', () => { const n = askName('Save these effect choices as:', EffectPrefs.active.builtin ? 'My effects' : EffectPrefs.active.name + ' copy'); if (n) EffectPrefs.saveAs(n); });
        $('fxpRename').addEventListener('click', () => { const a = EffectPrefs.active; if (a.builtin) return; const n = askName('New name:', a.name); if (n) EffectPrefs.rename(a.id, n); });
        $('fxpDelete').addEventListener('click', () => { const a = EffectPrefs.active; if (!a.builtin && confirm(`Delete "${a.name}"? Ideas go back to the Default choices.`)) EffectPrefs.remove(a.id); });
        $('fxpDiscard').addEventListener('click', () => EffectPrefs.discard());
        $('fxpDefault').addEventListener('click', () => {
            if (EffectPrefs.dirty() && !confirm('Go back to the Default choices? Your unsaved changes are lost (saved sets stay in the list).')) return;
            EffectPrefs.resetToDefault();
        });
        $('fxpExport').addEventListener('click', () => {
            const data = EffectPrefs.exportData();
            const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = data.name.replace(/[\\/:*?"<>|]+/g, '_') + '.effects.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
        $('fxpImport').addEventListener('click', () => $('fxpFile').click());
        $('fxpFile').addEventListener('change', async e => {
            const f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            try { const p = EffectPrefs.importData(JSON.parse(await f.text())); $('fxpStatus').textContent = `Added "${p.name}"; ideas use it now.`; }
            catch (err) { $('fxpStatus').textContent = 'Could not read that file: ' + err.message; }
        });
        document.addEventListener('xl:fxprefs', () => setTimeout(draw, 0));
        document.addEventListener('xl:tab', e => { if (e.detail === 'fx') draw(); });
        const go = $('fxpGo');
        if (go) go.addEventListener('click', () => { const t = document.querySelector('.tab[data-tab="fx"]'); if (t) t.click(); window.scrollTo({ top: 0 }); });
    }

    bind();
    draw();
})();
