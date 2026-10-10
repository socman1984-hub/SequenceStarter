'use strict';
// Profiles: learn how someone sequences from their own finished sequences.
// Each .xsq is read for which effects every prop gets, for how long, and with
// which settings; a profile (an EffectPrefs set) is then built from that for the
// kinds of prop, or single props, the user picks.
const Profiles = (() => {
    const attr = (tag, name) => { const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
    const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    // An effect shorter than this is a hit (a flash on a beat or a drum), longer is a look.
    const HIT_SEC = 1.2;

    // One sequence: { made: true when this app wrote it, effects: [{ target, name, s, e, settings, pal }] }
    function readXsq(text) {
        const out = { made: /Made with (SequenceStarter|Lights Auto Sequencer)/.test(text), effects: [] };
        const dbBlock = /<EffectDB>([\s\S]*?)<\/EffectDB>/.exec(text);
        const db = dbBlock ? [...dbBlock[1].matchAll(/<Effect>([\s\S]*?)<\/Effect>|<Effect\/>/g)].map(m => unesc(m[1] || '')) : [];
        const palBlock = /<ColorPalettes>([\s\S]*?)<\/ColorPalettes>/.exec(text);
        const pals = palBlock ? [...palBlock[1].matchAll(/<ColorPalette>([\s\S]*?)<\/ColorPalette>|<ColorPalette\/>/g)].map(m => unesc(m[1] || '')) : [];
        const ee = /<ElementEffects>([\s\S]*)<\/ElementEffects>/.exec(text);
        if (!ee) return out;
        for (const el of ee[1].matchAll(/<Element\s[^>]*type="model"[^>]*?(?<!\/)>([\s\S]*?)<\/Element>/g)) {
            const head = el[0].slice(0, el[0].indexOf('>') + 1);
            const model = unesc(attr(head, 'name') || '');
            if (!model) continue;
            // the element's own layers, submodel layers (Model/Sub), strands and nodes (the model)
            const body = el[1];
            const add = (target, chunk) => {
                for (const ef of chunk.matchAll(/<Effect\s[^>]*?\/?>/g)) {
                    const t = ef[0];
                    const name = attr(t, 'name');
                    if (!name) continue;
                    const ref = attr(t, 'ref');
                    const s = +attr(t, 'startTime') / 1000, e = +attr(t, 'endTime') / 1000;
                    if (!(e > s)) continue;
                    out.effects.push({ target, name: unesc(name), s, e, settings: ref != null ? db[+ref] || '' : '', pal: pals[+(attr(t, 'palette') || 0)] || '' });
                }
            };
            let rest = body;
            for (const sm of body.matchAll(/<SubModelEffectLayer\s[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/SubModelEffectLayer>/g)) {
                add(model + '/' + unesc(sm[1]), sm[2]);
                rest = rest.replace(sm[0], '');
            }
            add(model, rest);
        }
        return out;
    }

    // The effect here that draws an xLights effect, and its options (null: none fits).
    function effectOf(x) {
        let r;
        try { r = Effects.fromXl(x.name, x.settings, x.pal); } catch (e) { return null; }
        if (!r || !r.eff || ['glow', 'nothing'].includes(r.eff.id)) return null;
        let id = r.eff.id;
        const hit = x.e - x.s < HIT_SEC;
        // a short flash that fades out is our "flash and fade"
        if (id === 'on' && hit && (r.o.end ?? 100) < (r.o.start ?? 100)) id = 'pulse';
        const o = {};
        for (const [k, v] of Object.entries(r.o || {})) if (k !== '__curves' && k !== 'params' && v != null && typeof v !== 'object') o[k] = v;
        return { id, o, hit };
    }

    // Everything read so far, by target: { [target]: { look: {id: sec}, hit: {id: n}, opts: {id: [o...]}, seqs: Set } }
    function emptyStats() { return { targets: {}, sequences: [], skipped: [] }; }
    function addSequence(stats, fileName, text, { skipMade = true } = {}) {
        const seq = readXsq(text);
        if (seq.made && skipMade) { stats.skipped.push({ file: fileName, why: 'made with this app' }); return; }
        if (!seq.effects.length) { stats.skipped.push({ file: fileName, why: 'no effects' }); return; }
        stats.sequences.push(fileName);
        const keyOf = s => s.replace(/[^\w ]/g, '');
        for (const x of seq.effects) {
            const f = effectOf(x);
            const T = stats.targets[x.target] || (stats.targets[x.target] = { look: {}, hit: {}, opts: {}, seqs: [], unknown: {} });
            if (!T.seqs.includes(fileName)) T.seqs.push(fileName);
            if (!f) { T.unknown[x.name] = (T.unknown[x.name] || 0) + 1; continue; }
            if (f.hit) T.hit[f.id] = (T.hit[f.id] || 0) + 1;
            else T.look[f.id] = (T.look[f.id] || 0) + (x.e - x.s);
            // a few real setting combinations per effect, to reuse as looks
            const list = T.opts[f.id] || (T.opts[f.id] = []);
            if (list.length < 16 && Object.keys(f.o).length) {
                const k = keyOf(JSON.stringify(f.o));
                if (!list.some(o => keyOf(JSON.stringify(o)) === k)) list.push(f.o);
            }
        }
    }

    // What a target is: the open show says (classify), else its name does.
    function kindOf(show, target) {
        const sh = show || { groups: new Map(), models: new Map(), propTypes: {} };
        try { return Ideas.classify(sh, target); } catch (e) { return 'generic'; }
    }

    // The choices for the page: kinds of prop and single props found, with how much was read for each.
    function summary(stats, show) {
        const kinds = {}, props = [];
        for (const [t, T] of Object.entries(stats.targets)) {
            const n = Object.values(T.hit).reduce((a, b) => a + b, 0) + Object.keys(T.look).length;
            const sec = Object.values(T.look).reduce((a, b) => a + b, 0);
            if (!n) continue;
            const kind = kindOf(show, t.split('/')[0]);
            if (kind === 'face' || kind === 'skip' || kind === 'movinghead') continue;
            const k = kinds[kind] || (kinds[kind] = { kind, targets: 0, sec: 0, hits: 0, seqs: new Set() });
            k.targets++; k.sec += sec; k.hits += Object.values(T.hit).reduce((a, b) => a + b, 0);
            T.seqs.forEach(s => k.seqs.add(s));
            props.push({ name: t, kind, sec, hits: Object.values(T.hit).reduce((a, b) => a + b, 0), seqs: T.seqs.length });
        }
        props.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        return { kinds: Object.values(kinds).map(k => ({ ...k, seqs: k.seqs.size })).sort((a, b) => b.sec - a.sec), props };
    }

    // Shares (0..100) from amounts; anything under 1% is left out as noise.
    function shares(amounts, allowed) {
        const out = {};
        let tot = 0;
        for (const [k, v] of Object.entries(amounts)) if (allowed.has(k)) tot += v;
        if (!tot) return out;
        for (const [k, v] of Object.entries(amounts)) if (allowed.has(k) && Math.round(v / tot * 100) >= 1) out[k] = Math.round(v / tot * 100);
        return out;
    }

    // Build a profile set from what was read. pick: { kinds: [kind], props: [target] }.
    // Kinds of prop not picked keep the Default choices; picked single props get their own weights.
    function build(stats, show, pick, name) {
        const base = EffectPrefs.builtinDefault();
        // Off is how people black out a prop, not a look to pick
        const steadyOk = new Set(EffectPrefs.steadyList().map(e => e.id).filter(id => id !== 'off')), hitOk = new Set(EffectPrefs.hitList().map(e => e.id));
        const merge = (into, src) => { for (const [k, v] of Object.entries(src)) into[k] = (into[k] || 0) + v; };
        const byKind = {};
        for (const [t, T] of Object.entries(stats.targets)) {
            const kind = kindOf(show, t.split('/')[0]);
            const K = byKind[kind] || (byKind[kind] = { look: {}, hit: {}, opts: {} });
            merge(K.look, T.look); merge(K.hit, T.hit);
            for (const [id, list] of Object.entries(T.opts)) { const L = K.opts[id] || (K.opts[id] = []); for (const o of list) if (L.length < 16) L.push(o); }
        }
        const sel = { steady: base.steady, hits: base.hits, props: {}, looks: {} };
        const kindsDone = [], propsDone = [];
        for (const kind of pick.kinds || []) {
            const K = byKind[kind];
            if (!K || !EffectPrefs.CLASSES.includes(kind)) continue;
            const st = shares(K.look, steadyOk), ht = shares(K.hit, hitOk);
            if (Object.keys(st).length) sel.steady[kind] = Object.fromEntries(Object.keys(base.steady[kind]).map(k => [k, st[k] || 0]));
            if (Object.keys(ht).length) sel.hits[kind] = Object.fromEntries(Object.keys(base.hits[kind]).map(k => [k, ht[k] || 0]));
            sel.looks['class:' + kind] = K.opts;
            kindsDone.push(kind);
        }
        for (const t of pick.props || []) {
            const T = stats.targets[t];
            if (!T) continue;
            const st = shares(T.look, steadyOk), ht = shares(T.hit, hitOk);
            if (!Object.keys(st).length && !Object.keys(ht).length) continue;
            const kind = kindOf(show, t.split('/')[0]);
            const kc = EffectPrefs.CLASSES.includes(kind) ? kind : 'generic';
            sel.props[t] = {
                steady: Object.fromEntries(Object.keys(base.steady[kc]).map(k => [k, st[k] || 0])),
                hits: Object.fromEntries(Object.keys(base.hits[kc]).map(k => [k, ht[k] || 0])),
            };
            sel.looks['target:' + t] = T.opts;
            propsDone.push(t);
        }
        const about = { from: pick.folder || '', sequences: stats.sequences.length, kinds: kindsDone, props: propsDone, built: new Date().toISOString().slice(0, 10) };
        return EffectPrefs.saveProfile(name, sel, about);
    }

    return { readXsq, effectOf, emptyStats, addSequence, summary, build, kindOf, HIT_SEC };
})();
