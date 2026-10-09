'use strict';
// Which effects ideas may pick for each kind of prop, and how often:
// `steady` for a part's own lights, `hits` for the flashes on beats and drums.
// Weights are relative (0 = never). "Default" is the built-in choice the app
// has always made; people can change it, save it under a name, share it as a file.
const EffectPrefs = (() => {
    // Prop kinds the page lists (Ideas' classes; moving heads and singing faces
    // have their own effects and are left out).
    const CLASSES = ['megatree', 'minitree', 'arch', 'cane', 'spinner', 'snowflake', 'star', 'wreath', 'matrix', 'cross', 'peace', 'window', 'flood', 'roof', 'generic'];

    // From the owner's 44 sequences (effect share per kind of prop), plus Fan /
    // Ripple / Spirograph, which pro sequences use on every kind of prop.
    const DEFAULT_STEADY = {
        arch: { chase: 51, wash: 38, bars: 5, fan: 5, vumeter: 3, wave: 2 },
        roof: { chase: 63, wash: 10, twinkle: 8, on: 9, fan: 4, morph: 3, meteors: 3, vumeter: 2 },
        cane: { chase: 46, on: 15, wash: 7, bars: 5, spirals: 4, vumeter: 4 },
        minitree: { chase: 21, on: 21, twinkle: 10, spirals: 5, fan: 5, vumeter: 3, snowflakes: 3, morph: 3, wave: 2 },
        megatree: { chase: 17, spirals: 10, pinwheel: 9, butterfly: 8, bars: 8, twinkle: 8, fan: 9, spirograph: 4, ripple: 4, wave: 5, morph: 4, curtain: 4, snowflakes: 4, meteors: 4, strobe: 1 },
        spinner: { chase: 28, pinwheel: 17, spirals: 8, twinkle: 5, wash: 5, fan: 14, ripple: 6, spirograph: 4, wave: 3, curtain: 2 },
        snowflake: { on: 20, twinkle: 15, pinwheel: 12, spirals: 6, wash: 8, fan: 10, ripple: 9, curtain: 2 },
        matrix: { pinwheel: 16, butterfly: 15, chase: 11, bars: 10, fan: 10, ripple: 8, spirograph: 10, curtain: 4, meteors: 4, snowflakes: 3, wave: 3 },
        cross: { chase: 20, pinwheel: 11, on: 10, ripple: 5 },
        peace: { chase: 49, on: 10, wave: 5 },
        window: { marquee: 41, chase: 17, on: 15, wash: 10 },
        flood: { on: 56, wash: 14, vumeter: 3, morph: 2 },
        star: { twinkle: 30, on: 30, pinwheel: 8, ripple: 8, fan: 6, strobe: 2, curtain: 2 },
        wreath: { chase: 30, pinwheel: 20, wash: 15, twinkle: 10, fan: 12, ripple: 6 },
        generic: { chase: 20, wash: 20, twinkle: 15, bars: 10, on: 10, spirals: 5, butterfly: 5, fan: 5, ripple: 4, wave: 3, morph: 2 },
    };
    // Hits: round props flash shockwaves, flashes, ripples and fans; props his
    // sequences hit with shockwaves mostly get those; the rest a flash.
    const ROUND_HITS = { shockwave: 4, pulse: 2, ripple: 2, fan: 2 };
    const WAVE_HITS = { shockwave: 7, pulse: 3 };
    const DEFAULT_HITS = {
        spinner: ROUND_HITS, snowflake: ROUND_HITS, wreath: ROUND_HITS, star: ROUND_HITS,
        minitree: WAVE_HITS, megatree: WAVE_HITS, matrix: WAVE_HITS, cross: WAVE_HITS,
        arch: { pulse: 1 }, roof: { pulse: 1 }, cane: { pulse: 1 }, peace: { pulse: 1 }, window: { pulse: 1 }, flood: { pulse: 1 }, generic: { pulse: 1 },
    };

    // Effects ideas may pick at random (as a part's look, or as a hit).
    const randomOk = e => e.random !== false && !e.dmx && e.use && e.use.length;
    const steadyList = () => Effects.LIST.filter(e => randomOk(e) && e.use.includes('part'));
    const hitList = () => Effects.LIST.filter(e => randomOk(e) && e.use.includes('hit'));
    // Effects the page lists but ideas can't pick by themselves (they need a file,
    // a model feature or other layers): shown greyed with the reason.
    const handOnly = () => Effects.LIST.filter(e => e.random === false && e.use && e.use.length && e.menu !== false);

    function full(table, list) {
        const out = {};
        for (const c of CLASSES) {
            out[c] = {};
            for (const e of list) out[c][e.id] = (table[c] && table[c][e.id]) || 0;
        }
        return out;
    }
    const builtinDefault = () => ({ steady: full(DEFAULT_STEADY, steadyList()), hits: full(DEFAULT_HITS, hitList()) });
    // "Every effect": the default, plus every other effect a little on every prop.
    function builtinEvery() {
        const d = builtinDefault();
        for (const c of CLASSES) {
            for (const e of steadyList()) if (!d.steady[c][e.id]) d.steady[c][e.id] = e.everyWeight ?? 4;
            for (const e of hitList()) if (!d.hits[c][e.id]) d.hits[c][e.id] = e.everyWeight === 0 ? 0 : 1;
        }
        return d;
    }
    const BUILTIN = [
        { id: 'default', name: 'Default', builtin: true, make: builtinDefault, note: 'What the app has always picked: the effects his sequences use on each kind of prop.' },
        { id: 'every', name: 'Every effect', builtin: true, make: builtinEvery, note: 'The default, plus every other effect now and then on every kind of prop.' },
    ];

    // A saved set keeps every weight it was given; effects added in later versions
    // come in at their default weight.
    function fill(sel) {
        const d = builtinDefault();
        const out = { steady: {}, hits: {} };
        for (const part of ['steady', 'hits']) {
            for (const c of CLASSES) {
                out[part][c] = { ...d[part][c] };
                const s = sel && sel[part] && sel[part][c];
                if (s) for (const [k, v] of Object.entries(s)) if (k in out[part][c]) out[part][c][k] = Math.max(0, Math.min(1000, +v || 0));
            }
        }
        return out;
    }
    const same = (a, b) => CLASSES.every(c => ['steady', 'hits'].every(p => Object.keys(a[p][c]).every(k => (a[p][c][k] || 0) === (b[p][c][k] || 0))));

    const KEY = 'xlweb-fxprefs';
    let st = { active: 'default', presets: [], working: null };
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && typeof v === 'object') st = { active: v.active || 'default', presets: Array.isArray(v.presets) ? v.presets.filter(p => p && p.id && p.name) : [], working: v.working || null };
    } catch (e) { /* defaults */ }
    const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked */ }
        document.dispatchEvent(new CustomEvent('xl:fxprefs'));
    };

    const presetOf = id => BUILTIN.find(b => b.id === id) || st.presets.find(p => p.id === id) || null;
    const selOf = p => (p.builtin ? p.make() : fill(p));
    if (!presetOf(st.active)) st.active = 'default';

    // What ideas use now: the active set, with any unsaved changes.
    let cache = null;
    function current() {
        if (!cache) cache = st.working ? fill(st.working) : selOf(presetOf(st.active));
        return cache;
    }
    const changed = () => { cache = null; };
    const dirty = () => !!st.working && !same(fill(st.working), selOf(presetOf(st.active)));

    function setWeight(part, cls, eff, w) {
        const cur = current();
        const next = JSON.parse(JSON.stringify(cur));
        next[part][cls][eff] = Math.max(0, Math.min(1000, Math.round(+w || 0)));
        st.working = next;
        changed();
        if (!dirty()) st.working = null;
        save();
    }
    // Change many weights at once: fn(sel) edits a copy.
    function edit(fn) {
        const next = JSON.parse(JSON.stringify(current()));
        fn(next);
        st.working = next;
        changed();
        if (!dirty()) st.working = null;
        save();
    }
    function choose(id) {
        if (!presetOf(id)) return;
        st.active = id; st.working = null; changed(); save();
    }
    const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    // Save: into the active set, or (for a built-in) as a new named set.
    function saveAs(name) {
        const sel = current();
        const p = { id: newId(), name: String(name).slice(0, 60), steady: sel.steady, hits: sel.hits };
        st.presets.push(p);
        st.active = p.id; st.working = null; changed(); save();
        return p;
    }
    function saveActive() {
        const p = presetOf(st.active);
        if (!p || p.builtin) return false;
        const sel = current();
        p.steady = sel.steady; p.hits = sel.hits;
        st.working = null; changed(); save();
        return true;
    }
    function rename(id, name) {
        const p = st.presets.find(x => x.id === id);
        if (p) { p.name = String(name).slice(0, 60); save(); }
    }
    function remove(id) {
        st.presets = st.presets.filter(p => p.id !== id);
        if (st.active === id) { st.active = 'default'; st.working = null; }
        changed(); save();
    }
    const discard = () => { st.working = null; changed(); save(); };
    const resetToDefault = () => { st.active = 'default'; st.working = null; changed(); save(); };

    const FILE_TYPE = 'lights-auto-sequencer-effect-choices';
    function exportData(id = st.active) {
        const p = presetOf(id);
        const sel = id === st.active ? current() : selOf(p);
        return { type: FILE_TYPE, version: 1, name: p ? p.name : 'My effect choices', steady: sel.steady, hits: sel.hits };
    }
    function importData(data) {
        if (!data || (data.type && data.type !== FILE_TYPE) || (!data.steady && !data.hits)) throw new Error('This file is not a set of effect choices.');
        const sel = fill(data);
        let name = String(data.name || 'Imported').slice(0, 60);
        const names = new Set(BUILTIN.map(b => b.name).concat(st.presets.map(p => p.name)));
        if (names.has(name)) { let i = 2; while (names.has(`${name} (${i})`)) i++; name = `${name} (${i})`; }
        const p = { id: newId(), name, steady: sel.steady, hits: sel.hits };
        st.presets.push(p);
        st.active = p.id; st.working = null; changed(); save();
        return p;
    }

    // ---------- for ideas ----------

    // Weights for one kind of prop: { effectId: weight } with only the ones in use.
    function weights(part, cls, sel = current()) {
        const t = (sel[part] && (sel[part][cls] || sel[part].generic)) || {};
        const out = {};
        for (const [k, v] of Object.entries(t)) if (v > 0) out[k] = v;
        return out;
    }
    const allowed = (part, cls, id, sel = current()) => ((sel[part] && (sel[part][cls] || sel[part].generic) || {})[id] || 0) > 0;

    return {
        CLASSES, BUILTIN, current, weights, allowed, setWeight, edit, choose, saveAs, saveActive, rename, remove, discard, resetToDefault,
        exportData, importData, steadyList, hitList, handOnly, builtinDefault, fill,
        get active() { return presetOf(st.active); }, get presets() { return BUILTIN.concat(st.presets); }, dirty,
    };
})();
