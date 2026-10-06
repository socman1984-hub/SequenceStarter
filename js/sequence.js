'use strict';

// Turns the user's plan ("chorus: arches + mega tree, chase, Christmas colours";
// "every beat: snowflakes flash") into rows of timed effects, renders preview
// frames from them, and writes an xLights .xsq.
const Sequencer = (() => {
    const FRAME_MS = 25;
    const MIN_MS = 50;             // xLights drops effects under 2 frames
    const LYRIC_TRACK = 'Lyrics';

    // "Chorus 2" -> "Chorus", "Chorus 1 b" -> "Chorus"
    const kindOf = name => String(name).replace(/(\s+(\d+|[a-z]))+$/i, '').trim();

    // What a row reacts to. 'span' = the whole section (or whole song).
    const TRIGGERS = [
        { id: 'span', label: 'The whole time' },
        { id: 'beats', label: 'Every beat' },
        { id: 'downbeats', label: 'First beat of each bar' },
        { id: 'kick', label: 'Kick drum hits' },
        { id: 'snare', label: 'Snare hits' },
        { id: 'hats', label: 'Hi-hat hits' },
        { id: 'onsets', label: 'Music hits (note onsets)' },
        { id: 'notes', label: 'Each sung note', vocal: true },
        { id: 'singing', label: 'While someone sings', vocal: true },
        { id: 'lines', label: 'Each sung line', vocal: true },
        { id: 'words', label: 'Each sung word', vocal: true },
        { id: 'leadin', label: 'Build-up: last 2 bars of the part' },
        { id: 'first', label: 'First beat of the part' },
        { id: 'lastbar', label: 'Last bar of the part' },
    ];
    // Triggers placed from the part itself rather than from song-wide marks.
    const PART_TRIGGERS = new Set(['leadin', 'first', 'lastbar']);
    const EVENTS = TRIGGERS.filter(t => t.id !== 'span');

    function marksFor(id, song) {
        const g = song.grid, m = song.model, L = song.lyr;
        const T = g.T, dur = m.duration;
        const onsets = list => {
            const strong = list.filter(o => o.s >= 0.35);
            return strong.map((o, i) => ({ s: o.t, e: Math.min(o.t + T * 0.5, i + 1 < strong.length ? strong[i + 1].t : dur, dur) }));
        };
        switch (id) {
            case 'beats': return g.beats.map(b => ({ s: b.s, e: b.e }));
            case 'downbeats': return g.bars.map(b => ({ s: b.s, e: Math.min(b.e, b.s + T * 2) }));
            case 'kick': return onsets(m.onsets.kick);
            case 'snare': return onsets(m.onsets.snare);
            case 'hats': return onsets(m.onsets.hat || []);
            case 'onsets': return onsets(m.onsets.all || []);
            case 'notes': return L && L.notes ? L.notes.map(x => ({ s: x.s, e: x.e })) : [];
            case 'singing': return L ? L.vseg.map(x => ({ s: x.s, e: x.e })) : [];
            case 'lines': return L ? L.lines.map(x => ({ s: x.s, e: x.e })) : [];
            case 'words': return L ? L.words.map(x => ({ s: x.s, e: x.e })) : [];
        }
        return [];
    }

    // ---------- the plan ----------
    //
    // { version: 2,
    //   whole:    { rows: [row] },                 // under everything, whole song
    //   sections: { [sectionId]: { rows: [row], pool: [targets], dip: beats } } }
    // dip: the part's lights stop that many beats before its end (a held breath
    // before the next part comes in).
    // row = { id, trigger, targets, effect, options, colors, scheme, perModel,
    //         level (brightness %, default 100), endFade / startFade (seconds of fade-out at
    //         the end / fade-in at the start),
    //         bars: [from, to) bar indexes within the part (a phrase of a long part; default all),
    //         colourBy: 'bar' (hits change colour each bar rather than each hit),
    //         softIn / softOut: seconds every effect of the row fades in / out,
    //         blend: 'unmask' | 'mask' (how it mixes with the layers below; default adds),
    //         overlay: on a group, every prop shows the same thing (xLights' Overlay buffer),
    //         chop: 'beat' | 'bar' (a steady row restarts on each), alt: 'dir' | 'colour' | 'both'
    //         (what changes at each restart), sparkles: 0..200 (+ musicSparkles),
    //         inTr / outTr: 'wipe' | 'circle' (how its first / last effect comes in / goes;
    //         lasts startFade / endFade, or inTrTime / outTrTime seconds), spin: turns of the
    //         whole picture over each effect }
    // An imported row (trigger 'fixed', effect 'xl') carries xLights effects exactly:
    //   xl: { name, layer, strand?, node?, items: [{ s, e (ms), r, p }], colors0 }
    // r / p index plan.imported.db / .pals (the original settings and palette
    // strings); plan.imported.timings keeps the sequence's own timing tracks.

    const emptyPlan = () => ({ version: 2, whole: { rows: [] }, sections: {} });
    const newId = () => Math.random().toString(36).slice(2, 9);

    // Plans made before sections had their own lights: rows applied to every
    // section of a kind, and events carried a list of kinds.
    function migrate(p, song) {
        if (p && p.version === 2) return p;
        const out = emptyPlan();
        if (!p || !Array.isArray(p.rows) || !song) return out;
        const secs = song.sections;
        const add = (sid, row) => { (out.sections[sid] = out.sections[sid] || { rows: [], pool: [] }).rows.push({ ...row, id: newId() }); };
        for (const r of p.rows) {
            const base = { targets: r.targets, effect: r.effect, options: r.options || {}, colors: r.colors, scheme: r.scheme, perModel: r.perModel };
            if (r.when === 'part:*') out.whole.rows.push({ ...base, id: newId(), trigger: 'span' });
            else if (r.when.startsWith('part:')) {
                const k = r.when.slice(5);
                for (const s of secs) if (kindOf(s.name) === k) add(s.id, { ...base, trigger: 'span' });
            } else if (r.when.startsWith('event:')) {
                const ev = r.when.slice(6);
                if (!r.during || !r.during.length) out.whole.rows.push({ ...base, id: newId(), trigger: ev });
                else for (const s of secs) if (r.during.includes(kindOf(s.name))) add(s.id, { ...base, trigger: ev });
            }
        }
        return out;
    }

    function cloneRows(rows) {
        return rows.map(r => ({ ...JSON.parse(JSON.stringify(r)), id: newId() }));
    }

    // ---------- importing an xLights sequence ----------

    const sectionAt = (song, ms) => {
        let k = 0;
        for (let i = 0; i < song.sections.length; i++) if (song.sections[i].s * 1000 <= ms + 1) k = i;
        return song.sections[k];
    };

    // A plan holding every effect of an .xsq exactly as it is, grouped per part of
    // the song, per prop, per layer and per effect type.
    function importXsq(text, song) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror') || !doc.querySelector('xsequence')) throw new Error("this file isn't an xLights sequence (.xsq)");
        const db0 = [...doc.querySelectorAll('EffectDB > Effect')].map(e => e.textContent);
        const pal0 = [...doc.querySelectorAll('ColorPalettes > ColorPalette')].map(e => e.textContent);
        // order: the sequence's rows, top to bottom (xLights renders them in that order)
        const X = { db: [], pals: [], timings: [], order: [] };
        const dbI = new Map(), palI = new Map();
        const intern = (map, list, v) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };
        const plan = emptyPlan();
        plan.imported = X;
        for (const sec of song.sections) plan.sections[sec.id] = { rows: [], pool: [] };
        const groups = new Map();
        let effects = 0;
        const add = (target, layer, el, strand, node) => {
            const name = el.getAttribute('name') || 'On';
            const s = Math.round(+el.getAttribute('startTime')), e = Math.round(+el.getAttribute('endTime'));
            if (!(e > s)) return;
            const r = intern(dbI, X.db, db0[+el.getAttribute('ref')] || '');
            const p = intern(palI, X.pals, pal0[+el.getAttribute('palette')] || '');
            const sec = sectionAt(song, s);
            const key = [sec.id, target, layer, name, strand ?? '', node ?? ''].join('|');
            let row = groups.get(key);
            if (!row) {
                const xl = { name, layer, items: [] };
                if (strand != null) xl.strand = strand;
                if (node != null) xl.node = node;
                row = { id: newId(), trigger: 'fixed', targets: [target], effect: 'xl', keep: true, xl, colors: [], scheme: 'custom' };
                groups.set(key, row);
                plan.sections[sec.id].rows.push(row);
            }
            row.xl.items.push({ s, e, r, p });
            effects++;
        };
        const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);
        const ee = doc.querySelector('ElementEffects');
        for (const el of ee ? kids(ee, 'Element') : []) {
            const type = el.getAttribute('type'), name = el.getAttribute('name');
            if (type === 'timing') { X.timings.push({ name, xml: new XMLSerializer().serializeToString(el) }); continue; }
            if (type !== 'model' || !name) continue;
            X.order.push(name);
            let li = 0;
            const subLayer = new Map();
            for (const ch of el.children) {
                if (ch.tagName === 'EffectLayer') { for (const e of kids(ch, 'Effect')) add(name, li, e); li++; }
                else if (ch.tagName === 'SubModelEffectLayer') {
                    const sn = ch.getAttribute('name');
                    const k = subLayer.get(sn) || 0;
                    subLayer.set(sn, k + 1);
                    for (const e of kids(ch, 'Effect')) add(name + '/' + sn, k, e);
                } else if (ch.tagName === 'Strand') {
                    const si = +ch.getAttribute('index');
                    for (const e of kids(ch, 'Effect')) add(name, 0, e, si);
                    for (const nd of kids(ch, 'Node')) for (const e of kids(nd, 'Effect')) add(name, 0, e, si, +nd.getAttribute('index'));
                }
            }
        }
        for (const c of Object.values(plan.sections)) for (const r of c.rows) {
            r.xl.items.sort((a, b) => a.s - b.s);
            r.colors = Effects.palColors(X.pals[r.xl.items[0].p]);
            r.xl.colors0 = r.colors.slice();
        }
        const media = (doc.querySelector('head > mediaFile') || {}).textContent || '';
        // xLights upgrades old effect settings on load by the file's version, so the
        // export must say the version they were written for or they render differently
        X.version = ((doc.querySelector('head > version') || {}).textContent || '').trim();
        return { plan, effects, rows: groups.size, media };
    }

    // After parts are split, joined or reset, every imported effect moves to the
    // part it now falls in (rows keep their own settings; a row split across
    // parts becomes one row per part). extra: imported rows from removed parts.
    function regroupImported(plan, song, extra = []) {
        if (!plan || !plan.imported) return;
        const rows = extra.slice();
        for (const c of Object.values(plan.sections)) {
            rows.push(...c.rows.filter(r => r.trigger === 'fixed'));
            c.rows = c.rows.filter(r => r.trigger !== 'fixed');
        }
        for (const r of rows) {
            const by = new Map();
            for (const it of (r.xl && r.xl.items) || []) {
                const id = sectionAt(song, it.s).id;
                if (!by.has(id)) by.set(id, []);
                by.get(id).push(it);
            }
            let first = true;
            for (const [id, items] of by) {
                const c = plan.sections[id] = plan.sections[id] || { rows: [], pool: [] };
                c.rows.push({ ...r, id: first ? r.id : newId(), xl: { ...r.xl, items } });
                first = false;
            }
        }
    }

    // ---------- generation ----------

    // Marks of the exported timing tracks the beat meter can follow.
    function trackMarks(name, song, imported) {
        const g = song.grid;
        // a timing track that came with an imported sequence
        const own = imported && imported.timings && imported.timings.find(t => t.name === name);
        if (own) return [...own.xml.matchAll(/startTime="(\d+)"\s+endTime="(\d+)"/g)].map(m => ({ s: +m[1] / 1000, e: +m[2] / 1000 })).sort((a, b) => a.s - b.s);
        if (name === 'Bars') return g.bars.map(b => ({ s: b.s, e: b.e }));
        if (name === 'Note Onsets') return marksFor('onsets', song);
        return g.beats.map(b => ({ s: b.s, e: b.e }));
    }

    function generate(plan, song, show) {
        const rows = new Map();       // target -> { layers: [[fx]] }
        const snap = s => Math.round(s * 1000 / FRAME_MS) * FRAME_MS;
        let count = 0;
        const problems = [];
        // props named in the plan that this show doesn't have: left out, and listed
        const missing = new Set();
        const headCache = new Map();
        const markCache = new Map();
        const marks = id => { if (!markCache.has(id)) markCache.set(id, marksFor(id, song)); return markCache.get(id); };

        const place = (target, fx, minLayer) => {
            let r = rows.get(target);
            if (!r) { r = { layers: [] }; rows.set(target, r); }
            for (let li = minLayer; ; li++) {
                if (!r.layers[li]) r.layers[li] = [];
                const layer = r.layers[li];
                let ok = true;
                for (let j = layer.length - 1; j >= 0; j--) {
                    const o = layer[j];
                    if (o.sMs < fx.eMs && fx.sMs < o.eMs) { ok = false; break; }
                }
                if (ok) { layer.push(fx); fx.layer = li; return; }
            }
        };

        // containers: the whole song first, then each section in order
        const containers = [{ s: 0, e: song.model.duration, rows: (plan.whole && plan.whole.rows) || [], whole: true }];
        for (const sec of song.sections) {
            const c = plan.sections && plan.sections[sec.id];
            if (c && c.rows.length) containers.push({ s: sec.s, e: Math.max(sec.s + 0.1, sec.e - (c.dip > 0 ? c.dip * song.grid.T : 0)), rows: c.rows, sectionId: sec.id, bars: song.grid.bars.filter(b => b.s >= sec.s - 0.05 && b.s < sec.e - 0.05) });
        }
        // Off rows go on a layer above everything else on their lights (placed last)
        const offs = [];
        // span rows take the bottom layers; event rows stack above them
        const jobs = [];
        for (const c of containers) for (const row of c.rows) jobs.push({ c, row });
        jobs.sort((a, b) => ((a.row.trigger || 'span') === 'span' ? 0 : 1) - ((b.row.trigger || 'span') === 'span' ? 0 : 1));

        // Imported effects keep their own layers (below anything made here), their
        // exact times and their original settings.
        const X = plan.imported;
        const pvCache = new Map();
        const placeImp = (target, fx) => {
            let r = rows.get(target);
            if (!r) { r = { layers: [] }; rows.set(target, r); }
            if (fx.strand != null) {
                r.strands = r.strands || new Map();
                let st = r.strands.get(fx.strand);
                if (!st) r.strands.set(fx.strand, st = { fx: [], nodes: new Map() });
                if (fx.node != null) { if (!st.nodes.has(fx.node)) st.nodes.set(fx.node, []); st.nodes.get(fx.node).push(fx); }
                else st.fx.push(fx);
                return;
            }
            r.imp = r.imp || [];
            for (let k = 0; ; k++) {
                const key = fx.xlLayer + k * 0.001;
                let L = r.imp.find(x => x.key === key);
                if (!L) { L = { key, fx: [] }; r.imp.push(L); }
                if (!L.fx.some(o => o.sMs < fx.eMs && fx.sMs < o.eMs)) { L.fx.push(fx); return; }
            }
        };
        for (const { row } of jobs) {
            if (row.trigger !== 'fixed' || !X || !row.xl) continue;
            const recolor = row.colors && row.xl.colors0 && row.colors.join() !== row.xl.colors0.join();
            for (const it of row.xl.items) {
                const settings = X.db[it.r] || '';
                const palStr = recolor ? Effects.recolorPal(X.pals[it.p] || '', row.colors) : (X.pals[it.p] || '');
                const ck = it.r + '|' + palStr + '|' + row.xl.name;
                let pv = pvCache.get(ck);
                if (!pv) { pv = Effects.fromXl(row.xl.name, settings, palStr); pvCache.set(ck, pv); }
                for (const target of row.targets) {
                    if (!Show.hasTarget(show, target)) { missing.add(target); continue; }
                    const isGroup = show.groups.has(target);
                    placeImp(target, {
                        sMs: it.s, eMs: it.e, eff: pv.eff, o: pv.o, colors: pv.colors, pal: pv.pal, index: 0, rowId: row.id, isGroup,
                        perModel: isGroup && pv.perModel, level: pv.level, startFade: pv.fadeIn, endFade: pv.fadeOut, inTr: pv.inTr, outTr: pv.outTr,
                        sparkles: 0, spin: pv.spin, rot0: pv.rot0, transform: pv.transform, ppv: pv.ppv, target, mix: pv.mix, xlLayer: row.xl.layer, strand: row.xl.strand, node: row.xl.node,
                        marks: pv.eff.id === 'vumeter' ? trackMarks(pv.o.track, song, X) : null,
                        raw: { name: row.xl.name, settings, pal: palStr },
                    });
                    count++;
                }
            }
        }

        for (const { c, row } of jobs) {
            if (row.trigger === 'fixed') continue;
            const eff = Effects.get(row.effect);
            if (!eff || !row.targets || !row.targets.length) continue;
            const colors = row.colors && row.colors.length ? row.colors : ['#FFFFFF'];
            const pal = colors.map(Effects.hexToRgb);
            const opts = { ...eff.options, ...(row.options || {}) };
            const trig = row.trigger || 'span';
            const isEvent = trig !== 'span';
            // a phrase of the part: only its bars
            let ws = c.s, we = c.e;
            if (row.bars && c.bars && c.bars.length) {
                const [b0, b1] = row.bars;
                ws = b0 > 0 && c.bars[b0] ? c.bars[b0].s : c.s;
                we = b1 != null && b1 < c.bars.length ? Math.min(c.e, c.bars[b1].s) : c.e;
                if (we - ws < 0.05) continue;
            }
            let spans;
            if (!isEvent && (row.chop === 'beat' || row.chop === 'bar')) {
                const list = row.chop === 'bar' ? song.grid.bars : song.grid.beats;
                spans = list.filter(b => b.s >= ws - 0.001 && b.s < we - 0.05).map(b => ({ s: b.s, e: Math.min(b.e, we) }));
                if (spans.length && spans[0].s > ws + 0.05) spans.unshift({ s: ws, e: spans[0].s });
            } else if (!isEvent) spans = [{ s: ws, e: we }];
            else if (PART_TRIGGERS.has(trig)) spans = partSpans(trig, c, song);
            else spans = marks(trig).filter(m => m.s >= ws - 0.001 && m.s < we).map(m => ({ s: m.s, e: Math.min(m.e, we) }));
            const barIndex = t => { const bs = song.grid.bars; let lo = 0, hi = bs.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bs[mid].s <= t + 0.01) lo = mid; else hi = mid - 1; } return lo; };
            const alt = row.chop ? row.alt || '' : '';
            const vuMarks = eff.id === 'vumeter' ? trackMarks(opts.track, song, X) : null;
            spans.forEach((sp, n) => {
                const index = row.colourBy === 'bar' ? barIndex(sp.s) : n;
                const sMs = snap(sp.s), eMs = snap(sp.e);
                if (eMs - sMs < MIN_MS) return;
                // a chopped row: every other restart turned round, and / or the next colour
                const flipNow = (alt === 'dir' || alt === 'both') && n % 2 === 1;
                const spanOpts = flipNow ? Effects.flip(eff.id, opts) : opts;
                const recolour = (alt === 'colour' || alt === 'both') && colors.length > 1;
                const spanColors = recolour ? [colors[n % colors.length]] : colors;
                const spanPal = recolour ? [pal[n % pal.length]] : pal;
                const first = n === 0, last = n === spans.length - 1;
                for (const target of row.targets) {
                    if (!Show.hasTarget(show, target)) { missing.add(target); continue; }
                    if (eff.needsFace) {
                        const m = show.models.get(target);
                        if (!m || !m.faces.length) { if (!problems.includes(target)) problems.push(target); continue; }
                    }
                    const o = eff.needsFace ? { ...spanOpts, face: spanOpts.face || show.models.get(target).faces[0].name } : spanOpts;
                    const isGroup = show.groups.has(target);
                    const perModel = isGroup && (eff.dmx || (row.perModel ?? eff.perModel));
                    const level = row.level != null ? Math.max(0, Math.min(100, row.level)) : 100;
                    const endFade = row.endFade > 0 && n === spans.length - 1 ? Math.min(row.endFade, (eMs - sMs) / 1000) : 0;
                    let startFade = row.startFade > 0 && n === 0 ? Math.min(row.startFade, (eMs - sMs) / 1000) : 0;
                    // soft edges on every effect of the row, never more than 40% of it
                    const len = (eMs - sMs) / 1000;
                    if (row.softIn > 0 && !startFade) startFade = Math.min(row.softIn, len * 0.4);
                    const softOut = row.softOut > 0 && !endFade ? Math.min(row.softOut, len * 0.4) : 0;
                    // moving heads take only the Moving Head effect, and it only moves heads:
                    // anything else would write colours into their pan / tilt channels
                    if (!headCache.has(target)) headCache.set(target, Show.movingHeadsIn(show, target).length);
                    const heads = headCache.get(target);
                    if (eff.dmx ? !heads : (heads && show.models.has(target) && show.models.get(target).mh)) { if (!problems.includes(target)) problems.push(target); continue; }
                    const blend = !eff.dmx && (row.blend === 'unmask' || row.blend === 'mask') ? row.blend : null;
                    const len2 = (eMs - sMs) / 1000;
                    const inTr = !eff.dmx && first && (row.inTr === 'wipe' || row.inTr === 'circle') ? row.inTr : null;
                    const outTr = !eff.dmx && last && (row.outTr === 'wipe' || row.outTr === 'circle') ? row.outTr : null;
                    let sf = eff.dmx ? 0 : startFade, ef = eff.dmx ? 0 : endFade || softOut;
                    if (inTr) sf = Math.min(len2 * 0.6, sf || row.inTrTime || song.grid.T * 2);
                    if (outTr) ef = Math.min(len2 * 0.6, ef || row.outTrTime || song.grid.T * 2);
                    const fx = { sMs, eMs, eff, o, colors: spanColors, pal: spanPal, index, rowId: row.id, isGroup, perModel: perModel || (isGroup && !!row.overlay && !eff.dmx), overlay: isGroup && !!row.overlay && !eff.dmx, blend, level: eff.dmx ? 100 : level, endFade: ef, startFade: sf, target,
                        inTr, outTr, sparkles: eff.dmx ? 0 : Math.max(0, Math.min(200, +row.sparkles || 0)), music: !!row.musicSparkles, spin: eff.dmx ? 0 : Math.max(0, Math.min(20, +row.spin || 0)), marks: vuMarks };
                    if (eff.blackout) { offs.push(fx); count++; return; }
                    place(target, fx, isEvent || blend ? 1 : 0);
                    count++;
                }
            });
        }
        const top = new Map();
        for (const fx of offs) {
            if (!top.has(fx.target)) top.set(fx.target, rows.has(fx.target) ? rows.get(fx.target).layers.length : 0);
            place(fx.target, fx, top.get(fx.target));
        }
        for (const r of rows.values()) {
            for (let i = 0; i < r.layers.length; i++) if (!r.layers[i]) r.layers[i] = [];
            for (const l of r.layers) l.sort((a, b) => a.sMs - b.sMs);
            if (r.imp) { r.imp.sort((a, b) => a.key - b.key); for (const L of r.imp) L.fx.sort((a, b) => a.sMs - b.sMs); }
            if (r.strands) for (const st of r.strands.values()) { st.fx.sort((a, b) => a.sMs - b.sMs); for (const l of st.nodes.values()) l.sort((a, b) => a.sMs - b.sMs); }
        }
        return { rows, count, problems, missing: [...missing], imported: X || null };
    }

    // The last two bars of a part (a build-up into the next one), or its first beat.
    function partSpans(trig, c, song) {
        const bars = song.grid.bars.filter(b => b.s >= c.s - 0.05 && b.s < c.e - 0.05);
        if (!bars.length) return [];
        if (trig === 'first') return [{ s: c.s, e: Math.min(c.e, c.s + song.grid.T * 2) }];
        if (trig === 'lastbar') return [{ s: bars[bars.length - 1].s, e: c.e }];
        const from = bars[Math.max(0, bars.length - 2)].s;
        return from > c.s + 0.05 || bars.length <= 2 ? [{ s: from, e: c.e }] : [];
    }

    // ---------- preview rendering ----------

    // stride > 1 keeps every stride-th light of each row: enough for measuring
    // the show (fit check), much cheaper than drawing it.
    // The sequence's rows, top to bottom. xLights renders rows in this order and a
    // later row draws over earlier ones where it is lit, so groups go first (at the
    // back) and props after them, each by name, the way xLights' "sort: groups at
    // top, by name" does. An imported sequence keeps its own order.
    function rowOrder(show, imported) {
        if (imported && imported.order && imported.order.length) return imported.order.slice();
        const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        return [...show.groups.keys()].sort(byName).concat([...show.models.keys()].sort(byName));
    }

    function prepare(show, gen, song, stride = 1) {
        let offset = 0;
        for (const m of show.models.values()) { m.offset = offset; offset += m.nodes.length; }
        const targets = [];
        for (const [name, r] of gen.rows) {
            let list = Show.resolveTarget(show, name);
            if (stride > 1) list = list.filter((t, i) => i % stride === 0);
            if (!list.length) continue;
            const n = list.length;
            const N = { n, u: new Float32Array(n), v: new Float32Array(n), k: new Int32Array(n), seed: new Int32Array(n), g: new Int32Array(n), w: 96, h: 50 };
            // the same nodes seen through each model's own buffer
            const NM = { ...N, u: new Float32Array(n), v: new Float32Array(n), k: new Int32Array(n), bw: new Float32Array(n), bh: new Float32Array(n) };
            list.forEach((t, i) => {
                N.u[i] = t.u; N.v[i] = t.v; N.k[i] = i; N.g[i] = t.model.offset + t.i; N.seed[i] = N.g[i] * 2654435761 | 0;
                NM.u[i] = t.mu; NM.v[i] = t.mv; NM.k[i] = t.i; NM.bw[i] = Math.max(1, t.bw || 1); NM.bh[i] = Math.max(1, t.bh || 1);
            });
            const m = show.models.get(name);
            const grp = show.groups.get(name);
            if (m) { N.w = NM.w = Math.max(8, m.bufW); N.h = NM.h = Math.max(8, m.bufH); }
            else if (!grp && list[0].bw) { N.w = list[0].bw; N.h = list[0].bh; }
            else if (grp) {
                // A group's own buffer (xLights ModelGroup, "minimalGrid"): its members' spread on
                // the layout, scaled down so the longer side is at most GridSize. "Per Preview"
                // uses the spread unscaled (NP).
                let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
                for (const t of list) { const p = t.model.nodes[t.i].pts[0]; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
                const W = Math.max(8, x1 - x0 + 1), H = Math.max(8, y1 - y0 + 1), gs = grp.gridSize || 400;
                const sc = W < gs && H < gs ? 1 : Math.min(gs / W, gs / H);
                N.w = Math.max(8, Math.round(W * sc)); N.h = Math.max(8, Math.round(H * sc));
                N.pw = Math.round(W); N.ph = Math.round(H);
            }
            // imported layers first (xLights' last layer is the bottom), then the ones made here
            const imp = (r.imp || []).slice().sort((a, b) => b.key - a.key).map(x => x.fx);
            targets.push({ name, N, NM, NP: N.pw ? { ...N, w: N.pw, h: N.ph } : N, model: m || null, layers: imp.concat(r.layers.filter(Boolean)), tmp: new Float32Array(3 * n), acc: new Float32Array(3 * n) });
        }
        // rows render in the sequence's order (a later row draws over earlier ones)
        const pos = new Map(rowOrder(show, gen.imported).map((n2, i) => [n2, i]));
        const at = t => (pos.has(t.name) ? pos.get(t.name) : pos.has(t.name.split('/')[0]) ? pos.get(t.name.split('/')[0]) + 0.5 : 1e9);
        targets.sort((a, b) => at(a) - at(b));
        return { targets, total: offset, colors: new Float32Array(3 * offset) };
    }

    function activeAt(layer, ms) {
        let lo = 0, hi = layer.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const f = layer[mid];
            if (f.eMs <= ms) lo = mid + 1;
            else if (f.sMs > ms) hi = mid - 1;
            else return f;
        }
        return null;
    }

    function itemAt(list, t) {
        let lo = 0, hi = list.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].e <= t) lo = mid + 1;
            else if (list[mid].s > t) hi = mid - 1;
            else return list[mid];
        }
        return null;
    }

    function renderFaces(fx, tgt, song, out, t) {
        const m = tgt.model;
        if (!m) return;
        const face = m.faces.find(f => f.name === fx.o.face) || m.faces[0];
        if (!face) return;
        const ph = song.lyr ? itemAt(song.lyr.phonemes, t) : null;
        const mouth = 'Mouth-' + (ph ? ph.text : 'rest');
        const blink = (t % 4.3) < 0.15;
        const lit = (stateName, fallback) => {
            const idx = face.states[stateName];
            if (!idx) return;
            const col = face.colors[stateName] ? Effects.hexToRgb(face.colors[stateName]) : fallback;
            for (const i of idx) { out[3 * i] = col[0]; out[3 * i + 1] = col[1]; out[3 * i + 2] = col[2]; }
        };
        const c0 = fx.pal[0], c1 = fx.pal[1] || fx.pal[0];
        for (const k of Object.keys(face.states)) if (/^FaceOutline/.test(k)) lit(k, c0);
        for (const k of Object.keys(face.states)) if ((blink ? /^Eyes-Closed/ : /^Eyes-Open/).test(k)) lit(k, c1);
        lit(mouth, c1);
        lit(mouth + '2', c1);
    }

    // Buffer rotation (RotoZoom): the picture turns about the centre. A node shows
    // the pixel that rotated onto it; nodes nothing reaches go dark (out[k]).
    // Buffer transforms (B_CHOICE_BufferTransform): the effect drawn turned or mirrored.
    function transformed(tgt, N, kind) {
        const key = 'tf:' + kind + (N === tgt.NM ? ':M' : ':N');
        let R = tgt[key];
        if (R) return R;
        R = tgt[key] = { ...N, u: new Float32Array(N.n), v: new Float32Array(N.n) };
        if (N.bw) { R.bw = new Float32Array(N.n); R.bh = new Float32Array(N.n); }
        const swap = /90/.test(kind);
        if (swap && !N.bw) { R.w = N.h; R.h = N.w; }
        for (let k = 0; k < N.n; k++) {
            let u = N.u[k], v = N.v[k];
            switch (kind) {
                case 'Rotate CC 90': [u, v] = [v, 1 - u]; break;
                case 'Rotate CW 90': [u, v] = [1 - v, u]; break;
                case 'Rotate 180': [u, v] = [1 - u, 1 - v]; break;
                case 'Flip Horizontal': u = 1 - u; break;
                case 'Flip Vertical': v = 1 - v; break;
                case 'Rotate CC 90 and Flip': [u, v] = [1 - v, 1 - u]; break;
                case 'Rotate CW 90 and Flip': [u, v] = [v, u]; break;
            }
            R.u[k] = u; R.v[k] = v;
            if (N.bw) { R.bw[k] = swap ? N.bh[k] : N.bw[k]; R.bh[k] = swap ? N.bw[k] : N.bh[k]; }
        }
        return R;
    }
    function spun(tgt, N, turns) {
        let R = N.__spun;
        if (!R) R = N.__spun = { ...N, u: new Float32Array(N.n), v: new Float32Array(N.n), out: new Uint8Array(N.n) };
        const a = 2 * Math.PI * (turns % 1), c = Math.cos(a), s = Math.sin(a);
        for (let k = 0; k < N.n; k++) {
            const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
            const x = (N.u[k] - 0.5) * W, y = (N.v[k] - 0.5) * H;
            const u = (c * x + s * y) / W + 0.5, v = (-s * x + c * y) / H + 0.5;
            R.u[k] = u; R.v[k] = v;
            R.out[k] = u < 0 || u > 1 || v < 0 || v > 1 ? 1 : 0;
        }
        return R;
    }
    // In / out transitions (PixelBuffer createWipeMask / createCircleExplodeMask):
    // the wipe runs top to bottom (xLights' default adjust 50); the circle opens from
    // the centre. f: 0..1 through the transition; out: the picture goes away.
    function reveal(kind, N, tmp, f, out) {
        for (let k = 0; k < N.n; k++) {
            let shown;
            if (kind === 'circle') { const r = Math.hypot(N.u[k] - 0.5, N.v[k] - 0.5) / 0.7072; shown = out ? r > f : r < f; }
            else shown = out ? N.v[k] < 1 - f : N.v[k] > 1 - f;
            if (!shown) tmp[3 * k] = tmp[3 * k + 1] = tmp[3 * k + 2] = 0;
        }
    }
    // Palette sparkles (ApplySparkles): each lit light flashes white for a few
    // frames every (208 - count) frames, at its own phase.
    function sparkle(tmp, N, ms, count) {
        if (count <= 0) return;
        const frame = Math.round(ms / FRAME_MS), period = Math.max(8, 208 - count);
        for (let k = 0; k < N.n; k++) {
            const i = 3 * k;
            if (tmp[i] + tmp[i + 1] + tmp[i + 2] <= 0) continue;
            const m = (Math.floor(Effects.hash(N.g[k] * 2654435761 + 7) * 10000) + frame) % period;
            const b = m === 4 ? 255 : m === 2 || m === 6 ? 135 : m === 3 || m === 5 ? 191 : -1;
            if (b >= 0) tmp[i] = tmp[i + 1] = tmp[i + 2] = b;
        }
    }
    // 0..1: how loud the song is at t against its loudest (music sparkles follow it).
    function loudAt(song, t) {
        const m = song.model, L = m.loudness, step = m.loudStep || 0.05;
        if (!L || !L.length) return 1;
        if (!m._loudMax) { let mx = 0; for (const v of L) if (v > mx) mx = v; m._loudMax = mx || 1; }
        return Math.max(0, Math.min(1, (L[Math.min(L.length - 1, Math.floor(t / step))] || 0) / m._loudMax));
    }

    // xLights' mask blends (PixelBuffer mixColors), this layer `top` over `acc`:
    // unmask keeps the colour below where top is lit, at top's brightness (a dark
    // pixel below turns grey, as in xLights); mask blacks out where top is lit.
    function blendInto(mode, acc, top, n) {
        for (let k = 0; k < n; k++) {
            const i = 3 * k;
            const fv = Math.min(255, Math.max(top[i], top[i + 1], top[i + 2]));
            // Normal: a lit pixel covers what is under it; Layered: shows only where nothing is lit below
            if (mode === 'normal') { if (fv > 0) { acc[i] = top[i]; acc[i + 1] = top[i + 1]; acc[i + 2] = top[i + 2]; } continue; }
            if (mode === 'average') { const bv = Math.max(acc[i], acc[i + 1], acc[i + 2]); if (fv > 0) { if (bv > 0) { acc[i] = (acc[i] + top[i]) / 2; acc[i + 1] = (acc[i + 1] + top[i + 1]) / 2; acc[i + 2] = (acc[i + 2] + top[i + 2]) / 2; } else { acc[i] = top[i]; acc[i + 1] = top[i + 1]; acc[i + 2] = top[i + 2]; } } continue; }
            if (mode === 'layered') { if (Math.max(acc[i], acc[i + 1], acc[i + 2]) <= 0) { acc[i] = top[i]; acc[i + 1] = top[i + 1]; acc[i + 2] = top[i + 2]; } continue; }
            if (mode === 'mask') { if (fv > 0) acc[i] = acc[i + 1] = acc[i + 2] = 0; continue; }
            if (fv <= 0) { acc[i] = acc[i + 1] = acc[i + 2] = 0; continue; }
            const r = Math.min(255, acc[i]), g = Math.min(255, acc[i + 1]), b = Math.min(255, acc[i + 2]);
            const bv = Math.max(r, g, b);
            if (bv <= 0) { acc[i] = acc[i + 1] = acc[i + 2] = fv; continue; }
            const f = fv / bv;
            acc[i] = r * f; acc[i + 1] = g * f; acc[i + 2] = b * f;
        }
    }

    // Colours for every node at time t (seconds) into prep.colors.
    function renderFrame(prep, song, t) {
        const out = prep.colors;
        out.fill(0);
        Effects.resetMovingHeads();
        const ms = t * 1000;
        const word = song.lyr ? itemAt(song.lyr.words, t) : null;
        for (const tgt of prep.targets) {
            const N = tgt.N, acc = tgt.acc, tmp = tgt.tmp;
            let any = false, blackout = false;
            for (let li = 0; li < tgt.layers.length; li++) {
                const fx = activeAt(tgt.layers[li], ms);
                if (!fx) continue;
                const p = { t: (ms - fx.sMs) / (fx.eMs - fx.sMs), sec: (ms - fx.sMs) / 1000, dur: (fx.eMs - fx.sMs) / 1000, pal: fx.pal, o: fx.o, index: fx.index, word: word && word.text, abs: t, start: fx.sMs / 1000, marks: fx.marks };
                if (fx.eff.blackout) { acc.fill(0); any = true; blackout = true; continue; }
                if (fx.eff.id === 'faces') {
                    if (!any) acc.fill(0);
                    any = true;
                    const local = new Float32Array(3 * tgt.model.nodes.length);
                    renderFaces(fx, tgt, song, local, t);
                    // faces address model nodes directly
                    for (let k = 0; k < N.n; k++) {
                        const gi = N.g[k] - tgt.model.offset;
                        acc[3 * k] += local[3 * gi]; acc[3 * k + 1] += local[3 * gi + 1]; acc[3 * k + 2] += local[3 * gi + 2];
                    }
                    continue;
                }
                tmp.fill(0);
                let base = fx.perModel ? tgt.NM : fx.ppv === false ? N : tgt.NP;
                if (fx.transform) base = transformed(tgt, base, fx.transform);
                const turn = (fx.spin || 0) * p.t + (fx.rot0 || 0);
                const NN = turn ? spun(tgt, base, turn) : base;
                if (fx.o.__curves) p.o = Effects.optionsAt(fx.o, p.t);
                fx.eff.render(p, NN, tmp);
                if (turn) for (let k = 0; k < NN.n; k++) if (NN.out[k]) tmp[3 * k] = tmp[3 * k + 1] = tmp[3 * k + 2] = 0;
                let gain = fx.level / 100;
                if (fx.endFade > 0 && !fx.outTr) gain *= Math.max(0, Math.min(1, (p.dur - p.sec) / fx.endFade));
                if (fx.startFade > 0 && !fx.inTr) gain *= Math.max(0, Math.min(1, p.sec / fx.startFade));
                if (gain !== 1) for (let i = 0; i < tmp.length; i++) tmp[i] *= gain;
                if (fx.inTr && p.sec < fx.startFade) reveal(fx.inTr, base, tmp, p.sec / fx.startFade, false);
                if (fx.outTr && p.dur - p.sec < fx.endFade) reveal(fx.outTr, base, tmp, 1 - (p.dur - p.sec) / fx.endFade, true);
                if (fx.sparkles > 0) sparkle(tmp, N, ms, fx.music ? Math.round(fx.sparkles * loudAt(song, t)) : fx.sparkles);
                const mode = fx.blend || (fx.raw && fx.mix !== 'add' ? fx.mix : null);
                if (mode) {
                    if (!any) { acc.fill(0); any = true; }
                    blendInto(mode, acc, tmp, N.n);
                } else if (!any) { acc.set(tmp); any = true; }
                else for (let i = 0; i < tmp.length; i++) acc[i] += tmp[i];
            }
            if (!any) continue;
            for (let k = 0; k < N.n; k++) {
                const g = 3 * N.g[k];
                // layers add, but a bulb saturates
                const r = Math.min(255, acc[3 * k]), gg = Math.min(255, acc[3 * k + 1]), b = Math.min(255, acc[3 * k + 2]);
                // a later row draws over earlier ones where it is lit (xLights model
                // blending); a row with an Off playing covers them entirely
                if (blackout || r > 0 || gg > 0 || b > 0) { out[g] = r; out[g + 1] = gg; out[g + 2] = b; }
            }
        }
        return out;
    }

    // ---------- .xsq ----------

    const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    function toXsq(gen, song, show, meta) {
        const pals = [], palIdx = new Map();
        const db = [], dbIdx = new Map();
        const ctx = { lyricTrack: LYRIC_TRACK };
        // Overlay: every member draws the same picture. Same-size props sit centred
        // in one shared buffer; mixed sizes are each scaled to it (as the preview draws).
        const overlayCache = new Map();
        const overlayStyle = name => {
            if (!overlayCache.has(name)) {
                const sizes = new Set();
                for (const t of Show.resolveTarget(show, name)) sizes.add(t.bw + 'x' + t.bh);
                overlayCache.set(name, sizes.size <= 1 ? 'Overlay - Centered' : 'Overlay - Scaled');
            }
            return overlayCache.get(name);
        };
        const refOf = fx => {
            if (fx.raw) {
                // an imported effect: its own settings, byte for byte
                if (!dbIdx.has(fx.raw.settings)) { dbIdx.set(fx.raw.settings, db.length); db.push(fx.raw.settings); }
                return dbIdx.get(fx.raw.settings);
            }
            let s = fx.eff.settings(fx.o, { ...ctx, fx, show });
            // A group row's buffer has to be stated, or xLights uses the group's
            // default layout and the effect lands somewhere else than the preview shows.
            if (fx.isGroup) s = `B_CHOICE_BufferStyle=${fx.overlay ? overlayStyle(fx.target) : fx.perModel ? 'Per Model Default' : 'Per Preview'},` + s;
            if (fx.level !== 100) s += `,C_SLIDER_Brightness=${Math.round(fx.level)}`;
            if (fx.endFade > 0 && !/T_TEXTCTRL_Fadeout=/.test(s)) s += `,T_TEXTCTRL_Fadeout=${fx.endFade.toFixed(2)}`;
            if (fx.startFade > 0 && !/T_TEXTCTRL_Fadein=/.test(s)) s += `,T_TEXTCTRL_Fadein=${fx.startFade.toFixed(2)}`;
            if (fx.inTr) s += `,T_CHOICE_In_Transition_Type=${fx.inTr === 'circle' ? 'Circle Explode' : 'Wipe'},T_SLIDER_In_Transition_Adjust=50`;
            if (fx.outTr) s += `,T_CHOICE_Out_Transition_Type=${fx.outTr === 'circle' ? 'Circle Explode' : 'Wipe'},T_SLIDER_Out_Transition_Adjust=50`;
            if (fx.spin) s += `,B_SLIDER_Rotations=${Math.round(fx.spin * 10)},` + Effects.curveString('B', 'Rotation', { type: 'Ramp', min: 0, max: 100, p1: 0, p2: 100 });
            // Off has to sit on top as a Normal layer to hide what is under it
            if (fx.eff.blackout) { /* Normal */ }
            else if (fx.blend && Effects.BLENDS[fx.blend]) s += `,T_CHOICE_LayerMethod=${Effects.BLENDS[fx.blend].xl}`;
            else if (fx.above) s += Effects.ADD;
            if (!dbIdx.has(s)) { dbIdx.set(s, db.length); db.push(s); }
            return dbIdx.get(s);
        };
        const palOf = fx => {
            if (fx.raw) { if (!palIdx.has(fx.raw.pal)) { palIdx.set(fx.raw.pal, pals.length); pals.push(fx.raw.pal); } return palIdx.get(fx.raw.pal); }
            const s = Effects.paletteString(fx.eff.hitColour && fx.colors.length > 1 ? [fx.colors[fx.index % fx.colors.length]] : fx.colors, fx.sparkles ? { sparkles: fx.sparkles, music: fx.music } : null);
            if (!palIdx.has(s)) { palIdx.set(s, pals.length); pals.push(s); }
            return palIdx.get(s);
        };

        // Rows: a submodel target lives under its parent model's element.
        const elements = new Map();    // model/group name -> { layers, subs: Map(sub -> layers) }
        for (const [name, r] of gen.rows) {
            let parent = name, sub = null;
            if (!show.models.has(name) && !show.groups.has(name) && name.includes('/')) {
                parent = name.slice(0, name.indexOf('/'));
                sub = name.slice(name.indexOf('/') + 1);
            }
            if (!elements.has(parent)) elements.set(parent, { layers: null, subs: new Map() });
            const el = elements.get(parent);
            // xLights blends from its last layer up to layer 0, and a lit pixel on a
            // Normal layer hides what is under it. Steady rows go at the bottom and
            // hits above them, adding on top, as the preview shows them.
            const ours = r.layers.filter(Boolean).reverse();
            // imported layers keep their order and sit under everything made here
            const imp = (r.imp || []).map(x => x.fx);
            ours.forEach((l, i) => { for (const fx of l) fx.above = i < ours.length - 1 || imp.length > 0; });
            const layers = ours.concat(imp);
            if (sub) el.subs.set(sub, layers); else { el.layers = layers; el.strands = r.strands || null; }
        }

        // Every prop and group of the layout gets a row (empty if unused), as in a
        // sequence started in xLights, in render order: groups at the back, then props
        // (an imported sequence keeps its own rows and order); new rows follow it
        const order = rowOrder(show, gen.imported);
        for (const n of order) if (!elements.has(n)) elements.set(n, { layers: null, subs: new Map() });
        const pos = new Map(order.map((n, i) => [n, i]));
        const sorted = [...elements].sort((a, b) => (pos.has(a[0]) ? pos.get(a[0]) : 1e9) - (pos.has(b[0]) ? pos.get(b[0]) : 1e9));
        elements.clear();
        for (const [k, v] of sorted) elements.set(k, v);
        const L = [];
        L.push('<?xml version="1.0" encoding="UTF-8"?>');
        L.push('<xsequence BaseChannel="0" ChanCtrlBasic="0" ChanCtrlColor="0" FixedPointTiming="1" ModelBlending="true">');
        L.push('  <head>');
        const head = [['version', (gen.imported && gen.imported.version) || meta.version || '2025.09'], ['author', ''], ['author-email', ''], ['author-website', ''],
            ['song', meta.song || ''], ['artist', meta.artist || ''], ['album', ''], ['MusicURL', ''], ['comment', 'Made with Lights Auto Sequencer'],
            ['sequenceTiming', FRAME_MS + ' ms'], ['sequenceType', 'Media'], ['mediaFile', meta.mediaFile || ''],
            ['sequenceDuration', song.model.duration.toFixed(3)], ['imageDir', '']];
        for (const [k, v] of head) L.push(`    <${k}>${esc(v)}</${k}>`);
        L.push('  </head>');
        L.push('  <nextid>1</nextid>');
        L.push('  <Jukebox/>');

        // effects (collect refs first so the DB is complete)
        const body = [];
        const effectXml = (fx, indent) => `${indent}<Effect ref="${refOf(fx)}" name="${esc(fx.raw ? fx.raw.name : fx.eff.xl)}" startTime="${fx.sMs}" endTime="${fx.eMs}" palette="${palOf(fx)}"/>`;
        const layerXml = (fxs, indent, tag = 'EffectLayer', attrs = '') => {
            if (!fxs.length) { body.push(`${indent}<${tag}${attrs}/>`); return; }
            body.push(`${indent}<${tag}${attrs}>`);
            for (const fx of fxs) body.push(effectXml(fx, indent + '  '));
            body.push(`${indent}</${tag}>`);
        };
        for (const [name, el] of elements) {
            body.push(`    <Element type="model" name="${esc(name)}">`);
            const layers = el.layers && el.layers.length ? el.layers : [[]];
            for (const l of layers) layerXml(l, '      ');
            for (const [sub, sl] of el.subs) for (const l of sl) layerXml(l, '      ', 'SubModelEffectLayer', ` name="${esc(sub)}"`);
            if (el.strands) for (const [si, st] of [...el.strands].sort((a, b) => a[0] - b[0])) {
                body.push(`      <Strand index="${si}">`);
                for (const fx of st.fx) body.push(effectXml(fx, '        '));
                for (const [ni, nf] of [...st.nodes].sort((a, b) => a[0] - b[0])) {
                    body.push(`        <Node index="${ni}">`);
                    for (const fx of nf) body.push(effectXml(fx, '          '));
                    body.push('        </Node>');
                }
                body.push('      </Strand>');
            }
            body.push('    </Element>');
        }
        const timing = (name, layers) => {
            body.push(`    <Element type="timing" name="${esc(name)}">`);
            for (const marks of layers) {
                body.push('      <EffectLayer>');
                let prevE = -1;
                for (const mk of marks) {
                    let s = Math.round(mk.s * 1000 / FRAME_MS) * FRAME_MS, e = Math.round(mk.e * 1000 / FRAME_MS) * FRAME_MS;
                    if (s < prevE) s = prevE;
                    if (e <= s) continue;
                    body.push(`        <Effect label="${esc(mk.label)}" startTime="${s}" endTime="${e}"/>`);
                    prevE = e;
                }
                body.push('      </EffectLayer>');
            }
            body.push('    </Element>');
        };
        const g = song.grid;
        const timings = [
            ['Song Parts', [song.sections.map(s => ({ s: s.s, e: s.e, label: s.name }))]],
            ['Beats', [g.beats.map(b => ({ s: b.s, e: b.e, label: String(b.n) }))]],
            ['Bars', [g.bars.map(b => ({ s: b.s, e: b.e, label: String(b.n) }))]],
            // the music's own hits, for beat meters and for hand sequencing in xLights
            ['Note Onsets', [marksFor('onsets', song).map(m => ({ s: m.s, e: m.e, label: '' }))]],
        ];
        if (song.lyr) {
            timings.push([LYRIC_TRACK, [
                song.lyr.lines.map(x => ({ s: x.s, e: x.e, label: x.text })),
                song.lyr.words.map(x => ({ s: x.s, e: x.e, label: x.text })),
                song.lyr.phonemes.map(x => ({ s: x.s, e: x.e, label: x.text })),
            ]]);
        }
        const impTimings = (gen.imported && gen.imported.timings) || [];
        const taken = new Set(impTimings.map(t => t.name));
        for (let i = timings.length - 1; i >= 0; i--) if (taken.has(timings[i][0])) timings.splice(i, 1);
        for (const [name, layers] of timings) timing(name, layers);
        for (const t of impTimings) body.push('    ' + t.xml.replace(/ xmlns="[^"]*"/, ''));
        for (const t of impTimings) timings.push([t.name, []]);

        L.push('  <ColorPalettes>');
        for (const p of pals) L.push(`    <ColorPalette>${p}</ColorPalette>`);
        L.push('  </ColorPalettes>');
        L.push('  <EffectDB>');
        for (const s of db) L.push(`    <Effect>${esc(s)}</Effect>`);
        L.push('  </EffectDB>');
        L.push('  <DataLayers>');
        L.push('    <DataLayer lor_params="0" channel_offset="0" num_channels="0" num_frames="0" data="&lt;rendered: erase-mode&gt;" source="&lt;auto-generated&gt;" name="Nutcracker"/>');
        L.push('  </DataLayers>');
        L.push('  <DisplayElements>');
        for (const name of elements.keys()) L.push(`    <Element collapsed="0" type="model" name="${esc(name)}" visible="1"/>`);
        timings.forEach(([name], i) => L.push(`    <Element collapsed="0" type="timing" name="${esc(name)}" visible="1" views="" active="${i === 0 ? 1 : 0}"/>`));
        L.push('  </DisplayElements>');
        L.push('  <ElementEffects>');
        L.push(...body);
        L.push('  </ElementEffects>');
        L.push('  <lastView>0</lastView>');
        L.push('  <TimingTags>');
        for (let i = 0; i < 10; i++) L.push(`    <Tag number="${i}" position="-1"/>`);
        L.push('  </TimingTags>');
        L.push('</xsequence>');
        return L.join('\n') + '\n';
    }

    return { TRIGGERS, EVENTS, kindOf, emptyPlan, migrate, cloneRows, newId, generate, prepare, renderFrame, toXsq, LYRIC_TRACK, importXsq, regroupImported };
})();
