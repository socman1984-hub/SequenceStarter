'use strict';
// The rest of xLights' effects. Each one writes its settings with the keys and
// defaults from xLights' own metadata (XLMeta, see tools/xlmeta.js), so xLights
// reads them exactly as if they were set in its effect panel, and draws a
// preview ported from xLights' render code (src-core/effects/<Name>Effect.cpp).
//
// Grid effects draw into the row's buffer (W x H cells, 0,0 bottom left, like
// xLights' RenderBuffer); each light then takes the cell it sits in.
(() => {
    const U = Effects.util;
    const { frac, clamp01, palPick } = U;
    const FPS = 40;

    // ---------- time ----------

    // Frame f of F, and xLights' GetEffectTimeIntervalPosition() (f / (F - 1)).
    function frameOf(p) {
        const F = Math.max(1, Math.round(p.dur * FPS));
        const f = Math.min(F - 1, Math.max(0, Math.floor(p.sec * FPS + 1e-6)));
        return { f, F, pos: F > 1 ? f / (F - 1) : 0 };
    }
    // GetEffectTimeIntervalPosition(cycles): 0..1 through each of `cycles` repeats.
    function cyclePos(fr, cycles) {
        if (fr.F <= 1) return 0;
        const per = fr.F / cycles;
        if (per <= 1) return 0;
        let r = fr.f;
        while (r >= per) r -= per;
        r /= per - 1;
        return r > 1 ? 1 : r;
    }

    // ---------- colors ----------

    // RenderBuffer::GetMultiColorBlend: n 0..1 across the palette (into c)
    function multiBlend(pal, n, circular, c) {
        const cnt = pal.length;
        if (cnt <= 1) { const a = pal[0]; c[0] = a[0]; c[1] = a[1]; c[2] = a[2]; return c; }
        if (n >= 1) n = 0.99999; if (n < 0) n = 0;
        const real = circular ? n * cnt : n * (cnt - 1);
        const i1 = Math.floor(real), i2 = (i1 + 1) % cnt, r = real - i1;
        const a = pal[i1], b = pal[i2];
        c[0] = a[0] + Math.floor(r * (b[0] - a[0]) + 0.5); c[1] = a[1] + Math.floor(r * (b[1] - a[1]) + 0.5); c[2] = a[2] + Math.floor(r * (b[2] - a[2]) + 0.5);
        return c;
    }
    function hsv2rgb(h, s, v, c) {
        h = ((h % 1) + 1) % 1;
        const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
        c[0] = r * 255; c[1] = g * 255; c[2] = b * 255;
        return c;
    }
    function rgb2hsv(c) {
        const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6; if (h < 0) h += 1;
        return [h, mx ? d / mx : 0, mx];
    }

    // ---------- random numbers that repeat for the same effect ----------

    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // ---------- the buffer ----------

    // The buffers a row draws into: one for a model or group, one per prop size
    // when a group's effect runs on each prop. idx: the lights in that buffer.
    function buffers(N) {
        if (!N.bw) return [{ W: Math.max(1, Math.round(N.tw || N.w)), H: Math.max(1, Math.round(N.th || N.h)), idx: null }];
        const m = new Map();
        for (let k = 0; k < N.n; k++) {
            const W = Math.max(1, Math.round(N.bw[k])), H = Math.max(1, Math.round(N.bh[k])), key = W + 'x' + H;
            let b = m.get(key);
            if (!b) { b = { W, H, idx: [] }; m.set(key, b); }
            b.idx.push(k);
        }
        return [...m.values()];
    }
    // Very big buffers (a whole yard "per preview") are drawn smaller.
    function capSize(W, H, max) {
        if (W * H <= max) return [W, H];
        const s = Math.sqrt(max / (W * H));
        return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))];
    }
    // Each light takes its cell's colour.
    function sample(N, out, idx, W, H, g, gain = 1) {
        const one = k => {
            const x = Math.min(W - 1, Math.round(N.u[k] * (W - 1))), y = Math.min(H - 1, Math.round(N.v[k] * (H - 1)));
            const i = 3 * (y * W + x);
            out[3 * k] = g[i] * gain; out[3 * k + 1] = g[i + 1] * gain; out[3 * k + 2] = g[i + 2] * gain;
        };
        if (idx) for (const k of idx) one(k); else for (let k = 0; k < N.n; k++) one(k);
    }

    // Grid effects. def.draw(c) paints c.g (RGB per cell, W x H, zeroed each frame
    // unless def.keep) for frame c.f of c.F; c.st is kept from frame to frame
    // (state that grows over the effect: fire, falling snow, Life), so a frame is
    // reached by drawing every frame before it from the start of the effect.
    const sims = new WeakMap();
    const LOOSE = {};
    function gridRender(def) {
        return function (p, N, out) {
            const fr = frameOf(p);
            const key0 = p.fx || LOOSE;
            let byFx = sims.get(key0);
            if (!byFx) { byFx = new Map(); sims.set(key0, byFx); }
            for (const b of buffers(N)) {
                const lights = b.idx ? b.idx.length : N.n;
                const [W, H] = capSize(b.W, b.H, Math.min(def.maxCells || (def.stateful ? 12000 : 40000), Math.max(1500, 6 * lights)));
                const key = W + 'x' + H + '|' + (p.start || 0) + '|' + p.dur;
                let s = byFx.get(key);
                const o = p.o, ok = p.fx ? p.fx.o : o;
                // a simulation asked for a frame just before the one it is on shows that one
                // (re-running it from the start for a small step back is far too slow)
                if (s && s.o === ok && def.stateful && fr.f < s.f && s.f - fr.f <= 12) { sample(N, out, b.idx, W, H, s.g); continue; }
                if (!s || s.o !== ok || fr.f < s.f || (!def.stateful && fr.f !== s.f)) {
                    if (!s || s.o !== ok || fr.f < s.f || def.stateful) {
                        s = { f: -1, o: ok, g: new Float32Array(W * H * 3), st: {}, rnd: rng(((p.start || 0) * 1000 | 0) ^ (W * 7919 + H * 104729) ^ 0x9e3779b9) };
                        byFx.set(key, s);
                        if (byFx.size > 24) byFx.delete(byFx.keys().next().value);
                    }
                }
                if (s.f !== fr.f) {
                    const from = def.stateful ? s.f + 1 : fr.f;
                    for (let f = from; f <= fr.f; f++) {
                        if (!def.keep) s.g.fill(0);
                        def.draw({ p, o, W, H, g: s.g, st: s.st, f, F: fr.F, pos: fr.F > 1 ? f / (fr.F - 1) : 0, fr: { f, F: fr.F }, rnd: s.rnd, pal: p.pal, first: f === 0, drawn: f === fr.f });
                    }
                    s.f = fr.f;
                }
                sample(N, out, b.idx, W, H, s.g);
            }
        };
    }
    const setPx = (g, W, H, x, y, c, b = 1) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = 3 * (y * W + x);
        g[i] = c[0] * b; g[i + 1] = c[1] * b; g[i + 2] = c[2] * b;
    };

    // ---------- settings from xLights' metadata ----------

    const fmt = (m, v) => {
        switch (m.k) {
            case 'b': return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
            case 'i': return Math.round(+v || 0);
            case 'f': return m.raw ? Math.round((+v || 0) * m.div) : (+v || 0).toFixed(m.div >= 100 ? 2 : 1);
            default: return String(v ?? '').replace(/,/g, '&comma;');
        }
    };
    // def: { id, label, xl, use, cat, show: [metadata ids the row editor shows],
    //   defaults: {id: value} (our starting values), fixed: {id: value} (always written),
    //   skip: [ids never written], legacy: {id: {before: version, write: v => [key, value]}},
    //   curves: o => [[settingName, curve]] value curves, extra: (o, ctx) => ['KEY=value'],
    //   render, rand(R, ctx) }
    function metaFx(def) {
        const props = (typeof XLMeta !== 'undefined' && XLMeta[def.metaName || def.xl]) || [];
        const byId = new Map(props.map(m => [m.id, m]));
        const options = {}, choices = {}, labels = {}, kinds = {}, tips = {}, ranges = {};
        for (const id of def.show || []) {
            const m = byId.get(id);
            if (!m) { options[id] = def.defaults ? def.defaults[id] : 0; continue; }
            options[id] = def.defaults && id in def.defaults ? def.defaults[id] : m.k === 'b' ? (m.d ? 1 : 0) : m.d;
            if (m.k === 'e') choices[id] = m.o;
            labels[id] = (def.labels && def.labels[id]) || m.l;
            kinds[id] = m.k;
            if (m.t) tips[id] = m.t;
            ranges[id] = [m.min, m.max];
        }
        for (const [k, v] of Object.entries(def.choices || {})) choices[k] = v;
        for (const [k, v] of Object.entries(def.labels || {})) labels[k] = v;
        for (const k of Object.keys(def.defaults || {})) if (!(k in options) && (def.extraOptions || []).includes(k)) options[k] = def.defaults[k];
        const value = (m, o) => (o && m.id in o ? o[m.id] : def.fixed && m.id in def.fixed ? def.fixed[m.id] : def.defaults && m.id in def.defaults ? def.defaults[m.id] : m.d);
        const settings = (o, ctx) => {
            const parts = [];
            const curved = new Set();
            const cs = def.curves ? def.curves(o, ctx) : [];
            for (const [name, c] of cs) { parts.push(Effects.curveString('E', name, c)); curved.add(name); }
            for (const m of props) {
                if ((def.skip && def.skip.includes(m.id)) || curved.has(m.id)) continue;
                const v = value(m, o);
                if ((m.k === 's' || m.dyn) && (v == null || v === '')) continue;
                if (m.dyn && !(o && m.id in o) && !(def.fixed && m.id in def.fixed)) continue;
                const leg = def.legacy && def.legacy[m.id];
                if (leg && (!ctx || !ctx.version || Effects.versionOlder(ctx.version, leg.before))) { const [k, val] = leg.write(v); parts.push(`${k}=${val}`); continue; }
                parts.push(`${m.key}=${fmt(m, v)}`);
            }
            if (def.extra) parts.push(...def.extra(o, ctx));
            return parts.join(',');
        };
        const e = {
            use: ['part'], ...def, meta: def.metaName || def.xl, options, choices, labels, kinds, tips, ranges, settings,
        };
        if (def.grid) e.render = gridRender(def.grid);
        return Effects.add(e);
    }

    // Value curve helpers (min/max are the setting's own range).
    const ramp = (min, max, a, b) => ({ type: 'Ramp', min, max, p1: a, p2: b });
    const upDown = (min, max, a, b, c) => ({ type: 'Ramp Up/Down', min, max, p1: a, p2: b, p3: c });

    // =====================================================================
    // Plasma (PlasmaEffect + PlasmaFunctions.ispc, normal colours)
    // =====================================================================
    metaFx({
        id: 'plasma', label: 'Plasma (flowing color)', xl: 'Plasma', cat: 'fill', use: ['part'], mood: 'calm',
        show: ['Plasma_Style', 'Plasma_Line_Density', 'Plasma_Speed'],
        defaults: { Plasma_Color: 'Normal' },
        labels: { Plasma_Style: 'Swirl', Plasma_Line_Density: 'Lines', Plasma_Speed: 'Speed' },
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H;
                const style = +o.Plasma_Style || 1, dens = +o.Plasma_Line_Density || 1, speed = +o.Plasma_Speed || 10;
                const time = (c.f + 1) / ((101 - speed) * 3);
                const s5 = Math.sin(time / 5), c3 = Math.cos(time / 3), s2 = Math.sin(time / 2);
                const col = [0, 0, 0];
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const rx = W > 1 ? x / (W - 1) : 0, ry = H > 1 ? y / (H - 1) : 0;
                    const cx = rx + 0.5 * s5, cy = ry + 0.5 * c3;
                    let v = Math.sin(rx * 10 + time);
                    v += Math.sin(10 * (rx * s2 + ry * c3) + time);
                    v += Math.sin(Math.sqrt(style * 50 * (cx * cx + cy * cy) + time));
                    v += Math.sin(rx + time);
                    v += Math.sin((ry + time) / 2);
                    v += Math.sin((rx + ry + time) / 2);
                    v += Math.sin(Math.sqrt(rx * rx + ry * ry) + time);
                    v /= 2;
                    const vl = v * dens * Math.PI;
                    const h = (Math.sin(vl + 2 * Math.PI / 3) + 1) * 0.5;
                    multiBlend(c.pal, h, false, col);
                    setPx(c.g, W, H, x, y, col);
                }
            },
        },
        rand: (R, c) => ({ Plasma_Style: R.ibetween(1, 6), Plasma_Line_Density: R.ibetween(1, 3), Plasma_Speed: Math.max(1, Math.min(90, Math.round(R.between(5, 25) * c.fast))) }),
    });

    // =====================================================================
    // Shimmer (ShimmerEffect): the whole prop flashes on and off
    // =====================================================================
    metaFx({
        id: 'shimmer', label: 'Shimmer (flash on and off)', xl: 'Shimmer', cat: 'nature', use: ['part', 'hit'], mood: 'busy',
        show: ['Shimmer_Duty_Factor', 'Shimmer_Cycles', 'Shimmer_Use_All_Colors'],
        labels: { Shimmer_Duty_Factor: 'On time %', Shimmer_Cycles: 'Flashes', Shimmer_Use_All_Colors: 'Mixed colors (0/1)' },
        render(p, N, out) {
            const o = p.o, fr = frameOf(p), n = p.pal.length;
            const duty = +o.Shimmer_Duty_Factor, cycles = Math.max(0.1, +o.Shimmer_Cycles || 1);
            let ci;
            if (cycles > (fr.F - 1) / 2) {
                ci = fr.f % (2 * n);
                if (ci % 2) return;
                ci /= 2;
            } else {
                let pos = cyclePos(fr, cycles);
                if (pos > 1) pos = 0;
                if (pos >= duty / 100) return;
                ci = Math.floor(fr.f * cycles / Math.max(1, fr.F - 1)) % n;
            }
            const all = +o.Shimmer_Use_All_Colors;
            for (let k = 0; k < N.n; k++) palPick(p.pal, all ? Math.floor(U.hash(N.seed[k] ^ (fr.f * 2654435761)) * n) : ci, out, 3 * k);
        },
        rand: (R, c) => ({ Shimmer_Duty_Factor: R.ibetween(30, 60), Shimmer_Cycles: c.hit ? R.pick([2, 3, 4]) : Math.max(2, Math.round(c.bars * R.pick([2, 4]) * c.fast)), Shimmer_Use_All_Colors: R.chance(0.3) ? 1 : 0 }),
    });

    // =====================================================================
    // Garlands (GarlandsEffect): swags of light stacking up
    // =====================================================================
    const GARLAND_DIRS = ['Up', 'Down', 'Left', 'Right', 'Up then Down', 'Down then Up', 'Left then Right', 'Right then Left'];
    function garlandOff(type, x) {
        let m;
        switch (type) {
            case 1: m = x % 5; return m === 2 ? 2 : m === 1 || m === 3 ? 1 : 0;
            case 2: m = x % 5; return m === 2 ? 4 : m === 1 || m === 3 ? 2 : 0;
            case 3: m = x % 6; return m === 3 ? 6 : m === 2 || m === 4 ? 4 : m === 1 || m === 5 ? 2 : 0;
            case 4: m = x % 5; return m === 1 || m === 3 ? 2 : 0;
        }
        return 0;
    }
    metaFx({
        id: 'garlands', label: 'Garlands (swags stacking up)', xl: 'Garlands', cat: 'move', use: ['part'],
        show: ['Garlands_Type', 'Garlands_Spacing', 'Garlands_Cycles', 'Garlands_Direction'],
        labels: { Garlands_Type: 'Swag shape (0-4)', Garlands_Spacing: 'Spacing', Garlands_Cycles: 'Times', Garlands_Direction: 'Direction' },
        legacy: { Garlands_Cycles: { before: '2026.05.2', write: v => ['E_SLIDER_Garlands_Cycles', Math.round(+v || 1)] } },
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H;
                const type = Math.round(+o.Garlands_Type || 0), spacing = Math.max(1, +o.Garlands_Spacing || 10), cycles = Math.max(0.1, +o.Garlands_Cycles || 1);
                let dir = Math.max(0, GARLAND_DIRS.indexOf(o.Garlands_Direction));
                let pos = cyclePos(c.fr, cycles);
                if (dir > 3) { dir -= 4; pos = pos > 0.5 ? (1 - pos) * 2 : pos * 2; }
                const max = dir > 1 ? W : H, wid = dir > 1 ? H : W;
                let ps = spacing * max / 100;
                if (ps < 2) ps = 2;
                const off = (max * ps - max + 1) * pos;
                const col = [0, 0, 0];
                for (let r = 0; r < max; r++) {
                    multiBlend(c.pal, (max - r - 1) / max, false, col);
                    const yb = Math.trunc(1 + r * ps - off);
                    for (let x = 0; x < wid; x++) {
                        let v = yb - garlandOff(type, x);
                        if (v < r) v = r;
                        if (v < 0 || v >= max) continue;
                        if (dir <= 1) setPx(c.g, W, H, x, dir === 0 ? v : max - v - 1, col);
                        else setPx(c.g, W, H, dir === 2 ? max - v - 1 : v, x, col);
                    }
                }
            },
        },
        rand: (R, c) => ({ Garlands_Type: R.ibetween(0, 4), Garlands_Spacing: R.ibetween(5, 20), Garlands_Cycles: Math.max(1, Math.round(c.bars / R.pick([2, 4]) * c.fast)), Garlands_Direction: R.weighted({ Up: 4, Down: 2, 'Up then Down': 2, Left: 1, Right: 1 }) }),
    });

    // =====================================================================
    // Fill (FillEffect): the prop fills with colour from one side
    // =====================================================================
    const FILL_MOVES = { 'fills up': [0, 100], 'empties': [100, 0], 'fills then empties': [0, 100, 0], 'stays full': null };
    function fillLut(o, W, H, pos01, pal) {
        const dir = ['Up', 'Down', 'Left', 'Right'].indexOf(o.Fill_Direction);
        const vert = dir <= 0 || dir === 1;
        const dim = vert ? H : W;
        const m = FILL_MOVES[o.move];
        const position = m ? (m.length === 2 ? m[0] + (m[1] - m[0]) * pos01 : pos01 < 0.5 ? 100 * pos01 * 2 : 100 * (1 - pos01) * 2) : 100;
        const pct = Math.round(position) / 100;
        const band = Math.max(0, Math.round(+o.Fill_Band_Size || 0)), skip = Math.max(0, Math.round(+o.Fill_Skip_Size || 0)), size = band + skip;
        const byTime = +o.Fill_Color_Time;
        let offset = 0;
        const lut = new Array(dim).fill(null);
        const cnt = pal.length;
        const fromPos = (pp) => { const cv = pp * (cnt - 1), ci = Math.floor(cv), c2 = Math.min(ci + 1, cnt - 1); if (ci < c2) { const r = Math.min(cv - ci, 1), a = pal[ci], b = pal[c2]; return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r]; } return pal[c2]; };
        const timeCol = band === 0 ? fromPos(pos01) : null;
        const lineCol = (k, pp) => !byTime ? fromPos(pp) : band > 0 ? (k % size < band ? pal[Math.floor(k / size) % cnt] : [0, 0, 0]) : timeCol;
        const fwd = dir === 0 || dir === 3 || dir < 0;
        const target = Math.trunc(fwd ? dim * pct + offset : dim * (1 - pct) - offset);
        let k = 0;
        if (fwd) for (let i = offset; i < target; i++, k++) lut[i % dim] = lineCol(k, dim + offset - 1 ? i / (dim + offset - 1) : 0);
        else for (let i = dim - 1 - offset; i >= target; i--, k++) lut[(i + dim) % dim] = lineCol(k, dim + offset - 1 ? 1 - i / (dim + offset - 1) : 1);
        return { lut, vert };
    }
    metaFx({
        id: 'fill', label: 'Fill (fills up with color)', xl: 'Fill', cat: 'move', use: ['part', 'hit'],
        show: ['Fill_Direction', 'move', 'Fill_Band_Size', 'Fill_Skip_Size', 'Fill_Color_Time'],
        extraOptions: ['move'],
        defaults: { move: 'fills up', Fill_Wrap: true },
        choices: { move: Object.keys(FILL_MOVES) },
        labels: { Fill_Direction: 'From', move: 'Moves', Fill_Band_Size: 'Band size', Fill_Skip_Size: 'Gap size', Fill_Color_Time: 'Bands (0/1)' },
        curves: o => { const m = FILL_MOVES[o.move]; return m ? [['Fill_Position', m.length === 2 ? ramp(0, 100, m[0], m[1]) : upDown(0, 100, 0, 100, 0)]] : []; },
        render(p, N, out) {
            const fr = frameOf(p);
            for (const b of buffers(N)) {
                const { lut, vert } = fillLut(p.o, b.W, b.H, fr.pos, p.pal);
                const one = k => {
                    const i = vert ? Math.min(b.H - 1, Math.round(N.v[k] * (b.H - 1))) : Math.min(b.W - 1, Math.round(N.u[k] * (b.W - 1)));
                    const c = lut[i];
                    if (c) { out[3 * k] = c[0]; out[3 * k + 1] = c[1]; out[3 * k + 2] = c[2]; }
                };
                if (b.idx) b.idx.forEach(one); else for (let k = 0; k < N.n; k++) one(k);
            }
        },
        rand: (R, c) => ({ Fill_Direction: R.weighted({ Up: 5, Down: 2, Left: 1, Right: 1 }), move: c.hit ? 'fills up' : R.weighted({ 'fills up': 4, 'fills then empties': 2, empties: 1 }), Fill_Band_Size: R.chance(0.3) ? R.ibetween(1, 3) : 0, Fill_Skip_Size: 0, Fill_Color_Time: 0 }),
    });

    // ---------- drawing (RenderBuffer's primitives) ----------

    function drawLine(g, W, H, x0, y0, x1, y1, c, b = 1) {
        x0 = Math.trunc(x0); y0 = Math.trunc(y0); x1 = Math.trunc(x1); y1 = Math.trunc(y1);
        if ((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 >= W && x1 >= W) || (y0 >= H && y1 >= H)) return;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = Math.trunc((dx > dy ? dx : -dy) / 2);
        for (let n = 0; n < 100000; n++) {
            setPx(g, W, H, x0, y0, c, b);
            if (x0 === x1 && y0 === y1) break;
            const e2 = err;
            if (e2 > -dx) { err -= dy; x0 += sx; }
            if (e2 < dy) { err += dx; y0 += sy; }
        }
    }
    function vline(g, W, H, x, y0, y1, c, b) { if (y0 > y1) [y0, y1] = [y1, y0]; for (let y = y0; y <= y1; y++) setPx(g, W, H, x, y, c, b); }
    function drawCircle(g, W, H, x0, y0, r, c, filled, b = 1) {
        let x = r, y = 0, err = 1 - x;
        while (x >= y) {
            if (!filled) for (const [a, d] of [[x, y], [y, x], [-x, y], [-y, x], [-x, -y], [-y, -x], [x, -y], [y, -x]]) setPx(g, W, H, a + x0, d + y0, c, b);
            else { vline(g, W, H, x0 - x, y0 - y, y0 + y, c, b); vline(g, W, H, x0 + x, y0 - y, y0 + y, c, b); vline(g, W, H, x0 - y, y0 - x, y0 + x, c, b); vline(g, W, H, x0 + y, y0 - x, y0 + x, c, b); }
            y++;
            if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x + 1); }
        }
    }
    function drawThickLine(g, W, H, x1, y1, x2, y2, c, th, b = 1) {
        x1 = Math.trunc(x1); y1 = Math.trunc(y1); x2 = Math.trunc(x2); y2 = Math.trunc(y2);
        if (th < 1) return;
        if (th === 1) { drawLine(g, W, H, x1, y1, x2, y2, c, b); return; }
        drawCircle(g, W, H, x1, y1, Math.trunc(th / 2), c, true, b);
        drawCircle(g, W, H, x2, y2, Math.trunc(th / 2), c, true, b);
        for (let i = 0; i < th; i++) {
            const a = i - Math.trunc(th / 2);
            drawLine(g, W, H, x1 + a, y1, x2 + a, y2, c, b);
            drawLine(g, W, H, x1, y1 + a, x2, y2 + a, c, b);
            drawLine(g, W, H, x1 + a, y1 + a, x2 + a, y2 + a, c, b);
        }
    }
    // xlColor = HSVValue: a colour at another brightness (v 0..1)
    const atValue = (c, v, out = [0, 0, 0]) => { const [h, s] = rgb2hsv(c); return hsv2rgb(h, s, v, out); };

    // =====================================================================
    // Tree (TreeEffect): a tree outline with garland lights filling in
    // =====================================================================
    metaFx({
        id: 'tree', label: 'Tree (branches with lights)', xl: 'Tree', cat: 'move', use: ['part'],
        show: ['Tree_Branches', 'Tree_Speed', 'Tree_ShowLights'],
        labels: { Tree_Branches: 'Branches', Tree_Speed: 'Speed', Tree_ShowLights: 'Garland lights (0/1)' },
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H;
                const branches = Math.max(1, Math.round(+o.Tree_Branches || 1)), speed = +o.Tree_Speed || 10;
                const st = Math.trunc(c.f * speed * 25 / 50);
                const ppb = Math.max(1, Math.trunc(0.5 + H / branches));
                const maxFrame = (branches + 1) * W;
                const frame = st > 0 && maxFrame > 0 ? Math.trunc(st / 4) % maxFrame : 1;
                const b = Math.trunc(st / W) % branches, fmod = Math.trunc(st / 4) % W, odd = b % 2;
                const bg = [], lights = [];
                for (let m = 1; m <= ppb; m++) bg.push(atValue(c.pal[0], 1 - (m / ppb) * 0.7));
                for (let r = 0; r < 5; r++) lights.push(hsv2rgb(r / 4, 1, 1, [0, 0, 0]));
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    let mod = y % ppb; if (mod === 0) mod = ppb;
                    let col = bg[mod - 1];
                    if (+o.Tree_ShowLights) {
                        const branch = Math.trunc((y - 1) / ppb), row = ppb - mod;
                        let m = x % 6; if (m === 0) m = 6;
                        if (branch <= b && x <= frame && ((row === 3 && (m === 1 || m === 6)) || (row === 2 && (m === 2 || m === 5)) || (row === 1 && (m === 3 || m === 4)))) {
                            if ((odd === 0 && x <= fmod) || (odd === 1 && W - x + 1 <= fmod)) col = lights[Math.max(0, branch % 5)];
                        }
                    }
                    setPx(c.g, W, H, x, y, col);
                }
            },
        },
        rand: R => ({ Tree_Branches: R.ibetween(2, 6), Tree_Speed: R.ibetween(5, 15), Tree_ShowLights: R.chance(0.8) ? 1 : 0 }),
    });

    // =====================================================================
    // Life (LifeEffect): Conway's game of life in the palette's colours
    // =====================================================================
    const LIFE = [
        (live, n) => live ? n >= 2 && n <= 3 : n === 3,
        (live, n) => live ? n === 2 || n === 3 || n === 6 : n === 3 || n === 5,
        (live, n) => live ? n === 1 || n === 3 || n === 5 || n === 8 : n === 3 || n === 5 || n === 7,
        (live, n) => live ? n === 2 || n === 3 || n >= 5 : n === 3 || n === 7 || n === 8,
        (live, n) => live ? n >= 5 : n === 2 || n >= 5,
    ];
    metaFx({
        id: 'life', label: 'Life (cells growing and dying)', xl: 'Life', cat: 'nature', use: ['part'],
        show: ['Life_Count', 'Life_Seed', 'Life_Speed'],
        labels: { Life_Count: 'Cells at the start %', Life_Seed: 'Rules (0-4)', Life_Speed: 'Speed' },
        grid: {
            maxCells: 4000,
            stateful: true, keep: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, g = c.g;
                const type = Math.max(0, Math.min(4, Math.round(+o.Life_Seed || 0))), speed = +o.Life_Speed || 10;
                if (c.first) {
                    g.fill(0);
                    const n = Math.trunc(W * H * (+o.Life_Count || 50) / 200) + 1;
                    const col = [0, 0, 0];
                    for (let i = 0; i < n; i++) {
                        const x = Math.floor(c.rnd() * W), y = Math.floor(c.rnd() * H);
                        multiBlend(c.pal, c.rnd(), false, col);
                        setPx(g, W, H, x, y, col);
                    }
                    st.last = -1;
                }
                const ts = Math.trunc(Math.trunc(c.f * speed * 25 / 50) % 400 / 20);
                if (ts === st.last) return;
                st.last = ts;
                if (c.first) return;
                const prev = g.slice(), live = i => prev[i] + prev[i + 1] + prev[i + 2] > 0, col = [0, 0, 0];
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    let n = 0;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const xx = (x + dx + W) % W, yy = (y + dy + H) % H; if (live(3 * (yy * W + xx))) n++; }
                    const i = 3 * (y * W + x), l = live(i);
                    if (LIFE[type](l, n)) { if (!l) { multiBlend(c.pal, c.rnd(), false, col); g[i] = col[0]; g[i + 1] = col[1]; g[i + 2] = col[2]; } }
                    else g[i] = g[i + 1] = g[i + 2] = 0;
                }
            },
        },
        rand: R => ({ Life_Count: R.ibetween(30, 70), Life_Seed: R.pick([0, 0, 0, 1, 1, 3]), Life_Speed: R.ibetween(8, 20) }),
    });

    // =====================================================================
    // Lightning (LightningEffect): a jagged bolt, redrawn every frame
    // =====================================================================
    metaFx({
        id: 'lightning', label: 'Lightning (bolts)', xl: 'Lightning', cat: 'nature', use: ['part', 'hit'], mood: 'busy',
        show: ['Lightning_Direction', 'Number_Bolts', 'Number_Segments', 'ForkedLightning', 'Lightning_WIDTH', 'Lightning_TopX', 'Lightning_BOTX'],
        defaults: { Lightning_Direction: 'Down' },
        labels: { Lightning_Direction: 'Strikes', Number_Bolts: 'Bolt length', Number_Segments: 'Jaggedness', ForkedLightning: 'Forked (0/1)', Lightning_WIDTH: 'Width', Lightning_TopX: 'Start left/right', Lightning_BOTX: 'Drift' },
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H;
                const bolts = Math.max(1, Math.min(50, Math.round(+o.Number_Bolts || 10))), segs = Math.max(1, Math.min(20, Math.round(+o.Number_Segments || 5)));
                const fork = +o.ForkedLightning, topX = Math.round(+o.Lightning_TopX || 0), topY = 0, botX = Math.round(+o.Lightning_BOTX || 0);
                const width = Math.max(1, Math.min(7, Math.round(+o.Lightning_WIDTH || 1)));
                const down = o.Lightning_Direction !== 'Up';
                const st = c.f, xc = Math.trunc(W / 2), step = Math.trunc(H / bolts);
                let seg = (st % bolts) * 4;
                if (seg > bolts) seg = bolts;
                if (st > bolts) seg = bolts;
                const col = c.pal[0];
                let x1 = xc + topX, y1 = down ? H - topY : topY;
                const xo = Math.trunc(st * botX / 10);
                const r = rng(c.f * 2654435761 ^ ((c.p.start || 0) * 1000 | 0));
                const bolt = (ax, ay, bx, by) => {
                    const dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1, dy = Math.abs(by - ay), sy = ay < by ? 1 : -1;
                    let err = Math.trunc((dx > dy ? dx : -dy) / 2);
                    for (let n = 0; n < 10000; n++) {
                        for (let x = ax - width; x <= ax + width; x++) setPx(c.g, W, H, x, ay, col);
                        if (ax === bx && ay === by) break;
                        const e2 = err;
                        if (e2 > -dx) { err -= dy; ax += sx; }
                        if (e2 < dy) { err += dx; ay += sy; }
                    }
                };
                for (let i = 0; i <= seg; i++) {
                    const j = Math.floor(r() * 32767) + 1;
                    const x2 = i % 2 === 0 ? (r() < 0.5 ? xc + topX - (j % segs) : xc + topX + 2 * (j % segs)) : (r() < 0.5 ? xc + topX + (j % segs) : xc + topX - 3 * (j % segs));
                    const y2 = down ? H - i * step - topY : i * step + topY;
                    bolt(x1 + xo, y1, x2 + xo, y2);
                    if (fork && i > seg / 2) {
                        const x3 = i % 2 === 1 ? (r() < 0.5 ? xc + topX - (j % segs) : xc + topX + 2 * (j % segs)) : (r() < 0.5 ? xc + topX + (j % segs) : xc + topX - 3 * (j % segs));
                        bolt(x1 + xo, y1, x3 + xo, y2);
                    }
                    x1 = x2; y1 = y2;
                }
            },
        },
        rand: R => ({ Lightning_Direction: 'Down', Number_Bolts: R.ibetween(8, 20), Number_Segments: R.ibetween(3, 8), ForkedLightning: R.chance(0.5) ? 1 : 0, Lightning_WIDTH: R.ibetween(1, 2), Lightning_TopX: 0, Lightning_BOTX: 0 }),
    });

    // =====================================================================
    // Lines (LinesEffect): shapes of straight lines bouncing round the prop
    // =====================================================================
    metaFx({
        id: 'lines', label: 'Lines (bouncing shapes)', xl: 'Lines', cat: 'shape', use: ['part'],
        show: ['Lines_Objects', 'Lines_Segments', 'Lines_Thickness', 'Lines_Speed', 'Lines_Trails', 'Lines_FadeTrails'],
        labels: { Lines_Objects: 'Shapes', Lines_Segments: 'Corners', Lines_Thickness: 'Thickness', Lines_Speed: 'Speed', Lines_Trails: 'Trails', Lines_FadeTrails: 'Fading trails (0/1)' },
        legacy: { Lines_Speed: { before: '2026.07', write: v => ['E_SLIDER_Lines_Speed', Math.max(1, Math.round(+v || 1))] } },
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st;
                const objs = Math.max(1, Math.round(+o.Lines_Objects || 2)), pts = Math.max(2, Math.round(+o.Lines_Segments || 3));
                const speed = Math.max(1, Math.round(+o.Lines_Speed || 1)), trails = Math.max(0, Math.round(+o.Lines_Trails || 0)), th = Math.max(1, Math.round(+o.Lines_Thickness || 1));
                if (!st.lines) st.lines = [];
                while (st.lines.length > objs) st.lines.pop();
                while (st.lines.length < objs) { const t = []; for (let i = 0; i < pts; i++) t.push({ x: c.rnd() * W, y: c.rnd() * H, a: c.rnd() * Math.PI * 2 }); st.lines.push([t]); }
                for (const L of st.lines) {
                    while (L.length > trails + 1) L.pop();
                    const last = L[L.length - 1].map(q => ({ ...q }));
                    for (const t of L) for (const q of t) {
                        let x = q.x + Math.cos(q.a) * speed, y = q.y + Math.sin(q.a) * speed;
                        if (x < 0) { x = Math.abs(x); q.a = Math.PI * 3 - q.a; if (q.a >= Math.PI * 2) q.a -= Math.PI * 2; }
                        if (x >= W) { x = 2 * W - x; q.a = Math.PI * 3 - q.a; if (q.a >= Math.PI * 2) q.a -= Math.PI * 2; }
                        if (y < 0) { y = Math.abs(y); q.a = Math.PI * 2 - q.a; }
                        if (y >= H) { y = 2 * H - y; q.a = Math.PI * 2 - q.a; }
                        q.x = x; q.y = y;
                    }
                    if (L.length < trails + 1) L.push(last);
                }
                if (!c.drawn) return;
                c.g.fill(0);
                st.lines.forEach((L, li) => {
                    const col = c.pal[li % c.pal.length];
                    L.slice().reverse().forEach((t, i) => {
                        const b = +o.Lines_FadeTrails && trails > 0 ? (i + 1) / L.length : 1;
                        drawThickLine(c.g, W, H, t[0].x, t[0].y, t[t.length - 1].x, t[t.length - 1].y, col, th, b);
                        for (let k = 1; k < t.length; k++) drawThickLine(c.g, W, H, t[k - 1].x, t[k - 1].y, t[k].x, t[k].y, col, th, b);
                    });
                });
            },
        },
        rand: (R, c) => ({ Lines_Objects: R.ibetween(1, 3), Lines_Segments: R.ibetween(2, 5), Lines_Thickness: R.ibetween(1, 2), Lines_Speed: Math.max(1, Math.min(10, Math.round(R.between(1, 3) * c.fast))), Lines_Trails: R.pick([0, 0, 1, 2]), Lines_FadeTrails: 1 }),
    });

    // =====================================================================
    // Fire (FireEffect, the classic method every xLights version draws)
    // =====================================================================
    // 100 reds black -> red, then 100 hues red -> yellow
    const FIRE_PAL = [];
    for (let i = 0; i < 100; i++) FIRE_PAL.push([i / 100 * 255, 0, 0, 0, 1, i / 100]);
    for (let i = 0; i < 100; i++) { const h = i * 0.00166666; FIRE_PAL.push([...hsv2rgb(h, 1, 1, [0, 0, 0]), h, 1, 1]); }
    const FIRE_LOCS = ['Bottom', 'Top', 'Left', 'Right'];
    metaFx({
        id: 'fire', label: 'Fire (flames)', xl: 'Fire', cat: 'nature', use: ['part'],
        show: ['Fire_Location', 'Fire_Height', 'Fire_HueShift', 'Fire_GrowthCycles'],
        fixed: { Fire_Style: 'Old Render Method' },
        labels: { Fire_Location: 'Burns from', Fire_Height: 'Height %', Fire_HueShift: 'Color shift (0 = red/yellow)', Fire_GrowthCycles: 'Grows and shrinks (times)' },
        grid: {
            maxCells: 12000,
            draw(c) {
                const o = c.o;
                const loc = Math.max(0, FIRE_LOCS.indexOf(o.Fire_Location));
                let hp = Math.round(+o.Fire_Height || 50);
                const cyc = +o.Fire_GrowthCycles || 0;
                if (cyc > 0) { let a = cyclePos(c.fr, cyc); a = 0.5 - Math.abs(a - 0.5); hp += a * 100; }
                if (hp < 1) hp = 1;
                let cw = c.W, ch = c.H;
                if (loc >= 2) [cw, ch] = [ch, cw];
                ch = Math.max(1, ch);
                const step = Math.max(1, Math.trunc(255 * 100 / ch / hp));
                const shift = Math.round(+o.Fire_HueShift || 0);
                const lut = FIRE_PAL.map(e => shift > 0 ? hsv2rgb(Math.min(1, e[3] + shift / 100), e[4], e[5], [0, 0, 0]) : e);
                const F = c.st.fire && c.st.fire.length === cw * ch ? c.st.fire : (c.st.fire = new Int16Array(cw * ch));
                const get = (x, y) => (x >= 0 && x < cw && y >= 0 && y < ch ? F[y * cw + x] : -1);
                for (let x = 0; x < cw; x++) F[x] = 150 + Math.floor(c.rnd() * 50);
                let zero = 0;
                for (let y = 1; y < ch; y++) {
                    let all0 = true;
                    for (let x = 0; x < cw; x++) {
                        let n = 0, sum = 0;
                        for (const v of [get(x - 1, y - 1), get(x, y - 1), get(x + 1, y - 1), get(x, y - 2)]) if (v >= 0) { sum += v; n++; }
                        let ni = n ? Math.trunc(sum / n) : 0;
                        if (ni > 0) { ni += c.rnd() < 0.2 ? step : -step; if (ni < 0) ni = 0; if (ni >= 200) ni = 199; }
                        F[y * cw + x] = ni;
                        if (ni) all0 = false;
                    }
                    zero = all0 ? zero + 1 : 0;
                    if (zero === 2) { F.fill(0, (y + 1) * cw); break; }
                }
                for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
                    let xp = x, yp = y;
                    if (loc === 1 || loc === 3) yp = ch - y - 1;
                    if (loc >= 2) [xp, yp] = [yp, xp];
                    setPx(c.g, c.W, c.H, xp, yp, lut[Math.max(0, F[y * cw + x])]);
                }
            },
        },
        rand: R => ({ Fire_Location: 'Bottom', Fire_Height: R.ibetween(40, 80), Fire_HueShift: R.pick([0, 0, 0, 0, 10, 50]), Fire_GrowthCycles: R.pick([0, 0, 1, 2]) }),
    });

    // =====================================================================
    // Candle (CandleEffect): a flickering flame, the whole prop or every light
    // =====================================================================
    function candleUpdate(r, s, flameK, primeK, o) {
        if (Math.floor(r() * 255) < o.var) s.wind = Math.floor(r() * 255);
        if (s.wind > o.base) s.wind--;
        if (s[flameK] < 255) s[flameK]++;
        if (Math.floor(r() * 255) < (s.wind >> o.calm)) s[flameK] = Math.floor(r() * 255);
        if (s[flameK] > s[primeK]) { if (s[primeK] < 255 - o.agil) s[primeK] += o.agil; }
        else if (s[primeK] > o.agil) s[primeK] -= o.agil;
    }
    metaFx({
        id: 'candle', label: 'Candle (flicker)', xl: 'Candle', cat: 'nature', use: ['part'], mood: 'calm',
        show: ['PerNode', 'UsePalette', 'Candle_FlameAgility', 'Candle_WindBaseline', 'Candle_WindVariability', 'Candle_WindCalmness'],
        labels: { PerNode: 'Each light on its own (0/1)', UsePalette: 'Palette colors (0/1)', Candle_FlameAgility: 'Flicker speed', Candle_WindBaseline: 'Wind', Candle_WindVariability: 'Gusts', Candle_WindCalmness: 'Calm' },
        grid: {
            maxCells: 1000,
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st;
                const per = +o.PerNode, n = per ? W * H : 1;
                const k = { agil: Math.max(0, Math.min(254, Math.round(+o.Candle_FlameAgility || 2))), calm: Math.max(0, Math.min(31, Math.round(+o.Candle_WindCalmness || 0))), var: Math.round(+o.Candle_WindVariability || 0), base: Math.round(+o.Candle_WindBaseline || 0) };
                if (!st.s || st.s.length !== n) {
                    st.s = [];
                    for (let i = 0; i < n; i++) { const fr = c.rnd() * 255, fp = c.rnd() * 255; st.s.push({ flamer: Math.floor(fr), flameprimer: Math.floor(fp), flameg: Math.floor(c.rnd() * fr), flameprimeg: Math.floor(c.rnd() * fp), wind: Math.floor(c.rnd() * 255) }); }
                }
                const c1 = +o.UsePalette ? c.pal[0] : null, c2 = +o.UsePalette ? (c.pal[1] || [0, 0, 0]) : null;
                const col = [0, 0, 0];
                for (let i = 0; i < n; i++) {
                    const s = st.s[i];
                    candleUpdate(c.rnd, s, 'flamer', 'flameprimer', k);
                    candleUpdate(c.rnd, s, 'flameg', 'flameprimeg', k);
                    if (s.flameprimeg > s.flameprimer) s.flameprimeg = s.flameprimer;
                    if (s.flameg > s.flamer) s.flameprimeg = s.flameprimer;
                    if (c1) { const t = s.flameprimer / 255; col[0] = c1[0] * (1 - t) + c2[0] * t; col[1] = c1[1] * (1 - t) + c2[1] * t; col[2] = c1[2] * (1 - t) + c2[2] * t; }
                    else { col[0] = s.flameprimer; col[1] = s.flameprimeg >> 1; col[2] = 0; }
                    if (!c.drawn) continue;
                    if (per) setPx(c.g, W, H, i % W, Math.floor(i / W), col);
                    else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(c.g, W, H, x, y, col);
                }
            },
        },
        rand: R => ({ PerNode: R.chance(0.7) ? 1 : 0, UsePalette: R.chance(0.3) ? 1 : 0, Candle_FlameAgility: R.ibetween(2, 5), Candle_WindBaseline: R.ibetween(20, 60), Candle_WindVariability: R.ibetween(3, 8), Candle_WindCalmness: R.ibetween(1, 3) }),
    });

    // =====================================================================
    // Snowstorm (SnowstormEffect): flakes wandering with fading tails
    // =====================================================================
    const SS_VEC = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    const SS_ARR = [30, 20, 10, 5, 0, 5, 10, 20, 20, 15, 10, 10, 10, 10, 10, 15];
    function ssAdvance(r, it, W, H) {
        let adv = SS_VEC[7];
        const i0 = it.idx % 7 <= 4 ? 0 : 8, x = Math.floor(r() * 100);
        for (let i = 0, v = 0; i < 8; i++) { v += SS_ARR[i0 + i]; if (x < v) { adv = SS_VEC[i]; break; } }
        const m = it.idx % 3 === 0 ? 2 : 1;
        const last = it.pts[it.pts.length - 1];
        it.pts.push([((last[0] + adv[0] * m) % W + W) % W, ((last[1] + adv[1] * m) % H + H) % H]);
    }
    metaFx({
        id: 'snowstorm', label: 'Snowstorm (wandering flakes)', xl: 'Snowstorm', cat: 'nature', use: ['part'],
        show: ['Snowstorm_Count', 'Snowstorm_Length', 'Snowstorm_Speed'],
        labels: { Snowstorm_Count: 'Flakes', Snowstorm_Length: 'Trail length', Snowstorm_Speed: 'Speed' },
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd;
                const count = Math.round(+o.Snowstorm_Count || 10), tail = Math.max(1, Math.round(+o.Snowstorm_Length || 5)), speed = Math.round(+o.Snowstorm_Speed || 10);
                const h0 = rgb2hsv(c.pal[0]), h1 = rgb2hsv(c.pal[1 % c.pal.length]);
                const range = (a, b) => Math.min(a, b) + r() * Math.abs(a - b);
                if (!st.items) {
                    st.items = [];
                    for (let i = 0; i < count; i++) {
                        const it = { idx: i, decay: 0, pts: [], h: range(h0[0], h1[0]), s: range(h0[1], h1[1]) };
                        let k = Math.floor(r() * 2 * tail);
                        if (k > 0) it.pts.push([Math.floor(r() * W), Math.floor(r() * H)]);
                        if (k >= tail) { it.decay = k - tail; k = tail; }
                        for (let j = 1; j < k; j++) ssAdvance(r, it, W, H);
                        st.items.push(it);
                    }
                }
                for (const it of st.items) {
                    if (it.pts.length > tail) {
                        if (it.decay > tail) { it.pts = []; it.decay = 0; }
                        else if (Math.floor(r() * 20) < speed) it.decay++;
                    }
                    if (!it.pts.length) it.pts.push([Math.floor(r() * W), Math.floor(r() * H)]);
                    else if (Math.floor(r() * 20) < speed) ssAdvance(r, it, W, H);
                }
                if (!c.drawn) return;
                const col = [0, 0, 0];
                for (const it of st.items) {
                    const sz = it.pts.length;
                    // on a Normal layer xLights sets alpha = 255.8 * v, which wraps round for old trail points (v < 0), so they glow again
                    it.pts.forEach(([x, y], pt) => {
                        const v0 = 1 - (sz - pt + it.decay) / tail;
                        const v = c.p.alpha ? ((Math.trunc(255.8 * v0) % 256) + 256) % 256 / 255 : Math.max(0, v0);
                        setPx(c.g, W, H, x, y, hsv2rgb(it.h, it.s, 1, col), v);
                    });
                }
            },
        },
        rand: (R, c) => ({ Snowstorm_Count: R.ibetween(10, 40), Snowstorm_Length: R.ibetween(4, 10), Snowstorm_Speed: Math.max(1, Math.min(50, Math.round(R.between(6, 14) * c.fast))) }),
    });

    // =====================================================================
    // Circles (CirclesEffect): bouncing balls, bubbles, blobs or rings
    // =====================================================================
    const CIRCLE_STYLES = ['balls', 'bouncing balls', 'fading balls', 'bubbles', 'blobs', 'rings out', 'rainbow rings'];
    const circleFlags = s => ({ Circles_Bounce: s === 'bouncing balls' || s === 'fading balls' ? 1 : 0, Circles_Linear_Fade: s === 'fading balls' ? 1 : 0, Circles_Bubbles: s === 'bubbles' ? 1 : 0, Circles_Plasma: s === 'blobs' ? 1 : 0, Circles_Radial: s === 'rings out' ? 1 : 0, Circles_Radial_3D: s === 'rainbow rings' ? 1 : 0 });
    metaFx({
        id: 'circles', label: 'Circles (balls, bubbles, rings)', xl: 'Circles', cat: 'shape', use: ['part'],
        show: ['style', 'Circles_Count', 'Circles_Size', 'Circles_Speed'],
        extraOptions: ['style'],
        defaults: { style: 'bouncing balls' },
        choices: { style: CIRCLE_STYLES },
        labels: { style: 'Style', Circles_Count: 'How many', Circles_Size: 'Size', Circles_Speed: 'Speed' },
        skip: ['Circles_Bounce', 'Circles_Linear_Fade', 'Circles_Bubbles', 'Circles_Plasma', 'Circles_Radial', 'Circles_Radial_3D'],
        extra: o => Object.entries(circleFlags(o.style)).map(([k, v]) => `E_CHECKBOX_${k}=${v}`),
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd, pal = c.pal;
                const fl = circleFlags(o.style);
                const number = Math.min(30, Math.max(1, Math.round(+o.Circles_Count || 3))), speed = +o.Circles_Speed || 10, radius = Math.round(+o.Circles_Size || 5);
                const col = [0, 0, 0];
                if (fl.Circles_Radial || fl.Circles_Radial_3D) {
                    if (!c.drawn) return;
                    c.g.fill(0);
                    const es = Math.trunc(c.f * speed * 25 / 50);
                    const xc = Math.trunc(W / 2), yc = Math.trunc(H / 2);
                    let bar = Math.trunc(H / (radius + 1)); if (bar < 1) bar = 1;
                    const maxR = es > H ? H : Math.trunc(es / 2) + radius, block = pal.length * bar, off = Math.trunc(es / 4) % (block + 1);
                    for (let ii = maxR; ii >= 0; ii--) {
                        const ci = Math.trunc(((ii - off + block) % block) / bar);
                        let cc = pal[ci % pal.length];
                        if (fl.Circles_Radial_3D) { let h = (ii + es) / (maxR / number); h -= Math.trunc(h); cc = hsv2rgb(h, 1, 1, col).slice(); }
                        drawCircle(c.g, W, H, xc, yc, ii, cc, true);
                    }
                    return;
                }
                if (!st.balls) {
                    st.balls = [];
                    for (let i = 0; i < number; i++) {
                        const ang = r() < 0.5 ? Math.floor(r() * 90) : -Math.floor(r() * 90), spd = Math.floor(r() * 3) + 1;
                        const b = { x: Math.floor(r() * W), y: Math.floor(r() * H), dx: spd * Math.cos(ang), dy: spd * Math.sin(ang), rad: radius, ci: i % pal.length };
                        if (fl.Circles_Bubbles) { const a = (90 + Math.floor(r() * 45) - 22.5) * 2 * Math.PI / 180; b.dx = spd * Math.cos(a); b.dy = spd * Math.sin(a); }
                        st.balls.push(b);
                    }
                } else {
                    const inc = speed * 25 / 200;
                    for (const b of st.balls) {
                        b.x += b.dx * inc; b.x = b.x > W ? 0 : b.x; b.x = b.x < 0 ? W : b.x;
                        b.y += b.dy * inc; b.y = b.y > H ? 0 : b.y; b.y = b.y < 0 ? H : b.y;
                    }
                }
                if (fl.Circles_Bounce) for (const b of st.balls) {
                    if (b.x - b.rad <= 0) { b.dx = Math.abs(b.dx); if (b.dx < 0.2) b.dx = 0.2; }
                    if (b.x + b.rad >= W) { b.dx = -Math.abs(b.dx); if (b.dx > -0.2) b.dx = -0.2; }
                    if (b.y - b.rad <= 0) { b.dy = Math.abs(b.dy); if (b.dy < 0.2) b.dy = 0.2; }
                    if (b.y + b.rad >= H) { b.dy = -Math.abs(b.dy); if (b.dy > -0.2) b.dy = -0.2; }
                }
                if (!c.drawn) return;
                c.g.fill(0);
                const wrap = !fl.Circles_Bounce;
                const put = (x, y, cc, b = 1) => { if (wrap) { x = ((x % W) + W) % W; y = ((y % H) + H) % H; } setPx(c.g, W, H, x, y, cc, b); };
                if (fl.Circles_Plasma) {
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                        let sum = 0; const acc = [0, 0, 0]; let any = false;
                        for (const b of st.balls) {
                            const v = x === b.x && y === b.y ? 1 : b.rad / Math.hypot(x - b.x, y - b.y);
                            sum += v;
                            if (v > 0.3) { const t = atValue(pal[b.ci], Math.min(1, v)); acc[0] = Math.min(255, acc[0] + t[0]); acc[1] = Math.min(255, acc[1] + t[1]); acc[2] = Math.min(255, acc[2] + t[2]); any = true; }
                        }
                        if (sum >= 0.9 && any) setPx(c.g, W, H, x, y, acc);
                    }
                    return;
                }
                if (!fl.Circles_Bubbles) {
                    // CirclesFunctions.ispc: every pixel within the radius of a ball's (float) centre, the last ball winning
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                        let hit = null, hb = 1;
                        for (const b of st.balls) {
                            let dx = x - b.x, dy = y - b.y;
                            if (wrap) { if (dx > W * 0.5) dx -= W; if (dx < -W * 0.5) dx += W; if (dy > H * 0.5) dy -= H; if (dy < -H * 0.5) dy += H; }
                            const d = Math.sqrt(dx * dx + dy * dy);
                            if (d > b.rad) continue;
                            if (fl.Circles_Linear_Fade) { const a = 1 - d / b.rad; if (a > 0) { hit = pal[b.ci]; hb = a; } }
                            else { hit = pal[b.ci]; hb = 1; }
                        }
                        if (hit) setPx(c.g, W, H, x, y, hit, hb);
                    }
                    return;
                }
                for (const b of st.balls) {
                    const cc = pal[b.ci], bx = Math.trunc(b.x), by = Math.trunc(b.y), R = Math.trunc(b.rad);
                    if (fl.Circles_Linear_Fade) {
                        for (let x = -R; x < R; x++) for (let y = -R; y < R; y++) { const d = Math.hypot(x, y); if (d <= R) { const v = 1 - d / R; if (v > 0) put(x + bx, y + by, cc, v); } }
                    } else {
                        // DrawCircle with wrap
                        let x = R, y = 0, err = 1 - x;
                        const filled = !fl.Circles_Bubbles;
                        while (x >= y) {
                            if (!filled) for (const [a, d] of [[x, y], [y, x], [-x, y], [-y, x], [-x, -y], [-y, -x], [x, -y], [y, -x]]) put(a + bx, d + by, cc);
                            else for (const [xx, y0, y1] of [[bx - x, by - y, by + y], [bx + x, by - y, by + y], [bx - y, by - x, by + x], [bx + y, by - x, by + x]]) for (let yy = y0; yy <= y1; yy++) put(xx, yy, cc);
                            y++;
                            if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x + 1); }
                        }
                    }
                }
            },
        },
        rand: (R, c) => ({ style: R.weighted({ 'bouncing balls': 3, 'fading balls': 2, bubbles: 2, blobs: 2, 'rings out': 2, balls: 1, 'rainbow rings': 1 }), Circles_Count: R.ibetween(2, 6), Circles_Size: R.ibetween(2, 6), Circles_Speed: Math.max(1, Math.min(30, Math.round(R.between(6, 14) * c.fast))) }),
    });

    // =====================================================================
    // Galaxy (GalaxyEffect + GalaxyFunctions.ispc): a spiral arm winding out
    // =====================================================================
    metaFx({
        id: 'galaxy', label: 'Galaxy (spiral arm)', xl: 'Galaxy', cat: 'shape', use: ['part', 'hit'], mood: 'busy',
        show: ['Galaxy_Revolutions', 'Galaxy_Start_Radius', 'Galaxy_End_Radius', 'Galaxy_Start_Width', 'Galaxy_End_Width', 'Galaxy_Duration', 'Galaxy_Reverse', 'Galaxy_Inward'],
        defaults: { Galaxy_Revolutions: 2, Galaxy_Start_Radius: 1, Galaxy_End_Radius: 100, Galaxy_Start_Width: 5, Galaxy_End_Width: 20, Galaxy_Duration: 20 },
        labels: { Galaxy_Revolutions: 'Turns', Galaxy_Start_Radius: 'Start size', Galaxy_End_Radius: 'End size', Galaxy_Start_Width: 'Start width', Galaxy_End_Width: 'End width', Galaxy_Duration: 'Head time %', Galaxy_Reverse: 'Reverse (0/1)', Galaxy_Inward: 'Winds inward (0/1)' },
        grid: {
            maxCells: 8000,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, pal = c.pal, nc = pal.length;
                const revs = Math.round((+o.Galaxy_Revolutions || 0) * 360);
                if (!revs) return;
                const pos = c.pos;
                const px = W * 50 / 100, py = H * 50 / 100;
                const head = (+o.Galaxy_Duration || 0) / 100, tailLen = revs * (1 - head);
                let colLen = tailLen / nc; if (colLen < 1) colLen = 1;
                const tailEnd = (revs + tailLen) * pos - tailLen, headEnd = tailEnd + tailLen;
                const M = Math.max(W, H);
                const r1 = (+o.Galaxy_Start_Radius) * M / 200, r2 = (+o.Galaxy_End_Radius) * M / 200, w1 = (+o.Galaxy_Start_Width) * M / 100, w2 = (+o.Galaxy_End_Width) * M / 100;
                const rev = +o.Galaxy_Reverse, inward = +o.Galaxy_Inward, sa = 0;
                const lo = Math.max(0, tailEnd), hi = Math.min(headEnd, revs);
                if (hi <= lo) return;
                const maxRev = Math.trunc((hi - lo) / 360) + 2, inv = 1 / revs;
                const chB = (a, b, r) => a + Math.floor(r * (b - a) + 0.5);
                const colorAt = (i, out) => {
                    const cv = (headEnd - i) / colLen; let ci = Math.trunc(cv); const cp = cv - ci; if (ci < 0) ci = 0;
                    const c2 = Math.min(ci + 1, nc - 1);
                    if (ci < c2) { out[0] = chB(pal[ci][0], pal[c2][0], cp); out[1] = chB(pal[ci][1], pal[c2][1], cp); out[2] = chB(pal[ci][2], pal[c2][2], cp); }
                    else { out[0] = pal[c2][0]; out[1] = pal[c2][1]; out[2] = pal[c2][2]; }
                };
                const col = [0, 0, 0], acc = [0, 0, 0];
                let any;
                const emit = (alpha) => {
                    if (alpha <= 0) return;
                    if (Math.trunc(col[0]) === 0 && Math.trunc(col[1]) === 0 && Math.trunc(col[2]) === 0) return;
                    if (!any) { acc[0] = chB(0, col[0], alpha); acc[1] = chB(0, col[1], alpha); acc[2] = chB(0, col[2], alpha); }
                    else { acc[0] = chB(acc[0], col[0], alpha); acc[1] = chB(acc[1], col[1], alpha); acc[2] = chB(acc[2], col[2], alpha); }
                    any = true;
                };
                const arm = (i, rho) => { const p = i * inv, rc = r2 * p + r1 * (1 - p), hw = (w2 * p + w1 * (1 - p)) * 0.5; if (hw <= 0) return; const dd = Math.abs(rho - rc); if (dd > hw) return; colorAt(i, col); emit(1 - dd / hw); };
                const cap = (iEnd, cdDeg, rho) => {
                    const p = iEnd * inv, rc = r2 * p + r1 * (1 - p), hw = (w2 * p + w1 * (1 - p)) * 0.5;
                    if (rc < hw || hw <= 0) return;
                    const cd = 2 * Math.PI * rc * cdDeg / 360; if (cd >= hw) return;
                    const cw = Math.sqrt(hw * hw - cd * cd); if (cw <= 0) return;
                    const dr = Math.abs(rho - rc); if (dr > cw) return;
                    colorAt(iEnd, col); emit((1 - dr / cw) * (1 - cd / hw));
                };
                // only pixels the spiral can reach (GalaxyEffect's bounding box)
                const maxR = Math.max(r1, r2) + Math.max(w1, w2) / 2 + 2;
                const X0 = Math.max(0, Math.floor(px - maxR)), X1 = Math.min(W, Math.ceil(px + maxR)), Y0 = Math.max(0, Math.floor(py - maxR)), Y1 = Math.min(H, Math.ceil(py + maxR));
                for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
                    const dx = x + 0.5 - px, dy = y + 0.5 - py, rho = Math.hypot(dx, dy), th = Math.atan2(dx, dy) * 180 / Math.PI;
                    let base = rev ? -th - sa : th - sa;
                    base -= Math.floor(base / 360) * 360;
                    const k0 = Math.ceil((lo - base) / 360), icT = base + 360 * (Math.ceil((lo - base) / 360) - 1), icH = base + 360 * (Math.floor((hi - base) / 360) + 1);
                    any = false;
                    if (!inward) {
                        if (icT < lo) cap(lo, lo - icT, rho);
                        for (let m = 0; m < maxRev; m++) { const i = base + 360 * (k0 + m); if (i >= lo && i <= hi) arm(i, rho); }
                        if (icH > hi) cap(hi, icH - hi, rho);
                    } else {
                        if (icH > hi) cap(hi, icH - hi, rho);
                        for (let m = maxRev - 1; m >= 0; m--) { const i = base + 360 * (k0 + m); if (i >= lo && i <= hi) arm(i, rho); }
                        if (icT < lo) cap(lo, lo - icT, rho);
                    }
                    if (any) setPx(c.g, W, H, x, y, [Math.min(255, acc[0]), Math.min(255, acc[1]), Math.min(255, acc[2])]);
                }
            },
        },
        rand: (R, c) => ({ Galaxy_Revolutions: c.hit ? R.pick([1, 1.5]) : Math.max(1, Math.min(10, Math.round(c.bars / R.pick([2, 4]) * c.fast))), Galaxy_Start_Radius: 1, Galaxy_End_Radius: R.ibetween(70, 120), Galaxy_Start_Width: R.ibetween(5, 15), Galaxy_End_Width: R.ibetween(15, 40), Galaxy_Duration: R.ibetween(10, 30), Galaxy_Reverse: R.chance(0.5) ? 1 : 0, Galaxy_Inward: R.chance(0.2) ? 1 : 0 }),
    });

    // =====================================================================
    // Fireworks (FireworksEffect): bursts of falling sparks, at random times
    // or on every mark of a timing track
    // =====================================================================
    const FIRE_ON = ['random times', 'Beats', 'Bars', 'Note Onsets'];
    metaFx({
        id: 'fireworks', label: 'Fireworks (bursts)', xl: 'Fireworks', cat: 'nature', use: ['part', 'hit'], mood: 'busy',
        show: ['fireOn', 'Fireworks_Explosions', 'Fireworks_Count', 'Fireworks_Velocity', 'Fireworks_Fade', 'Fireworks_Gravity', 'Fireworks_HoldColour'],
        extraOptions: ['fireOn'],
        defaults: { fireOn: 'random times' },
        choices: { fireOn: FIRE_ON },
        labels: { fireOn: 'Bursts on', Fireworks_Explosions: 'Bursts (random times)', Fireworks_Count: 'Sparks per burst', Fireworks_Velocity: 'Burst size', Fireworks_Fade: 'Spark life', Fireworks_Gravity: 'Sparks fall (0/1)', Fireworks_HoldColour: 'One color per burst (0/1)' },
        skip: ['FIRETIMING', 'FIRETIMINGTRACK'],
        extra: o => o.fireOn && o.fireOn !== 'random times' ? ['E_CHECKBOX_FIRETIMING=1', `E_CHOICE_FIRETIMINGTRACK=${o.fireOn}`] : ['E_CHECKBOX_FIRETIMING=0'],
        trackOf: o => (o.fireOn && o.fireOn !== 'random times' ? o.fireOn : null),
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd, pal = c.pal;
                const cnt = Math.round(+o.Fireworks_Count || 50), vel = +o.Fireworks_Velocity || 2, fade = Math.round(+o.Fireworks_Fade || 50), grav = +o.Fireworks_Gravity, hold = +o.Fireworks_HoldColour;
                if (c.first) {
                    st.fw = []; st.periods = [];
                    if (!o.fireOn || o.fireOn === 'random times') for (let i = 0; i < Math.round(+o.Fireworks_Explosions || 16); i++) st.periods.push(Math.trunc(r() * (c.F - 1)));
                }
                const loc = () => { const x25 = Math.trunc(0.25 * W), x75 = Math.trunc(0.75 * W), y25 = Math.trunc(0.25 * H), y75 = Math.trunc(0.75 * H); return [x75 - x25 > 0 ? x25 + Math.floor(r() * (x75 - x25)) : 0, y75 - y25 > 0 ? y25 + Math.floor(r() * (y75 - y25)) : 0]; };
                const burst = () => {
                    const [x, y] = loc(), ci = Math.floor(r() * pal.length);
                    const parts = [];
                    for (let i = 0; i < cnt; i++) { const ev = (r() * 2 - 1) * vel, a = 2 * Math.PI * r(); parts.push({ x, y, vx: ev * Math.cos(a), vy: ev * Math.sin(a), age: 0 }); }
                    st.fw.push({ parts, ci, cycles: 0 });
                };
                let fire = 0;
                if (o.fireOn && o.fireOn !== 'random times') {
                    const per = Math.round((c.p.start || 0) * 40) + c.f;
                    for (const m of c.p.marks || []) { if (Math.floor(m.s * 40 + 1e-6) === per || Math.floor(m.e * 40 + 1e-6) === per) { fire = 1; break; } }
                } else for (const pp of st.periods) if (pp === c.f) fire++;
                for (let i = 0; i < fire; i++) burst();
                c.g.fill(0);
                const done = q => fade < q.age * 2 || q.x < 0 || q.y < 0 || q.x > W || (!grav && q.y > H);
                for (const f of st.fw) {
                    if (f.done) continue;
                    for (const q of f.parts) {
                        const v = Math.max(0, (10 * fade - q.age * 20) / (10 * fade));
                        if (c.drawn) setPx(c.g, W, H, Math.trunc(q.x), Math.trunc(q.y), atValue(hold ? pal[f.ci] : pal[f.ci], v));
                    }
                    f.cycles++;
                    for (const q of f.parts) { q.x += q.vx; if (grav) q.vy += 0.98 / 40; q.y += -q.vy; q.age++; }
                    if (f.cycles >= 500 || f.parts.every(done)) f.done = true;
                }
                st.fw = st.fw.filter(f => !f.done);
            },
        },
        rand: (R, c) => ({ fireOn: c.hit ? 'random times' : R.weighted({ 'random times': 3, Beats: c.energy > 0.6 ? 2 : 0, Bars: 1 }), Fireworks_Explosions: Math.max(2, Math.round(c.bars * R.between(1, 3))), Fireworks_Count: R.ibetween(30, 70), Fireworks_Velocity: R.ibetween(2, 5), Fireworks_Fade: R.ibetween(30, 60), Fireworks_Gravity: 1, Fireworks_HoldColour: 1 }),
    });

    // =====================================================================
    // Shape (ShapeEffect): outlines (circles, stars, hearts, trees...) that
    // appear, grow and fade; all the time, or one on every timing mark
    // =====================================================================
    const SHAPES = ['Circle', 'Square', 'Triangle', 'Star', 'Pentagon', 'Hexagon', 'Octagon', 'Heart', 'Tree', 'Candy Cane', 'Snowflake', 'Crucifix', 'Present', 'Ellipse'];
    const SHAPE_ON = ['all the time', 'Beats', 'Bars', 'Note Onsets'];
    const rnd0 = Math.round;
    function drawShape(g, W, H, kind, xc, yc, radius, c, th, pts, rot) {
        const px = (x, y) => setPx(g, W, H, x, y, c);
        const line = (a, b, d, e) => drawLine(g, W, H, a, b, d, e, c);
        const t = (step) => th - 1 + step;
        const rings = (step, fn) => { let r = radius; for (let i = 0; i < t(step); i += step) { if (r < 0) break; fn(r); r -= step; } };
        const rotP = (x, y) => { const a = rot * Math.PI / 180; return [x * Math.cos(a) - y * Math.sin(a), y * Math.cos(a) + x * Math.sin(a)]; };
        const poly = (sides, ro) => rings(0.05, r => { const inc = 360 / sides; for (let d = 0; d < 361; d += inc) { if (d > 360) d = 360; const a1 = (ro + d) * Math.PI / 180, a2 = (ro + d + inc) * Math.PI / 180; line(rnd0(r * Math.cos(a1)) + xc, rnd0(r * Math.sin(a1)) + yc, rnd0(r * Math.cos(a2)) + xc, rnd0(r * Math.sin(a2)) + yc); if (d === 360) break; } });
        const figure = (segs, ox, sx, oy, sy) => rings(0.75, r => { for (const [a, b, d, e] of segs) { const x1 = rnd0((a - ox) / sx * r), y1 = rnd0((b - oy) / sy * r), x2 = rnd0((d - ox) / sx * r), y2 = rnd0((e - oy) / sy * r); const [p1, q1] = rotP(x1, y1), [p2, q2] = rotP(x2, y2); line(xc + p1, yc + q1, xc + p2, yc + q2); } });
        switch (kind) {
            case 'Square': poly(4, rot + 45); break;
            case 'Triangle': poly(3, rot + 90); break;
            case 'Pentagon': poly(5, rot + 90); break;
            case 'Hexagon': poly(6, rot); break;
            case 'Octagon': poly(8, rot + 22.5); break;
            case 'Circle': rings(0.75, r => { for (let d = 0; d < 360; d++) { const a = d * Math.PI / 180; px(rnd0(r * Math.cos(a)) + xc, rnd0(r * Math.sin(a)) + yc); } }); break;
            case 'Ellipse': rings(0.75, r => { for (let d = 0; d < 360; d++) { const a = d * Math.PI / 180; const [x, y] = rotP(r * Math.cos(a), r * pts / 10 * Math.sin(a)); px(rnd0(x) + xc, rnd0(y) + yc); } }); break;
            case 'Star': {
                const off = pts === 5 ? 90 - 72 : pts === 6 ? 30 : pts === 7 ? 90 - 360 / 7 : 0;
                rings(0.6, r => {
                    const ir = r / 2.618034, inc = 360 / pts;
                    for (let d = 0; d < 361; d += inc) {
                        if (d > 360) d = 360;
                        const a = (rot + off + d) * Math.PI / 180, xo = rnd0(r * Math.cos(a)) + xc, yo = rnd0(r * Math.sin(a)) + yc;
                        for (const s of [1, -1]) { const b = (rot + off + d + s * inc / 2) * Math.PI / 180; line(rnd0(ir * Math.cos(b)) + xc, rnd0(ir * Math.sin(b)) + yc, xo, yo); }
                        if (d === 360) break;
                    }
                });
                break;
            }
            case 'Snowflake': { const inc = 360 / 6; let a = rot + 30; if (radius >= 0) for (let i = 0; i < 6; i++) { const r1 = a * Math.PI / 180, r2 = (180 + a) * Math.PI / 180; line(rnd0(radius * Math.cos(r1)) + xc, rnd0(radius * Math.sin(r1)) + yc, rnd0(radius * Math.cos(r2)) + xc, rnd0(radius * Math.sin(r2)) + yc); a += inc; } break; }
            case 'Heart':
                for (let x = -2; x <= 2; x += 0.01) {
                    const y1 = Math.sqrt(Math.max(0, 1 - (Math.abs(x) - 1) ** 2)), y2 = Math.acos(1 - Math.abs(x)) - Math.PI;
                    let r = radius;
                    for (let i = 0; i < t(0.75); i += 0.75) {
                        if (r < 0) break;
                        const xx = x * r / 2, a = rotP(xx, y1 * r / 2), b = rotP(xx, y2 * r / 2);
                        px(rnd0(a[0] + xc), rnd0(a[1] + yc)); px(rnd0(b[0] + xc), rnd0(b[1] + yc));
                        r -= 0.75;
                    }
                }
                break;
            case 'Tree': figure([[3, 0, 5, 0], [5, 0, 5, 3], [3, 0, 3, 3], [0, 3, 8, 3], [0, 3, 2, 6], [8, 3, 6, 6], [1, 6, 2, 6], [6, 6, 7, 6], [1, 6, 3, 9], [7, 6, 5, 9], [2, 9, 3, 9], [5, 9, 6, 9], [6, 9, 4, 11], [2, 9, 4, 11]], 4, 11, 4, 11); break;
            case 'Crucifix': figure([[2, 0, 2, 6], [2, 6, 0, 6], [0, 6, 0, 7], [0, 7, 2, 7], [2, 7, 2, 10], [2, 10, 3, 10], [3, 10, 3, 7], [3, 7, 5, 7], [5, 7, 5, 6], [5, 6, 3, 6], [3, 6, 3, 0], [3, 0, 2, 0]], 2.5, 7, 6.5, 10); break;
            case 'Present': figure([[0, 0, 0, 9], [0, 9, 10, 9], [10, 9, 10, 0], [10, 0, 0, 0], [5, 0, 5, 9], [5, 9, 2, 11], [2, 11, 2, 9], [5, 9, 8, 11], [8, 11, 8, 9]], 5, 7, 5.5, 10); break;
            case 'Candy Cane': {
                const R0 = radius;
                rings(0.75, r => {
                    const y1 = rnd0(yc + R0 / 6), y2 = rnd0(yc - R0 / 2), x = rnd0(xc + r / 2);
                    line(x, y1, x, y2);
                    const hr = r / 3;
                    for (let d = 0; d < 180; d++) { const a = d * Math.PI / 180; px(rnd0((hr - 0.75) * Math.cos(a) + xc + R0 / 6), rnd0((hr - 0.75) * Math.sin(a) + y1)); }
                });
                break;
            }
        }
    }
    metaFx({
        id: 'shape', label: 'Shapes (stars, hearts, trees...)', xl: 'Shape', cat: 'shape', use: ['part', 'hit'],
        show: ['Shape_ObjectToDraw', 'shapeOn', 'Shape_Count', 'Shape_StartSize', 'Shape_Growth', 'Shape_Lifetime', 'Shape_Thickness', 'Shape_Points', 'Shape_Rotation', 'Shape_RandomLocation', 'Shape_FadeAway'],
        extraOptions: ['shapeOn'],
        defaults: { shapeOn: 'all the time' },
        choices: { Shape_ObjectToDraw: SHAPES.concat(['Random']), shapeOn: SHAPE_ON },
        labels: { Shape_ObjectToDraw: 'Shape', shapeOn: 'New shapes', Shape_Count: 'How many', Shape_StartSize: 'Start size', Shape_Growth: 'Growth', Shape_Lifetime: 'Life %', Shape_Thickness: 'Thickness', Shape_Points: 'Star points', Shape_Rotation: 'Turned °', Shape_RandomLocation: 'Anywhere (0/1)', Shape_FadeAway: 'Fade away (0/1)' },
        skip: ['Shape_FireTiming', 'Shape_FireTimingTrack', 'Shape_UseMusic'],
        extra: o => o.shapeOn && o.shapeOn !== 'all the time' ? ['E_CHECKBOX_Shape_FireTiming=1', `E_CHOICE_Shape_FireTimingTrack=${o.shapeOn}`, 'E_CHECKBOX_Shape_UseMusic=0'] : ['E_CHECKBOX_Shape_FireTiming=0', 'E_CHECKBOX_Shape_UseMusic=0'],
        trackOf: o => (o.shapeOn && o.shapeOn !== 'all the time' ? o.shapeOn : null),
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd, pal = c.pal;
                const timed = o.shapeOn && o.shapeOn !== 'all the time';
                const life = Math.max(1, Math.round(+o.Shape_Lifetime || 5)), growth = Math.round(+o.Shape_Growth || 0), count = Math.max(1, Math.round(+o.Shape_Count || 5)), start = Math.round(+o.Shape_StartSize || 1);
                let lf = (c.F - 1) * life / 100; if (lf < 1) lf = 1;
                const gpf = growth / lf;
                const xc = Math.trunc(50 * W / 100), yc = Math.trunc(50 * H / 100);
                const randomLoc = +o.Shape_RandomLocation, kindOf = () => o.Shape_ObjectToDraw === 'Random' ? SHAPES[Math.min(12, Math.floor(r() * 13))] : o.Shape_ObjectToDraw;
                const add = (size, os) => {
                    st.ci = (st.ci + 1) % pal.length;
                    st.shapes.push({ x: randomLoc ? Math.trunc(r() * W) : xc, y: randomLoc ? Math.trunc(r() * H) : yc, size, os, ci: st.ci, kind: kindOf() });
                };
                if (c.first) {
                    st.shapes = []; st.ci = -1;
                    if (!timed) { for (let i = 0; i < count; i++) { const os = Math.trunc(r() * lf); add(start + os * gpf, os); } st.shapes.sort((a, b) => b.os - a.os); }
                }
                if (timed) {
                    const per = Math.round((c.p.start || 0) * 40) + c.f;
                    for (const m of c.p.marks || []) if (Math.floor(m.s * 40 + 1e-6) === per) { add(start, 0); break; }
                } else while (st.shapes.length < count) add(start, 0);
                for (const s of st.shapes) {
                    const b = +o.Shape_FadeAway ? Math.max(0, (lf - s.os) / lf) : 1;
                    const col = pal[s.ci % pal.length];
                    if (c.drawn) drawShape(c.g, W, H, s.kind, s.x, s.y, s.size, [col[0] * b, col[1] * b, col[2] * b], Math.max(1, Math.round(+o.Shape_Thickness || 1)), Math.round(+o.Shape_Points || 5), +o.Shape_Rotation || 0);
                    s.os++; s.size += gpf; if (s.size < 0) s.size = 0;
                }
                while (st.shapes.length && st.shapes[0].os > lf) st.shapes.shift();
            },
        },
        rand: (R, c) => {
            const kind = c.cls === 'star' ? R.pick(['Star', 'Star', 'Circle']) : c.cls === 'snowflake' ? R.pick(['Snowflake', 'Star', 'Circle']) : c.cls === 'megatree' || c.cls === 'minitree' ? R.pick(['Star', 'Tree', 'Circle', 'Heart']) : R.pick(['Circle', 'Star', 'Heart', 'Tree', 'Snowflake', 'Present', 'Random']);
            return { Shape_ObjectToDraw: kind, shapeOn: c.hit ? 'all the time' : R.weighted({ 'all the time': 3, Beats: c.energy > 0.5 ? 2 : 0, Bars: 1 }), Shape_Count: c.hit ? 1 : R.ibetween(2, 6), Shape_StartSize: R.ibetween(1, 3), Shape_Growth: R.ibetween(10, 40), Shape_Lifetime: c.hit ? 100 : R.ibetween(5, 20), Shape_Thickness: R.ibetween(1, 3), Shape_Points: 5, Shape_Rotation: 0, Shape_RandomLocation: c.hit ? 0 : R.chance(0.7) ? 1 : 0, Shape_FadeAway: 1 };
        },
    });

    // =====================================================================
    // Tendril (TendrilEffect): a glowing tentacle chasing a moving point
    // =====================================================================
    const TENDRIL_MOVES = ['Random', 'Square', 'Circle', 'Horizontal Zig Zag', 'Vertical Zig Zag', 'Horiz. Zig Zag Return', 'Vert. Zig Zag Return'];
    function aaDisc(g, W, H, cx, cy, rad, col) {
        for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const cov = clamp01(rad + 0.5 - Math.hypot(x - cx, y - cy));
            if (cov <= 0) continue;
            const i = 3 * (y * W + x);
            g[i] = Math.max(g[i], col[0] * cov); g[i + 1] = Math.max(g[i + 1], col[1] * cov); g[i + 2] = Math.max(g[i + 2], col[2] * cov);
        }
    }
    metaFx({
        id: 'tendril', label: 'Tendril (tentacle trail)', xl: 'Tendril', cat: 'shape', use: ['part'],
        show: ['Tendril_Movement', 'Tendril_TuneMovement', 'Tendril_Speed', 'Tendril_Thickness', 'Tendril_Trails', 'Tendril_Length'],
        labels: { Tendril_Movement: 'Moves', Tendril_TuneMovement: 'Movement size', Tendril_Speed: 'Speed (1-10)', Tendril_Thickness: 'Thickness', Tendril_Trails: 'Strands', Tendril_Length: 'Length' },
        choices: { Tendril_Movement: TENDRIL_MOVES },
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd;
                const tune = Math.round(+o.Tendril_TuneMovement || 10), sp = Math.round(+o.Tendril_Speed || 10), th = Math.max(1, Math.round(+o.Tendril_Thickness || 3));
                const fric = Math.min(0.6, Math.max(0.4, 10 / 20 * 0.2 + 0.4)), damp = 10 / 20 * 0.5, tens = Math.min(0.999, Math.max(0.96, 20 / 39 * 0.039 + 0.96));
                const trails = Math.max(1, Math.round(+o.Tendril_Trails || 1)), len = Math.max(5, Math.round(+o.Tendril_Length || 60));
                const mv = o.Tendril_Movement;
                if (c.first) {
                    const start = mv === 'Square' ? [0, 0] : mv === 'Horizontal Zig Zag' || mv === 'Horiz. Zig Zag Return' ? [Math.trunc(W / 2), 0] : mv === 'Vertical Zig Zag' || mv === 'Vert. Zig Zag Return' ? [0, Math.trunc(H / 2)] : [Math.trunc(W / 2), Math.trunc(H / 2)];
                    st.t = [];
                    for (let i = 0; i < trails; i++) st.t.push({ spring: 0.45 + 0.025 * (i / trails), fric: fric + r() * 0.01 - 0.005, nodes: Array.from({ length: len }, () => ({ x: start[0], y: start[1], vx: 0, vy: 0 })) });
                    st.m1 = 0; st.m2 = mv === 'Circle' ? Math.trunc(Math.min(W, H) / 2) : 0; st.m3 = mv === 'Square' ? 0 : 1;
                    if (mv === 'Horizontal Zig Zag' || mv === 'Vertical Zig Zag' || mv === 'Horiz. Zig Zag Return' || mv === 'Vert. Zig Zag Return') st.m3 = 1;
                }
                const update = (tx, ty) => {
                    for (const T of st.t) {
                        let spring = T.spring, prev = null;
                        const n0 = T.nodes[0];
                        n0.vx += (tx - n0.x) * spring; n0.vy += (ty - n0.y) * spring;
                        for (const n of T.nodes) {
                            if (prev) { n.vx += (prev.x - n.x) * spring; n.vy += (prev.y - n.y) * spring; n.vx += prev.vx * damp; n.vy += prev.vy * damp; }
                            n.vx *= T.fric; n.vy *= T.fric; n.x += n.vx; n.y += n.vy;
                            n.x = Math.max(-W, Math.min(2 * W, n.x)); n.y = Math.max(-H, Math.min(2 * H, n.y));
                            prev = n; spring *= tens;
                        }
                    }
                };
                const speed = 10 - sp;
                const period = Math.round((c.p.start || 0) * 40) + c.f;
                if (speed <= 0 || period % speed === 0) {
                    if (mv === 'Random') {
                        const t = Math.max(1, tune), last = st.t[0].nodes[st.t[0].nodes.length - 1];
                        let cx = Math.round(last.x), cy = Math.round(last.y);
                        const maxx = W + Math.trunc(W / 4), maxy = H + Math.trunc(H / 4), mvx = Math.trunc(W * 2 * t / 20), mvy = Math.trunc(H * 2 * t / 20);
                        const rminx = -Math.min(cx, mvx), rmaxx = Math.min(maxx - cx, mvx), rminy = -Math.min(cy, mvy), rmaxy = Math.min(maxy - cy, mvy);
                        const xm = -rminx + rmaxx, ym = -rminy + rmaxy;
                        cx += xm > 0 ? Math.floor(r() * xm) + rminx : 0; cy += ym > 0 ? Math.floor(r() * ym) + rminy : 0;
                        update(Math.max(-Math.trunc(W / 4), Math.min(maxx, cx)), Math.max(-Math.trunc(H / 4), Math.min(maxy, cy)));
                    } else if (mv === 'Square') {
                        const m4 = Math.max(1, tune);
                        if (st.m3 === 0) { st.m1 += Math.max(Math.trunc(W / m4), 1); if (st.m1 >= W - Math.trunc(W / m4)) st.m3++; }
                        else if (st.m3 === 1) { st.m2 += Math.max(Math.trunc(H / m4), 1); if (st.m2 >= H - Math.trunc(H / m4)) st.m3++; }
                        else if (st.m3 === 2) { st.m1 -= Math.max(Math.trunc(W / m4), 1); if (st.m1 <= Math.trunc(W / m4)) st.m3++; }
                        else { st.m2 -= Math.max(Math.trunc(H / m4), 1); if (st.m2 <= Math.trunc(H / m4)) st.m3 = 0; }
                        update(st.m1, st.m2);
                    } else if (mv === 'Circle') {
                        st.m1 += tune * 3;
                        st.m2 = Math.trunc(Math.min(W, H) / 2);
                        update(Math.trunc(Math.sin(st.m1 / 360 * Math.PI * 2) * st.m2 + W / 2), Math.trunc(Math.cos(st.m1 / 360 * Math.PI * 2) * st.m2 + H / 2));
                    } else if (mv === 'Horizontal Zig Zag' || mv === 'Horiz. Zig Zag Return') {
                        const m2 = Math.max(1, Math.trunc(tune * 1.5));
                        st.m1 += st.m3;
                        let x = Math.trunc(Math.sin(Math.max(H / m2, 0.5) * Math.PI * st.m1 / H) * W / 2 + W / 2);
                        if (st.m1 >= H || st.m1 <= 0) st.m3 = -st.m3;
                        if (st.m3 < 0 && mv === 'Horizontal Zig Zag') x = W - x;
                        update(x, st.m1);
                    } else {
                        const m2 = Math.max(1, Math.trunc(tune * 1.5));
                        st.m1 += st.m3;
                        let y = Math.trunc(Math.sin(Math.max(W / m2, 0.5) * Math.PI * st.m1 / W) * H / 2 + H / 2);
                        if (st.m1 >= W || st.m1 <= 0) st.m3 = -st.m3;
                        if (st.m3 < 0 && mv === 'Vertical Zig Zag') y = H - y;
                        update(st.m1, y);
                    }
                }
                if (!c.drawn) return;
                const col = multiBlend(c.pal, c.pos, false, [0, 0, 0]);
                const rad = th * 0.5;
                const bez = (t, a, b, d) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * d;
                for (const T of st.t) {
                    const ns = T.nodes;
                    let x0 = ns[0].x, y0 = ns[0].y;
                    const seg = (ax, ay, bx, by, ex, ey) => {
                        const steps = Math.max(4, Math.trunc(Math.max(Math.abs(ex - ax), Math.abs(ey - ay)) * 2 + 1));
                        let px = ax, py = ay;
                        for (let i = 0; i <= steps; i++) {
                            const t = i / steps, nx = bez(t, ax, bx, ex), ny = bez(t, ay, by, ey);
                            if (th <= 1) { if (i > 0) drawLine(c.g, W, H, px, py, nx, ny, col); } else aaDisc(c.g, W, H, nx, ny, rad, col);
                            px = nx; py = ny;
                        }
                    };
                    for (let i = 1; i < ns.length - 1; i++) { const a = ns[i], b = ns[i + 1]; const ex = (a.x + b.x) / 2, ey = (a.y + b.y) / 2; seg(x0, y0, a.x, a.y, ex, ey); x0 = ex; y0 = ey; }
                }
            },
        },
        rand: (R, c) => ({ Tendril_Movement: R.weighted({ Random: 3, Circle: 3, Square: 1, 'Horizontal Zig Zag': 1, 'Vertical Zig Zag': 1 }), Tendril_TuneMovement: R.ibetween(5, 15), Tendril_Speed: Math.max(1, Math.min(10, Math.round(R.between(6, 10) * Math.min(1.2, c.fast)))), Tendril_Thickness: R.ibetween(1, 4), Tendril_Trails: R.ibetween(1, 3), Tendril_Length: R.ibetween(30, 80) }),
    });

    // =====================================================================
    // Liquid (LiquidEffect, a LiquidFun particle simulation): drawn here as
    // particles that pour from a spout, fall and pile up (an approximation)
    // =====================================================================
    const LIQ = 1;
    const SPOUTS = { 'from the top': [50, 100, 270], 'from the left': [0, 50, 0], 'from the right': [100, 50, 180], 'from the bottom': [50, 0, 90] };
    metaFx({
        id: 'liquid', label: 'Liquid (pouring particles)', xl: 'Liquid', cat: 'nature', use: ['part'],
        show: ['spout', 'Velocity1', 'Flow1', 'LifeTime', 'Liquid_Gravity', 'BottomBarrier'],
        extraOptions: ['spout'],
        defaults: { spout: 'from the top', Velocity1: 100, Flow1: 50, LifeTime: 300, Liquid_Gravity: 10 },
        choices: { spout: Object.keys(SPOUTS) },
        labels: { spout: 'Pours', Velocity1: 'Speed', Flow1: 'Flow', LifeTime: 'Drop life (1/100 s)', Liquid_Gravity: 'Gravity', BottomBarrier: 'Pools at the bottom (0/1)' },
        skip: ['X1', 'Y1', 'Direction1'],
        extra: o => { const s = SPOUTS[o.spout] || SPOUTS['from the top']; return [`E_TEXTCTRL_X1=${s[0]}`, `E_TEXTCTRL_Y1=${s[1]}`, `E_TEXTCTRL_Direction1=${s[2]}`]; },
        // before 2026.07.1 speed was user x 10 px/s (now / 10) and flow was drops per frame
        legacy: {
            Velocity1: { before: '2026.07.1', write: v => ['E_TEXTCTRL_Velocity1', Math.max(0, Math.round((+v || 0) / 100))] },
            Flow1: { before: '2026.07.1', write: v => ['E_TEXTCTRL_Flow1', Math.max(0, Math.round((+v || 0) * 4 / 40))] },
        },
        grid: {
            stateful: true, maxCells: 6000,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, st = c.st, r = c.rnd;
                const s = SPOUTS[o.spout] || SPOUTS['from the top'];
                const vel = (+o.Velocity1 || 0) / 10, flow = +o.Flow1 || 0, life = (+o.LifeTime || 0) / 100, grav = +o.Liquid_Gravity || 0, floor = +o.BottomBarrier;
                const dt = 1 / 40;
                if (c.first) { st.p = []; st.acc = 0; st.occ = new Map(); }
                const perSec = flow <= 500 ? flow * 4 : 2000 * Math.pow(10, (flow - 500) * 0.002);
                st.acc += perSec * dt;
                let n = Math.trunc(st.acc); st.acc -= n;
                const px0 = s[0] * W / 100, py0 = s[1] * H / 100, a = s[2] * Math.PI / 180;
                for (let i = 0; i < n && st.p.length < 4000; i++) {
                    const vv = 1 - (r() * 0.1 - 0.05);
                    const ang = r() * 2 * Math.PI, d = r() * 0.5;
                    // drops crowded into the spout push each other apart (LiquidFun pressure): a spray
                    const sa = r() * 2 * Math.PI, sv = r() * 35;
                    st.p.push({ x: px0 + Math.sin(ang) * d, y: py0 + Math.cos(ang) * d, vx: vel * Math.cos(a) * vv + Math.cos(sa) * sv, vy: vel * Math.sin(a) * vv + Math.sin(sa) * sv, age: 0, life: life > 0 ? life * (1 + 0.2 * r() - 0.01) : 1e9, ci: (st.n = (st.n || 0) + 1) % c.pal.length });
                }
                // move; a drop can't enter a cell another drop sits in, so it slides off to the side (a pile forms)
                const occ = new Set(), kk = (x, y) => (y + 64) * 65536 + x + 64;
                for (const q of st.p) occ.add(kk(Math.round(q.x), Math.round(q.y)));
                for (const q of st.p) {
                    q.age += dt;
                    q.vy -= grav * 5 * dt;
                    let nx = q.x + q.vx * dt * LIQ, ny = q.y + q.vy * dt * LIQ;
                    if (floor && ny < 0) { ny = 0; q.vy = 0; q.vx *= 0.5; }
                    const k0 = kk(Math.round(q.x), Math.round(q.y)), k1 = kk(Math.round(nx), Math.round(ny));
                    if (k1 !== k0 && occ.has(k1)) {
                        const side = r() < 0.5 ? -1 : 1;
                        const alt = [[Math.round(q.x) + side, Math.round(ny)], [Math.round(q.x) - side, Math.round(ny)]].find(([x, y]) => x >= 0 && x < W && !occ.has(kk(x, y)));
                        if (alt) { nx = alt[0]; ny = alt[1]; } else { nx = q.x; ny = q.y; q.vy = 0; }
                    }
                    occ.delete(k0); occ.add(kk(Math.round(nx), Math.round(ny)));
                    q.x = nx; q.y = ny;
                }
                st.p = st.p.filter(q => q.age < q.life && q.x > -1 && q.x < W + 1 && q.y < H + 2 && (floor || q.y > -1));
                if (!c.drawn) return;
                const col = c.pal[0];
                for (const q of st.p) setPx(c.g, W, H, Math.trunc(q.x), Math.trunc(q.y), col);
            },
        },
        rand: R => ({ spout: R.weighted({ 'from the top': 4, 'from the left': 1, 'from the right': 1 }), Velocity1: R.ibetween(50, 200), Flow1: R.ibetween(20, 80), LifeTime: R.ibetween(150, 500), Liquid_Gravity: 10, BottomBarrier: R.chance(0.6) ? 1 : 0 }),
    });

    // ---------- layer tools: effects that reshape the rows under them ----------
    //
    // xLights' Canvas mode hands such an effect the picture of the layers below
    // (p.below, one colour per light); it draws its own version of that picture,
    // which then replaces it.

    function canvasRender(def) {
        return function (p, N, out) {
            const below = p.below;
            for (const b of buffers(N)) {
                const [W, H] = capSize(b.W, b.H, Math.max(1500, 6 * (b.idx ? b.idx.length : N.n)));
                const src = new Float32Array(W * H * 3);
                const each = fn => { if (b.idx) for (const k of b.idx) fn(k); else for (let k = 0; k < N.n; k++) fn(k); };
                if (below && p.any) each(k => {
                    const x = Math.min(W - 1, Math.round(N.u[k] * (W - 1))), y = Math.min(H - 1, Math.round(N.v[k] * (H - 1))), i = 3 * (y * W + x);
                    src[i] = below[3 * k]; src[i + 1] = below[3 * k + 1]; src[i + 2] = below[3 * k + 2];
                });
                const dst = new Float32Array(W * H * 3);
                def({ p, o: p.o, W, H, src, dst, fr: frameOf(p), N });
                sample(N, out, b.idx, W, H, dst);
            }
        };
    }
    const copyPx = (dst, di, src, si) => { dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; };
    const sampleUV = (c, s, t, border) => {
        if (border && (s < 0 || s > 1 || t < 0 || t > 1)) return -1;
        s = clamp01(s); t = clamp01(t);
        const ix = Math.max(0, Math.min(c.W - 1, Math.trunc(s * (c.W - 1) + 0.5))), iy = Math.max(0, Math.min(c.H - 1, Math.trunc(t * (c.H - 1) + 0.5)));
        return 3 * (iy * c.W + ix);
    };
    // stands in for xLights' dissolve-pattern image: smooth value noise
    const noise2 = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const h = (a, b) => U.hash((a * 73856093) ^ (b * 19349663));
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const lo = h(xi, yi) + ux * (h(xi + 1, yi) - h(xi, yi)), hi = h(xi, yi + 1) + ux * (h(xi + 1, yi + 1) - h(xi, yi + 1));
        return lo + uy * (hi - lo);
    };
    const dissolveAt = (s, t) => noise2(clamp01(s) * 24, clamp01(t) * 24);

    // =====================================================================
    // Warp (WarpEffect + WarpFunctions.ispc)
    // =====================================================================
    const WARPS = ['water drops', 'dissolve', 'circle reveal', 'banded swirl', 'ripple', 'single water drop', 'circular swirl', 'drop', 'wavy', 'sample on', 'mirror', 'copy', 'flip'];
    const lerpRange = (x, loIn, loOut, hiIn, hiOut) => (loIn !== hiIn ? loOut + (hiOut - loOut) * ((x - loIn) / (hiIn - loIn)) : (loOut + hiOut) / 2);
    metaFx({
        id: 'warp', label: 'Warp (bends the rows below)', xl: 'Warp', cat: 'layer', use: ['part'], canvas: true,
        show: ['Warp_Type', 'Warp_Treatment_APPLYLAST', 'Warp_X', 'Warp_Y', 'Warp_Cycle_Count', 'Warp_Speed', 'Warp_Frequency'],
        labels: { Warp_Type: 'Warp', Warp_Treatment_APPLYLAST: 'Comes', Warp_X: 'Center left/right %', Warp_Y: 'Center up/down %', Warp_Cycle_Count: 'Times', Warp_Speed: 'Speed', Warp_Frequency: 'Frequency' },
        choices: { Warp_Type: WARPS },
        extra: () => ['T_CHECKBOX_Canvas=1'],
        render: canvasRender(c => {
            const o = c.o, W = c.W, H = c.H, src = c.src, dst = c.dst;
            const type = WARPS.includes(o.Warp_Type) ? o.Warp_Type : 'water drops';
            const treat = o.Warp_Treatment_APPLYLAST || 'constant';
            let prog = cyclePos(c.fr, 1);
            const cx = (+o.Warp_X || 0) / 100, cy = (+o.Warp_Y || 0) / 100, cycles = +o.Warp_Cycle_Count || 1;
            let speed = +o.Warp_Speed || 0;
            const freq = +o.Warp_Frequency || 0;
            if (type === 'sample on') { const i = 3 * (Math.trunc(cy * (H - 1)) * W + Math.trunc(cx * (W - 1))); for (let k = 0; k < W * H; k++) copyPx(dst, 3 * k, src, i); return; }
            if (type === 'wavy') speed = lerpRange(speed, 0, 0.5, 40, 5);
            else if (type === 'single water drop') { const ip = frac(prog * cycles); prog = lerpRange(ip, 0, 0.2, 1, 0.45); }
            else if (type === 'circular swirl') speed = lerpRange(speed, 0, 1, 40, 9);
            let inward = true;
            if (['ripple', 'dissolve', 'banded swirl', 'circle reveal', 'circular swirl', 'drop'].includes(type)) {
                if (treat === 'constant') {
                    const sp = prog * 2 * cycles, idx = Math.floor(sp);
                    let ip = sp - idx; if (idx % 2) ip = 1 - ip;
                    prog = ip;
                    if (type === 'circular swirl' || type === 'drop') prog = 1 - prog;
                } else {
                    inward = treat === 'in';
                    if ((type === 'circular swirl' || type === 'drop') && treat === 'in') prog = 1 - prog;
                }
            }
            const iW = W > 1 ? 1 / (W - 1) : 0, iH = H > 1 ? 1 / (H - 1) : 0;
            const cxp = Math.trunc(cx * (W - 1) + 0.5), cyp = Math.trunc(cy * (H - 1) + 0.5);
            const wave = (len, sp, time) => { let w = Math.sin(sp * Math.PI * len + time); w = (w + 1) * 0.5 - 0.3; return w * w * w; };
            const lerpC = (i, a, b, t) => { for (let j = 0; j < 3; j++) dst[i + j] = Math.trunc(a[j] + t * (b[j] - a[j])); };
            const at = i => (i < 0 ? [0, 0, 0] : [src[i], src[i + 1], src[i + 2]]);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const di = 3 * (y * W + x), s = x * iW, t = y * iH;
                switch (type) {
                    case 'water drops': {
                        const px = s - cx, py = t - cy, len = Math.hypot(px, py), nx = len > 1e-4 ? px / len : 0, ny = len > 1e-4 ? py / len : 0;
                        const sc = wave(len, speed, -prog * 35) / (1 + 5 * len);
                        copyPx(dst, di, src, sampleUV(c, s - nx * sc, t - ny * sc)); break;
                    }
                    case 'single water drop': {
                        const px = s - cx, py = t - cy, len = Math.hypot(px, py), nx = len > 1e-4 ? px / len : 0, ny = len > 1e-4 ? py / len : 0;
                        const dtm = frac(prog / 0.5), rr = 1.5 * dtm - 0.6, dd = Math.hypot(s - cx, t - cy), inside = dd > rr ? 0 : 1;
                        let dh = dd * inside; dh = Math.cos(Math.PI + (dh - rr) * 60) * 0.5 + 0.5; dh *= 1 - dtm; dh *= inside * dd / Math.max(rr, 1e-4); dh = (1 - (Math.cos(dh * Math.PI) + 1) * 0.5) * 0.3;
                        const sc = dh / (1 + 3 * len);
                        copyPx(dst, di, src, sampleUV(c, s - nx * sc, t - ny * sc)); break;
                    }
                    case 'mirror': { const sx = x > cxp ? 2 * cxp - x : x, sy = y > cyp ? 2 * cyp - y : y; if (sx >= 0 && sx < W && sy >= 0 && sy < H) copyPx(dst, di, src, 3 * (sy * W + sx)); break; }
                    case 'copy': { const sx = x > cxp ? x - cxp : x, sy = y > cyp ? y - cyp : y; if (sx >= 0 && sx < W && sy >= 0 && sy < H) copyPx(dst, di, src, 3 * (sy * W + sx)); break; }
                    case 'flip': { const sx = Math.max(0, Math.min(W - 1, x <= cxp && cxp !== 0 ? W - 1 - x : x)), sy = Math.max(0, Math.min(H - 1, y <= cyp && cyp !== 0 ? H - 1 - y : y)); copyPx(dst, di, src, 3 * (sy * W + sx)); break; }
                    case 'drop': copyPx(dst, di, src, sampleUV(c, s, t + dissolveAt(s, 0.16) * prog)); break;
                    case 'ripple': {
                        const tx = s - cx, ty = t - cy, d = Math.hypot(tx, ty), nx = d > 1e-4 ? tx / d : 0, ny = d > 1e-4 ? ty / d : 0;
                        const off = prog * Math.cos(freq * d - speed * prog) * 0.15;
                        const c1 = at(sampleUV(c, s, t)), c2 = at(sampleUV(c, cx + nx * (d + off), cy + ny * (d + off)));
                        if (inward) lerpC(di, c2, c1, prog); else lerpC(di, c1, c2, prog); break;
                    }
                    case 'dissolve': { const dv = Math.trunc(dissolveAt(s, t) * 255 + 0.5), bp = Math.trunc(prog * 255); if (inward ? dv <= bp : dv > bp) copyPx(dst, di, src, sampleUV(c, s, t)); break; }
                    case 'circle reveal': {
                        const pp = inward ? prog : 1 - prog, rad = -0.04 + pp * 0.68, dfc = Math.hypot(s - cx, t - cy) - rad;
                        lerpC(di, at(sampleUV(c, s, t)), [0, 0, 0], clamp01((dfc + 0.04) / 0.08)); break;
                    }
                    case 'banded swirl': {
                        const tx = s - cx, ty = t - cy, d = Math.hypot(tx, ty);
                        let ang = Math.atan2(d > 1e-4 ? ty / d : 0, d > 1e-4 ? tx / d : 1);
                        ang += Math.sin(d * freq) * (inward ? 1.6 * (1 - prog) : 1.6 * prog);
                        const c1 = at(sampleUV(c, s, t)), c2 = at(sampleUV(c, Math.cos(ang) * d + cx, Math.sin(ang) * d + cy));
                        if (inward) lerpC(di, c1, c2, prog); else lerpC(di, c2, c1, prog); break;
                    }
                    case 'circular swirl': {
                        const dx = s - cx, dy = t - cy, len = Math.hypot(dx, dy);
                        if (len >= (1 - prog) * 0.70710678) break;
                        const a = -speed * len * prog * Math.PI, cs = Math.cos(a), sn = Math.sin(a), lt = 1 - prog;
                        const rx = dx * cs + dy * sn, ry = -dx * sn + dy * cs;
                        copyPx(dst, di, src, sampleUV(c, cx + lt * (rx * lt), cy + lt * (ry * lt))); break;
                    }
                    case 'wavy': {
                        const time = speed * prog;
                        const u = s + 0.4 * (noise2(time + 0.3 * s, time + 0.3 * t) - 0.5), v = t + 0.5 * (noise2(time + 0.5 * s + 7, time + 0.5 * t + 3) - 0.5);
                        const i = sampleUV(c, u, v, true); if (i >= 0) copyPx(dst, di, src, i); break;
                    }
                }
            }
        }),
        rand: (R, c) => ({ Warp_Type: R.weighted({ 'water drops': 3, ripple: 2, 'banded swirl': 2, 'circular swirl': 1, mirror: 2, wavy: 2, 'circle reveal': 1, dissolve: 1, flip: 1 }), Warp_Treatment_APPLYLAST: 'constant', Warp_X: 50, Warp_Y: 50, Warp_Cycle_Count: Math.max(1, Math.round(c.bars / R.pick([2, 4]))), Warp_Speed: R.ibetween(10, 30), Warp_Frequency: R.ibetween(10, 30) }),
    });

    // =====================================================================
    // Kaleidoscope (KaleidoscopeEffect): mirrors one cell of the rows below
    // =====================================================================
    function kaleidoMap(type, size, rot, x, y, W, H) {
        const used = new Uint8Array(W * H), map = new Int32Array(W * H);
        for (let i = 0; i < W * H; i++) map[i] = i;
        const edges = [];
        const above = (px, py, x1, y1, x2, y2) => { const sl = (y2 - y1) / (x2 - x1); return py > sl * px + (-sl * x1 + y1); };
        const edge = (x1, y1, x2, y2) => {
            if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) return false;
            if (x1 !== x2 && y1 !== y2) { const a = [above(0, 0, x1, y1, x2, y2), above(0, H - 1, x1, y1, x2, y2), above(W - 1, H - 1, x1, y1, x2, y2), above(W - 1, 0, x1, y1, x2, y2)]; if (a.every(v => v === a[0])) return false; }
            edges.push([x1, y1, x2, y2]); return true;
        };
        const move = (px, py, deg, d) => {
            const a = deg * Math.PI / 180;
            let dx = d * Math.cos(a), dy = d * Math.sin(a);
            if (Math.abs(Math.abs(dx) - Math.trunc(Math.abs(dx)) - 0.5) < 1e-7) dx = Math.sign(dx || 1) * (Math.trunc(Math.abs(dx)) + 0.5);
            if (Math.abs(Math.abs(dy) - Math.trunc(Math.abs(dy)) - 0.5) < 1e-7) dy = Math.sign(dy || 1) * (Math.trunc(Math.abs(dy)) + 0.5);
            return [px + Math.round(dx), py + Math.round(dy)];
        };
        if (type === 'Square') {
            for (let xx = Math.max(0, x - Math.trunc(size / 2)); xx <= Math.min(x + Math.trunc(size / 2), W - 1); xx++) for (let yy = Math.max(0, y - Math.trunc(size / 2)); yy <= Math.min(y + Math.trunc(size / 2), H - 1); yy++) used[yy * W + xx] = 1;
            const cd = Math.sqrt(2 * size * size) / 2;
            for (let it = 0, added = 1; added > 0 && it < 200; it++) {
                added = 0;
                const p = [45, 135, 225, 315].map(a => move(x, y, rot + a, (2 * it + 1) * cd));
                for (let k = 0; k < 4; k++) if (edge(p[k][0], p[k][1], p[(k + 1) % 4][0], p[(k + 1) % 4][1])) added++;
            }
        } else {
            let radius = size * Math.tan(Math.PI / 6) / 2;
            const [minx, miny] = move(x, y, 240, radius), maxx = move(x, y, 300, radius)[0], maxy = move(x, y, 90, radius)[1], midx = Math.trunc((maxx + minx) / 2);
            for (let xx = Math.max(0, minx); xx < Math.min(midx, W - 1); xx++) for (let yy = Math.max(0, miny); yy <= Math.min(maxy, H - 1); yy++) if (!above(xx, yy, minx, miny, midx, maxy)) used[yy * W + xx] = 1;
            for (let xx = Math.max(0, midx); xx <= Math.min(maxx, W - 1); xx++) for (let yy = Math.max(0, miny); yy <= Math.min(maxy, H - 1); yy++) if (!above(xx, yy, midx, maxy, maxx, miny)) used[yy * W + xx] = 1;
            radius -= radius > 10 ? 1 : radius > 5 ? 0.5 : 0.1;
            const gap = Math.sqrt(size * size - size / 2 * size / 2);
            for (let it = 0, added = 1; added > 0 && it < 200; it++) {
                added = 0;
                const d = it === 0 ? radius : it * gap + radius;
                const p = [90, 240, 300].map(a => move(x, y, rot + a, d));
                for (let k = 0; k < 3; k++) if (edge(p[k][0], p[k][1], p[(k + 1) % 3][0], p[(k + 1) % 3][1])) added++;
            }
        }
        if (!edges.length) return map;
        let unfilled = W * H - used.reduce((a, b) => a + b, 0), ei = 0, since = 0;
        while (unfilled > 0) {
            const snap = used.slice();
            let set = 0;
            const [x1, y1, x2, y2] = edges[ei], dx = x2 - x1, dy = y2 - y1, den = dx * dx + dy * dy, a = (dx * dx - dy * dy) / den, b = 2 * dx * dy / den;
            for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
                const i = yy * W + xx;
                if (snap[i]) continue;
                const sx = Math.round(a * (xx - x1) + b * (yy - y1) + x1), sy = Math.round(b * (xx - x1) - a * (yy - y1) + y1);
                if (sx >= 0 && sx < W && sy >= 0 && sy < H && snap[sy * W + sx]) { map[i] = map[sy * W + sx]; used[i] = 1; set++; since++; }
            }
            unfilled -= set;
            if (++ei === edges.length) { if (!since) break; since = 0; ei = 0; }
        }
        return map;
    }
    const kaleidoCache = new Map();
    const KALEIDO = ['Triangle', 'Square', 'Square 2', '6-Fold', '8-Fold', '12-Fold', 'Radial'];
    metaFx({
        id: 'kaleidoscope', label: 'Kaleidoscope (mirrors the rows below)', xl: 'Kaleidoscope', cat: 'layer', use: ['part'], canvas: true,
        show: ['Kaleidoscope_Type', 'Kaleidoscope_Size', 'Kaleidoscope_Rotation', 'Kaleidoscope_X', 'Kaleidoscope_Y'],
        defaults: { Kaleidoscope_Size: 10 },
        labels: { Kaleidoscope_Type: 'Pattern', Kaleidoscope_Size: 'Size', Kaleidoscope_Rotation: 'Turned °', Kaleidoscope_X: 'Center left/right %', Kaleidoscope_Y: 'Center up/down %' },
        choices: { Kaleidoscope_Type: KALEIDO },
        extra: () => ['T_CHECKBOX_Canvas=1'],
        render: canvasRender(c => {
            const o = c.o, W = c.W, H = c.H, src = c.src, dst = c.dst;
            const type = o.Kaleidoscope_Type || 'Triangle', size = Math.max(1, Math.round(+o.Kaleidoscope_Size || 5)), rot = Math.round(+o.Kaleidoscope_Rotation || 0);
            const x = Math.trunc((+o.Kaleidoscope_X ?? 50) * W / 100), y = Math.trunc((+o.Kaleidoscope_Y ?? 50) * H / 100);
            dst.set(src);
            if (type === 'Triangle' || type === 'Square') {
                const key = [type, size, rot, x, y, W, H].join('|');
                let map = kaleidoCache.get(key);
                if (!map) { map = kaleidoMap(type, size, rot, x, y, W, H); if (kaleidoCache.size > 40) kaleidoCache.clear(); kaleidoCache.set(key, map); }
                for (let i = 0; i < W * H; i++) copyPx(dst, 3 * i, src, 3 * map[i]);
                return;
            }
            const rr = rot * Math.PI / 180;
            const put = (i, sx, sy, px, py) => { if (sx >= 0 && sx < W && sy >= 0 && sy < H && (sx !== px || sy !== py)) copyPx(dst, i, src, 3 * (sy * W + sx)); };
            if (type === 'Square 2') {
                const hs = size / 2, refl = v => { const per = 4 * hs; let t = (v + hs) % per; if (t < 0) t += per; return t <= 2 * hs ? t - hs : 3 * hs - t; };
                for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                    const dx = px - x, dy = py - y;
                    const lx = refl(dx * Math.cos(-rr) - dy * Math.sin(-rr)), ly = refl(dx * Math.sin(-rr) + dy * Math.cos(-rr));
                    put(3 * (py * W + px), Math.floor(lx * Math.cos(rr) - ly * Math.sin(rr) + x + 0.5), Math.floor(lx * Math.sin(rr) + ly * Math.cos(rr) + y + 0.5), px, py);
                }
            } else if (type === 'Radial') {
                const seg = Math.max(2, size), wedge = 2 * Math.PI / seg;
                for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                    const dx = px - x, dy = py - y, r = Math.hypot(dx, dy);
                    if (r < 0.5) continue;
                    let a = (Math.atan2(dy, dx) - rr) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI;
                    let f = a % (2 * wedge); if (f > wedge) f = 2 * wedge - f; f += rr;
                    put(3 * (py * W + px), Math.floor(x + r * Math.cos(f) + 0.5), Math.floor(y + r * Math.sin(f) + 0.5), px, py);
                }
            } else {
                let v;
                if (type === '6-Fold') { const R = size / Math.sqrt(3); v = [0, 1, 2].map(i => { const a = rr + (90 + 120 * i) * Math.PI / 180; return [x + R * Math.cos(a), y + R * Math.sin(a)]; }); }
                else {
                    const pts = type === '8-Fold' ? [[-size / 3, -size / 3], [2 * size / 3, -size / 3], [-size / 3, 2 * size / 3]] : (() => { const sl = size / 2, ll = size * Math.sqrt(3) / 2, cx0 = sl / 3, cy0 = ll / 3; return [[-cx0, -cy0], [sl - cx0, -cy0], [-cx0, ll - cy0]]; })();
                    v = pts.map(([a, b]) => [x + a * Math.cos(rr) - b * Math.sin(rr), y + a * Math.sin(rr) + b * Math.cos(rr)]);
                }
                if ((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]) < 0) [v[1], v[2]] = [v[2], v[1]];
                const sd = (px, py, a, b) => (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
                const refl = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy, A = (dx * dx - dy * dy) / den, B = 2 * dx * dy / den, rx = p[0] - a[0], ry = p[1] - a[1]; p[0] = A * rx + B * ry + a[0]; p[1] = B * rx - A * ry + a[1]; };
                const maxIter = Math.min(500, Math.max(50, Math.trunc(Math.max(W, H) * 3 / size)));
                for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
                    const p = [px, py];
                    for (let i = 0; i < maxIter; i++) {
                        const d0 = sd(p[0], p[1], v[0], v[1]), d1 = sd(p[0], p[1], v[1], v[2]), d2 = sd(p[0], p[1], v[2], v[0]);
                        if (d0 >= -0.5 && d1 >= -0.5 && d2 >= -0.5) break;
                        if (d0 < d1 && d0 < d2) refl(p, v[0], v[1]); else if (d1 < d0 && d1 < d2) refl(p, v[1], v[2]); else refl(p, v[2], v[0]);
                    }
                    put(3 * (py * W + px), Math.floor(p[0] + 0.5), Math.floor(p[1] + 0.5), px, py);
                }
            }
        }),
        // the classic patterns: every xLights version has them
        rand: R => ({ Kaleidoscope_Type: R.pick(['Triangle', 'Triangle', 'Square']), Kaleidoscope_Size: R.ibetween(6, 20), Kaleidoscope_Rotation: R.pick([0, 0, 45, 90]), Kaleidoscope_X: 50, Kaleidoscope_Y: 50 }),
    });

    // =====================================================================
    // Adjust (AdjustEffect): changes the channel values of the rows below
    // =====================================================================
    const ADJUST = ['None', 'Adjust By Value', 'Adjust By Percentage', 'Set Minimum', 'Set Maximum', 'Set Range', 'Shift With Wrap By Value', 'Prevent Range', 'Reverse'];
    metaFx({
        id: 'adjust', label: 'Adjust (changes the rows below)', xl: 'Adjust', cat: 'layer', use: ['part'], canvas: true, random: false, why: 'changes the brightness numbers of the rows under it; for fine tuning by hand',
        show: ['Action', 'Value1', 'Value2', 'NthChannel', 'StartingAt', 'Count'],
        labels: { Action: 'Action', Value1: 'Value 1', Value2: 'Value 2', NthChannel: 'Every nth channel', StartingAt: 'Starting at', Count: 'How many (0 = all)' },
        choices: { Action: ADJUST },
        extra: () => ['T_CHECKBOX_Canvas=1'],
        render(p, N, out) {
            const o = p.o, below = p.below, v1 = +o.Value1 || 0, v2 = +o.Value2 || 0, nth = Math.max(1, +o.NthChannel || 1), start = Math.max(1, +o.StartingAt || 1), cnt = +o.Count || 0;
            if (!below || !p.any) return;
            let done = 0;
            for (let ch = 0; ch < 3 * N.n; ch++) {
                let v = Math.min(255, below[ch]);
                const n1 = ch + 1;
                if (n1 >= start && (n1 - start) % nth === 0 && (!cnt || done < cnt)) {
                    done++;
                    switch (o.Action) {
                        case 'Adjust By Value': v = Math.max(0, Math.min(255, v + v1)); break;
                        case 'Adjust By Percentage': v = Math.max(0, Math.min(255, v * (100 + v1) / 100)); break;
                        case 'Set Minimum': v = Math.max(v, v1); break;
                        case 'Set Maximum': v = Math.min(v, v1); break;
                        case 'Set Range': v = v1 + v * (v2 - v1) / 255; break;
                        case 'Shift With Wrap By Value': v = ((v + v1) % 256 + 256) % 256; break;
                        case 'Prevent Range': if (v >= v1 && v <= v2) v = v - v1 < v2 - v ? v1 - 1 : v2 + 1; v = Math.max(0, Math.min(255, v)); break;
                        case 'Reverse': v = 255 - v; break;
                    }
                }
                out[ch] = v;
            }
        },
    });

    // =====================================================================
    // Duplicate (DuplicateEffect): shows what another prop's layer shows
    // =====================================================================
    metaFx({
        id: 'duplicate', label: 'Duplicate (copy another prop)', xl: 'Duplicate', cat: 'layer', use: ['part'], random: false, why: 'copies the lights of another prop; type its name in the row',
        show: ['Duplicate_Model', 'Duplicate_Layer', 'Duplicate_Override_Palette', 'Duplicate_Override_Color', 'Duplicate_Override_Buffer'],
        labels: { Duplicate_Model: 'Copy this prop (exact name)', Duplicate_Layer: 'Its layer', Duplicate_Override_Palette: 'Use this row’s palette (0/1)', Duplicate_Override_Color: 'Use this row’s colors (0/1)', Duplicate_Override_Buffer: 'Use this row’s buffer (0/1)' },
        fixed: { Duplicate_Model: '' },
        render(p, N, out) { if (p.o.Duplicate_Model) Effects.get('glow').render(p, N, out); },
    });

    // ---------- the music, for effects that follow it ----------
    //
    // xLights reads the song itself (its own spectrum and note analysis). The
    // preview uses this app's analysis: loudness, 8 frequency bands and 12
    // pitch classes per moment, which shape the same kind of picture.

    // 0..1: how loud the song is at time t against its loudest moment
    function audioLevel(song, t) {
        const m = song && song.model;
        if (!m || !m.loudness || !m.loudness.length) return 0;
        const L = m.loudness, step = m.loudStep || 0.05;
        if (!m._loudMax) { let mx = 0; for (const v of L) if (v > mx) mx = v; m._loudMax = mx || 1; }
        return clamp01((L[Math.min(L.length - 1, Math.max(0, Math.floor(t / step)))] || 0) / m._loudMax);
    }
    const BAND_HZ = [50, 141, 283, 566, 1131, 2263, 4525, 8000];
    // 0..1 strength of every MIDI note 0..127 at time t
    function noteLevels(song, t) {
        const out = new Float32Array(128);
        const m = song && song.model, f = m && m.feat;
        const lvl = audioLevel(song, t);
        if (!f || !f.bands || !f.nb) { out.fill(lvl * 0.6); return out; }
        const fi = Math.max(0, Math.min(f.nFrames - 1, Math.round(t * 22050 / 256)));
        if (!f._bandRange) {
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < f.bands.length; i += 7) { const v = f.bands[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
            f._bandRange = [lo, hi > lo ? hi : lo + 1];
        }
        const [lo, hi] = f._bandRange, nb = f.nb;
        const band = b => clamp01((f.bands[fi * nb + b] - lo) / (hi - lo));
        let cmax = 1e-9;
        for (let p = 0; p < 12; p++) cmax = Math.max(cmax, f.chroma[fi * 12 + p]);
        for (let n = 0; n < 128; n++) {
            const hz = 440 * Math.pow(2, (n - 69) / 12);
            let b = 0;
            while (b < nb - 1 && BAND_HZ[b + 1] < hz) b++;
            const b2 = Math.min(nb - 1, b + 1), w = b2 > b ? clamp01(Math.log(hz / BAND_HZ[b]) / Math.log(BAND_HZ[b2] / BAND_HZ[b])) : 0;
            const e = band(b) * (1 - w) + band(b2) * w;
            out[n] = e * (0.35 + 0.65 * f.chroma[fi * 12 + (n % 12)] / cmax);
        }
        return out;
    }
    const absT = (p, f) => (p.start || 0) + f / FPS;

    // =====================================================================
    // VU Meter, the kinds that follow the music (VUMeterEffect)
    // =====================================================================
    const VU_MUSIC = ['Spectrogram', 'Spectrogram Peak', 'Spectrogram Line', 'Volume Bars', 'Waveform', 'On', 'Color On', 'Intensity Wave', 'Pulse', 'Level Bar', 'Level Color', 'Level Pulse', 'Level Jump', 'Level Pulse Color', 'Level Shape', 'Dominant Frequency Colour', 'Note On', 'Note Level Bar'];
    metaFx({
        id: 'vumusic', label: 'VU meter (follows the music)', xl: 'VU Meter', cat: 'music', use: ['part'], mood: 'busy',
        show: ['VUMeter_Type', 'VUMeter_Bars', 'VUMeter_Sensitivity', 'VUMeter_Gain', 'VUMeter_Shape', 'VUMeter_StartNote', 'VUMeter_EndNote', 'VUMeter_SlowDownFalls'],
        defaults: { VUMeter_Type: 'Spectrogram', VUMeter_Bars: 12 },
        choices: { VUMeter_Type: VU_MUSIC, VUMeter_Shape: ['Circle', 'Filled Circle', 'Square', 'Filled Square', 'Diamond', 'Filled Diamond', 'Star', 'Filled Star', 'Heart', 'Filled Heart', 'Tree', 'Snowflake'] },
        labels: { VUMeter_Type: 'Shows', VUMeter_Bars: 'Bars', VUMeter_Sensitivity: 'Sensitivity', VUMeter_Gain: 'Gain', VUMeter_Shape: 'Shape', VUMeter_StartNote: 'Lowest note', VUMeter_EndNote: 'Highest note', VUMeter_SlowDownFalls: 'Slow falls (0/1)' },
        skip: ['VUMeter_TimingTrack', 'Filter', 'Regex', 'SVGFile', 'VUMeter_AudioTrack'],
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, g = c.g, st = c.st, song = c.p.song, pal = c.pal;
                const t = absT(c.p, c.f), type = o.VUMeter_Type;
                const gain = Math.pow(2, (+o.VUMeter_Gain || 0) / 30);
                const lvl = clamp01(audioLevel(song, t) * gain);
                const bars = Math.max(1, Math.round(+o.VUMeter_Bars || 6));
                const col = [0, 0, 0];
                const box = (x0, y0, x1, y1, cc, b = 1) => { for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) setPx(g, W, H, x, y, cc, b); };
                switch (type) {
                    case 'Spectrogram': case 'Spectrogram Peak': case 'Spectrogram Line': case 'Note Level Bar': {
                        const s = Math.round(+o.VUMeter_StartNote || 36), e = Math.max(s + 1, Math.round(+o.VUMeter_EndNote || 84));
                        const nl = noteLevels(song, t);
                        if (!st.peak) st.peak = new Float32Array(W);
                        for (let x = 0; x < W; x++) {
                            const n0 = s + Math.floor(x * (e - s + 1) / W), n1 = Math.max(n0, s + Math.floor((x + 1) * (e - s + 1) / W) - 1);
                            let v = 0; for (let n = n0; n <= n1; n++) v = Math.max(v, nl[n]);
                            v = clamp01(v * gain * (0.5 + (+o.VUMeter_Sensitivity || 70) / 140));
                            if (+o.VUMeter_SlowDownFalls) v = Math.max(v, (st.peak[x] || 0) - 0.04);
                            st.peak[x] = v;
                            const h = Math.round(v * H);
                            if (type === 'Spectrogram Line') { if (h > 0) setPx(g, W, H, x, h - 1, multiBlend(pal, v, false, col)); }
                            else for (let y = 0; y < h; y++) setPx(g, W, H, x, y, multiBlend(pal, y / H, false, col));
                            if (type === 'Spectrogram Peak' && h > 0) setPx(g, W, H, x, Math.min(H - 1, h), [255, 255, 255]);
                        }
                        break;
                    }
                    case 'Volume Bars': {
                        // the last few frames' volume, newest on the right
                        if (!st.hist) st.hist = [];
                        st.hist.push(lvl); if (st.hist.length > bars) st.hist.shift();
                        const bw = W / bars;
                        st.hist.forEach((v, i) => { const x0 = Math.round((bars - st.hist.length + i) * bw); box(x0, 0, Math.round(x0 + bw) - 1, Math.round(v * H) - 1, multiBlend(pal, v, false, [0, 0, 0])); });
                        break;
                    }
                    case 'Waveform': {
                        const pk = song && song.model && song.model.peaks;
                        const span = 0.5, x2t = x => t - span / 2 + span * x / Math.max(1, W - 1);
                        for (let x = 0; x < W; x++) {
                            let a = 0;
                            if (pk && pk.max) { const i = Math.max(0, Math.min(pk.max.length - 1, Math.floor(x2t(x) / pk.blockSec))); a = Math.max(Math.abs(pk.max[i] || 0), Math.abs(pk.min[i] || 0)); }
                            else a = lvl * (0.6 + 0.4 * Math.sin(x * 0.7 + t * 20));
                            const h = Math.round(clamp01(a * gain) * H / 2);
                            for (let y = Math.floor(H / 2) - h; y <= Math.floor(H / 2) + h; y++) setPx(g, W, H, x, y, pal[0]);
                        }
                        break;
                    }
                    case 'On': box(0, 0, W - 1, H - 1, pal[0], lvl); break;
                    case 'Color On': box(0, 0, W - 1, H - 1, multiBlend(pal, lvl, false, col)); break;
                    case 'Pulse': case 'Level Pulse': case 'Level Pulse Color': {
                        const on = lvl > (+o.VUMeter_Sensitivity || 70) / 100 * 0.8;
                        if (on) st.pulse = Math.max(1, bars); else if (st.pulse) st.pulse--;
                        if (st.pulse) box(0, 0, W - 1, H - 1, type === 'Level Pulse Color' ? pal[(st.np = on && !st.was ? (st.np || 0) + 1 : (st.np || 0)) % pal.length] : pal[0], st.pulse / Math.max(1, bars));
                        st.was = on;
                        break;
                    }
                    case 'Intensity Wave': {
                        if (!st.wave) st.wave = [];
                        st.wave.unshift(lvl); st.wave.length = Math.min(st.wave.length, W);
                        st.wave.forEach((v, i) => { const x = Math.floor(W / 2) + Math.ceil(i / 2) * (i % 2 ? 1 : -1); for (let y = 0; y < H; y++) setPx(g, W, H, x, y, multiBlend(pal, v, false, col), v); });
                        break;
                    }
                    case 'Level Bar': case 'Level Jump': {
                        const n = Math.max(1, Math.round(lvl * bars));
                        const bw = W / bars;
                        for (let b = 0; b < n; b++) box(Math.round(b * bw), 0, Math.round((b + 1) * bw) - 1, H - 1, pal[b % pal.length]);
                        break;
                    }
                    case 'Level Color': box(0, 0, W - 1, H - 1, pal[Math.min(pal.length - 1, Math.floor(lvl * pal.length))]); break;
                    case 'Dominant Frequency Colour': {
                        const nl = noteLevels(song, t);
                        let best = 0; for (let n = 36; n < 96; n++) if (nl[n] > nl[best]) best = n;
                        box(0, 0, W - 1, H - 1, hsv2rgb((best % 12) / 12, 1, 1, col), lvl);
                        break;
                    }
                    case 'Note On': {
                        const nl = noteLevels(song, t), s = Math.round(+o.VUMeter_StartNote || 36), e = Math.round(+o.VUMeter_EndNote || 84);
                        let v = 0; for (let n = s; n <= e; n++) v = Math.max(v, nl[n]);
                        box(0, 0, W - 1, H - 1, pal[0], clamp01(v * gain));
                        break;
                    }
                    case 'Level Shape': {
                        const r = lvl * Math.min(W, H) / 2 * gain;
                        const shape = String(o.VUMeter_Shape || 'Circle');
                        drawShape(g, W, H, shape.replace('Filled ', '').replace('Diamond', 'Square'), Math.trunc(W / 2), Math.trunc(H / 2), r, pal[0], /Filled/.test(shape) ? Math.max(1, Math.round(r)) : 1, 5, shape.includes('Diamond') ? 45 : 0);
                        break;
                    }
                }
            },
        },
        rand: (R, c) => ({ VUMeter_Type: c.cls === 'matrix' || c.cls === 'megatree' ? R.weighted({ Spectrogram: 4, 'Spectrogram Peak': 2, Waveform: 2, 'Volume Bars': 1, 'Level Shape': 2, 'Intensity Wave': 1 }) : R.weighted({ 'Level Pulse': 3, 'Color On': 2, 'Level Bar': 2, On: 2, 'Intensity Wave': 1 }), VUMeter_Bars: R.ibetween(6, 16), VUMeter_Sensitivity: 70, VUMeter_Gain: R.pick([0, 0, 10, 20]), VUMeter_Shape: R.pick(['Circle', 'Star', 'Heart', 'Filled Circle']), VUMeter_StartNote: 36, VUMeter_EndNote: 84, VUMeter_SlowDownFalls: 1 }),
    });

    // =====================================================================
    // Music (MusicEffect): a bar per range of notes, moving while they sound
    // =====================================================================
    metaFx({
        id: 'music', label: 'Music (bars that follow the notes)', xl: 'Music Effect', metaName: 'Music', cat: 'music', use: ['part'],
        show: ['Music_Type', 'Music_Bars', 'Music_StartNote', 'Music_EndNote', 'Music_Sensitivity', 'Music_Colour', 'Music_Scale', 'Music_Fade'],
        defaults: { Music_Scale: true, Music_StartNote: 36, Music_EndNote: 96 },
        labels: { Music_Type: 'Moves', Music_Bars: 'Bars', Music_StartNote: 'Lowest note', Music_EndNote: 'Highest note', Music_Sensitivity: 'Sensitivity', Music_Colour: 'Colors', Music_Scale: 'Fill the width (0/1)', Music_Fade: 'Fade (0/1)' },
        grid: {
            stateful: true,
            draw(c) {
                const o = c.o, W = c.W, H = c.H, g = c.g, st = c.st, pal = c.pal;
                let sN = Math.round(+o.Music_StartNote || 60), eN = Math.round(+o.Music_EndNote || 80);
                if (sN > eN) [sN, eN] = [eN, sN];
                const bars = Math.max(1, Math.min(Math.round(+o.Music_Bars || 20), eN - sN + 1, W));
                const npb = Math.max(1, Math.floor((eN - sN + 1) / bars));
                if (c.first) {
                    // events: per bar, stretches where its notes are above the sensitivity
                    const data = [], mx = [];
                    let all = 0;
                    for (let b = 0; b < bars; b++) { data.push(new Float32Array(c.F)); mx.push(0); }
                    for (let f = 0; f < c.F; f++) {
                        const nl = noteLevels(c.p.song, absT(c.p, f));
                        for (let b = 0; b < bars; b++) { let v = 0; for (let n = 0; n < npb; n++) v = Math.max(v, nl[sN + b * npb + n] || 0); data[b][f] = v; mx[b] = Math.max(mx[b], v); all = Math.max(all, v); }
                    }
                    const sens = (+o.Music_Sensitivity || 50) / 100 * all;
                    st.ev = data.map(d => { const ev = []; for (let f = 0; f < d.length; f++) if (d[f] > sens) { const s0 = f; while (f < d.length && d[f] > sens) f++; if (f - 1 - s0 >= 5) ev.push([s0, f - 1 - s0]); } return ev; });
                }
                const per = +o.Music_Scale ? W / bars : 1, type = o.Music_Type || 'Morph', ct = o.Music_Colour || 'Distinct', fade = +o.Music_Fade;
                const colAt = (prop, ei, out) => ct === 'Blend' ? multiBlend(pal, prop, false, out) : ct === 'Cycle' ? pal[ei % pal.length] : pal[Math.max(0, Math.min(pal.length - 1, Math.floor(prop * pal.length - 1e-9)))];
                st.ev.forEach((ev, b) => {
                    for (let x = Math.floor(b * per); x < Math.floor((b + 1) * per) && x < W; x++) {
                        ev.forEach(([s0, d], ei) => {
                            if (c.f < s0 || c.f > s0 + d) return;
                            const prog = d ? (c.f - s0) / d : 0;
                            if (type === 'On') { for (let y = 0; y < H; y++) setPx(g, W, H, x, y, colAt(y / H, ei, [0, 0, 0]), fade ? 1 - prog : 1); return; }
                            if (type === 'Collide' || type === 'Separate') {
                                const p2 = type === 'Collide' ? prog : 1 - prog, mid = Math.trunc(H / 2), ls = Math.trunc(-mid - 1 + p2 * H), le = Math.min(ls + mid, mid);
                                for (let y = Math.max(0, ls); y < le; y++) { const cc = colAt((y - ls) / mid, ei, [0, 0, 0]); setPx(g, W, H, x, y, cc, fade ? p2 : 1); setPx(g, W, H, x, 2 * mid - y - 1, cc, fade ? p2 : 1); }
                                return;
                            }
                            const st0 = Math.trunc(-H + prog * 2 * H + 1), en = st0 + H, up = ei % 2 === 1;
                            for (let y = Math.max(0, st0); y < Math.min(en, H); y++) { const pr = (en - y) / H; setPx(g, W, H, x, type === 'Bounce' && !up ? H - y - 1 : y, colAt(pr, ei, [0, 0, 0]), fade ? 1 - pr : 1); }
                        });
                    }
                });
            },
        },
        rand: R => ({ Music_Type: R.weighted({ Morph: 3, Bounce: 2, Collide: 2, Separate: 1, On: 1 }), Music_Bars: R.ibetween(8, 24), Music_StartNote: 36, Music_EndNote: 96, Music_Sensitivity: R.ibetween(40, 60), Music_Colour: R.pick(['Distinct', 'Blend', 'Cycle']), Music_Scale: 1, Music_Fade: R.chance(0.5) ? 1 : 0 }),
    });

    // ---------- notes from a timing track (Piano, Guitar) ----------
    // The app exports the sung melody as a "Vocal Notes" timing track (MIDI note numbers).
    const NOTE_TRACK = 'Vocal Notes';
    const isSharp = n => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
    function notesNow(p, f) {
        const song = p.song, notes = song && song.lyr && song.lyr.notes;
        if (!notes) return [];
        const t = absT(p, f);
        return notes.filter(n => n.s <= t && n.e > t).map(n => Math.round(n.midi));
    }
    const fold = (n, lo, hi) => { if (hi - lo < 11) return n; while (n < lo) n += 12; while (n > hi) n -= 12; return n; };
    metaFx({
        id: 'piano', label: 'Piano (keys play the melody)', xl: 'Piano', cat: 'music', use: ['part'],
        needs: 'notes', why: 'needs the sung notes: find the words first (Song & words)',
        show: ['Piano_Type', 'Piano_StartMIDI', 'Piano_EndMIDI', 'Piano_ShowSharps', 'Piano_Scale'],
        defaults: { Piano_StartMIDI: 48, Piano_EndMIDI: 84 },
        labels: { Piano_Type: 'Look', Piano_StartMIDI: 'Lowest key', Piano_EndMIDI: 'Highest key', Piano_ShowSharps: 'Black keys (0/1)', Piano_Scale: 'Height %' },
        fixed: { Piano_MIDITrack_APPLYLAST: NOTE_TRACK },
        trackOf: () => NOTE_TRACK,
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H, g = c.g, pal = c.pal;
                const s = Math.round(+o.Piano_StartMIDI || 60);
                let e = Math.max(s, Math.round(+o.Piano_EndMIDI || 72));
                if (e - s + 1 > W) e = s + W - 1;
                const down = new Set(notesNow(c.p, c.f).map(n => fold(n, s, e)));
                const wk = pal[0] || [255, 255, 255], bk = pal[1] || [0, 0, 0], wkd = pal[2] || [255, 0, 255], bkd = pal[3] || [255, 0, 255], kb = pal[4] || [192, 192, 192];
                const sharps = +o.Piano_ShowSharps, sc = (+o.Piano_Scale || 100) / 100;
                const box = (x0, y0, x1, y1, cc) => { for (let y = Math.max(0, Math.trunc(y0)); y <= Math.min(H - 1, Math.trunc(y1)); y++) for (let x = Math.max(0, Math.trunc(x0)); x <= Math.min(W - 1, Math.trunc(x1)); x++) setPx(g, W, H, x, y, cc); };
                if (o.Piano_Type === 'Bars') {
                    let kc = 0; for (let i = s; i <= e; i++) if (sharps || !isSharp(i)) kc++;
                    const w = W / Math.max(1, kc), wkh = sharps ? H * 2 * sc / 3 : H, bkb = H * sc / 3;
                    let x = 0;
                    for (let i = s; i <= e; i++) {
                        if (!isSharp(i)) { box(x, 0, x + w - 1, wkh, down.has(i) ? wkd : wk); x += w; }
                        else if (sharps) { box(x, bkb, x + w - 1, H * sc, down.has(i) ? bkd : bk); x += w; }
                    }
                    return;
                }
                let wc = 0; for (let i = s; i <= e; i++) if (!isSharp(i)) wc++;
                const fw = W / Math.max(1, wc); let w = fw;
                const border = w > 3; if (border) w--;
                let x = 0;
                for (let i = s; i <= e; i++) if (!isSharp(i)) { box(x, 0, x + w, H * sc, down.has(i) ? wkd : wk); x += fw; }
                if (border) for (let j = 0, xx = fw; j < wc; j++, xx += fw) drawLine(g, W, H, xx, 0, xx, H * sc, kb);
                if (sharps) {
                    const adj = Math.round(0.15 * fw);
                    x = isSharp(s) ? -fw / 2 : isSharp(s + 1) ? fw / 2 : fw + fw / 2;
                    for (let i = s; i <= e; i++) if (isSharp(i)) { box(x + adj, H * sc / 2, Math.min(wc * fw, x + fw - adj), H * sc, down.has(i) ? bkd : bk); x += !isSharp(i + 1) && !isSharp(i + 2) ? 2 * fw : fw; }
                }
            },
        },
        rand: R => ({ Piano_Type: R.pick(['True Piano', 'True Piano', 'Bars']), Piano_StartMIDI: 48, Piano_EndMIDI: 84, Piano_ShowSharps: 1, Piano_Scale: 100 }),
    });

    const GUITARS = { Guitar: [40, 45, 50, 55, 59, 64], 'Bass Guitar': [28, 33, 38, 43], Banjo: [62, 50, 55, 59, 62], Violin: [55, 62, 69, 76] };
    metaFx({
        id: 'guitar', label: 'Guitar (strings play the melody)', xl: 'Guitar', cat: 'music', use: ['part'],
        needs: 'notes', why: 'needs the sung notes: find the words first (Song & words)',
        show: ['Guitar_Type', 'StringAppearance', 'MaxFrets', 'ShowStrings', 'Fade'],
        labels: { Guitar_Type: 'Instrument', StringAppearance: 'Strings', MaxFrets: 'Frets', ShowStrings: 'Show all strings (0/1)', Fade: 'Fade (0/1)' },
        fixed: { Guitar_MIDITrack_APPLYLAST: NOTE_TRACK },
        trackOf: () => NOTE_TRACK,
        legacy: {
            BaseWaveFactor: { before: '2026.05.2', write: v => ['E_SLIDER_BaseWaveFactor', Math.round((+v || 1) * 10)] },
            StringWaveFactor: { before: '2026.05.2', write: v => ['E_SLIDER_StringWaveFactor', Math.round((+v || 0) * 10)] },
        },
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H, g = c.g, pal = c.pal;
                const tune = GUITARS[o.Guitar_Type] || GUITARS.Guitar, frets = Math.max(8, Math.round(+o.MaxFrets || 19));
                const ns = tune.length, sh = H / ns;
                if (+o.ShowStrings) for (let s = 0; s < ns; s++) drawLine(g, W, H, 0, Math.trunc(s * sh + sh / 2), W - 1, Math.trunc(s * sh + sh / 2), pal[1] || [40, 40, 40]);
                for (const n of notesNow(c.p, c.f)) {
                    let si = -1;
                    for (let s = ns - 1; s >= 0; s--) if (n >= tune[s] && n - tune[s] <= frets) { si = s; break; }
                    if (si < 0) continue;
                    const fret = n - tune[si], x0 = Math.trunc(W * fret / (frets + 1)), y = Math.trunc(si * sh + sh / 2);
                    for (let x = x0; x < W; x++) {
                        const yy = o.StringAppearance === 'Wave' ? y + Math.round(Math.sin((x - x0) * 0.8 + c.f * 1.3) * Math.min(2, sh / 3)) : y;
                        setPx(g, W, H, x, yy, pal[si % pal.length]);
                    }
                }
            },
        },
        rand: R => ({ Guitar_Type: R.weighted({ Guitar: 4, 'Bass Guitar': 1, Violin: 1 }), StringAppearance: R.pick(['On', 'Wave']), MaxFrets: 19, ShowStrings: R.chance(0.5) ? 1 : 0, Fade: 0 }),
    });

    // =====================================================================
    // Text (TextEffect): any words, still or moving
    // =====================================================================
    const TEXT_DIRS = ['none', 'left', 'right', 'up', 'down', 'up-left', 'down-left', 'up-right', 'down-right', 'wavey', 'left-right', 'up-down'];
    metaFx({
        id: 'text', label: 'Text (any words)', xl: 'Text', cat: 'media', use: ['part', 'hit'], random: false, why: 'needs the words to show; type them in the row',
        show: ['Text', 'fontSize', 'Text_Dir', 'Text_Speed', 'TextToCenter', 'Text_Effect'],
        extraOptions: ['fontSize'],
        defaults: { Text: 'Merry Christmas', fontSize: 12, Text_Dir: 'left', Text_Speed: 10, TextToCenter: 1 },
        choices: { Text_Dir: TEXT_DIRS, Text_Effect: ['normal', 'vert text up', 'vert text down'] },
        labels: { Text: 'Words', fontSize: 'Text size', Text_Dir: 'Moves', Text_Speed: 'Speed', TextToCenter: 'Centered (0/1)', Text_Effect: 'Letters' },
        kinds: { Text: 's' },
        skip: ['Text_Font', 'Text_LyricTrack', 'Text_Font_XL_Row', 'Text_File_Row'],
        // 'Use OS Fonts' is the only safe font choice (any other value is looked up as a bitmap font)
        extra: o => ['E_CHOICE_Text_Font=Use OS Fonts', `E_FONTPICKER_Text_Font=Arial Black ${Math.max(4, Math.round(+o.fontSize || 12))}`, 'E_CHOICE_Text_Count=none'],
        render(p, N, out) {
            const o = p.o, word = String(o.Text || '');
            if (!word || typeof document === 'undefined') return;
            for (const b of buffers(N)) {
                const W = b.W, H = b.H, pt = Math.max(4, Math.round(+o.fontSize || 12));
                const m = U.textMask(word, Math.max(W, Math.round(word.length * pt * 0.75) + W), H, pt);
                const speed = +o.Text_Speed || 10, dir = o.Text_Dir || 'none', t = p.sec * speed * 2;
                const tw = m.textW || m.w;
                let dx = 0, dy = 0;
                const span = W + tw;
                if (/left/.test(dir) && dir !== 'left-right') dx = W / 2 + tw / 2 - (t % span);
                if (/right/.test(dir) && dir !== 'left-right') dx = -(W / 2 + tw / 2) + (t % span);
                if (dir === 'left-right') dx = Math.sin(t / Math.max(8, W) * Math.PI) * W / 3;
                if (/^up/.test(dir) && dir !== 'up-down') dy = -(H / 2 + pt / 2) + (t % (H + pt));
                if (/^down/.test(dir)) dy = H / 2 + pt / 2 - (t % (H + pt));
                if (dir === 'up-down') dy = Math.sin(t / Math.max(8, H) * Math.PI) * H / 3;
                const one = k => {
                    const x = Math.round(N.u[k] * (W - 1) - dx + (m.w - W) / 2), y = Math.round((1 - N.v[k]) * (H - 1) + dy + (dir === 'wavey' ? Math.sin(N.u[k] * 6 + t * 0.3) * 2 : 0));
                    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
                    const a = m.data[y * m.w + x];
                    if (a) palPick(p.pal, 0, out, 3 * k, a);
                };
                if (b.idx) b.idx.forEach(one); else for (let k = 0; k < N.n; k++) one(k);
            }
        },
    });

    // =====================================================================
    // Single Strand, Skips (SingleStrandEffect::RenderSingleStrandSkips)
    // =====================================================================
    const SKIP_DIRS = ['Left', 'Right', 'From Middle', 'To Middle'];
    metaFx({
        id: 'skips', label: 'Skips (bands stepping along)', xl: 'SingleStrand', cat: 'move', use: ['part'],
        show: ['Skips_BandSize', 'Skips_SkipSize', 'Skips_StartPos', 'Skips_Advance', 'Skips_Direction'],
        defaults: { Skips_BandSize: 2, Skips_SkipSize: 2, Skips_Advance: 10 },
        labels: { Skips_BandSize: 'Band size', Skips_SkipSize: 'Gap', Skips_StartPos: 'Start at', Skips_Advance: 'Steps', Skips_Direction: 'Moves' },
        skip: ['SingleStrand_TimingTrack', 'SingleStrand_FX', 'SingleStrand_FX_Palette'],
        extra: () => ['E_NOTEBOOK_SSEFFECT_TYPE=Skips'],
        perModel: true,
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H, pal = c.pal, cnt = pal.length;
                const band = Math.max(1, Math.round(+o.Skips_BandSize || 1)), skip = Math.max(0, Math.round(+o.Skips_SkipSize || 0)), adv = Math.round(+o.Skips_Advance || 0);
                const dir = ['Right', 'Left', 'From Middle', 'To Middle'].indexOf(o.Skips_Direction);
                let max = W; if (dir > 1) max = Math.trunc((max + 1) / 2);
                let x = Math.round(+o.Skips_StartPos || 1) - 1;
                x += Math.trunc(c.pos * (adv + 1) * 0.99) * band;
                while (x > max) x -= (band + skip) * cnt;
                const col = (xx, cc) => {
                    let second = -1, mx;
                    switch (Math.max(0, dir)) { case 0: mx = xx; break; case 1: mx = max - xx - 1; break; case 2: second = max + xx; mx = max - xx - 1; break; case 3: second = max * 2 - xx - 1; mx = xx; break; }
                    for (const X of [mx, second]) if (X >= 0 && X < W) for (let y = 0; y < H; y++) setPx(c.g, W, H, X, y, cc);
                };
                const first = x;
                let ci = 0;
                while (x < max) { const cc = pal[ci]; ci = (ci + 1) % cnt; for (let k = 0; k < band && x < max; k++) { col(x, cc); x++; } x += skip; }
                ci = cnt - 1; x = first - 1;
                while (x >= 0) { x -= skip; const cc = pal[ci]; ci = (ci - 1 + cnt) % cnt; for (let k = 0; k < band && x >= 0; k++) { col(x, cc); x--; } }
            },
        },
        rand: (R, c) => ({ Skips_BandSize: R.ibetween(1, 4), Skips_SkipSize: R.ibetween(1, 4), Skips_StartPos: 1, Skips_Advance: Math.max(2, Math.round(c.bars * R.pick([2, 4]) * c.fast)), Skips_Direction: R.pick(SKIP_DIRS) }),
    });

    // =====================================================================
    // Single Strand FX (WLED's strip effects, xLights FX.cpp): 118 patterns.
    // The preview draws each one's family (chase, sparkle, fire, rainbow...).
    // =====================================================================
    const WLED = ['Solid', 'Blink', 'Breathe', 'Wipe', 'Wipe Random', 'Random Colors', 'Sweep', 'Dynamic', 'Colorloop', 'Rainbow', 'Scan', 'Scan Dual', 'Fade', 'Theater', 'Theater Rainbow', 'Running', 'Saw', 'Twinkle', 'Dissolve', 'Dissolve Rnd', 'Sparkle', 'Sparkle Dark', 'Sparkle+', 'Strobe', 'Strobe Rainbow', 'Strobe Mega', 'Blink Rainbow', 'Android', 'Chase', 'Chase Random', 'Chase Rainbow', 'Chase Flash', 'Chase Flash Rnd', 'Rainbow Runner', 'Colorful', 'Traffic Light', 'Sweep Random', 'Chase 2', 'Aurora', 'Stream', 'Scanner', 'Lighthouse', 'Fireworks', 'Rain', 'Tetrix', 'Fire Flicker', 'Gradient', 'Loading', 'Police', 'Fairy', 'Two Dots', 'Fairytwinkle', 'Running Dual', 'Halloween', 'Chase 3', 'Tri Wipe', 'Tri Fade', 'Lightning', 'ICU', 'Multi Comet', 'Scanner Dual', 'Stream 2', 'Oscillate', 'Pride 2015', 'Juggle', 'Palette', 'Fire 2012', 'Colorwaves', 'Bpm', 'Fill Noise', 'Noise 1', 'Noise 2', 'Noise 3', 'Noise 4', 'Colortwinkles', 'Lake', 'Meteor', 'Meteor Smooth', 'Railway', 'Ripple', 'Twinklefox', 'Twinklecat', 'Halloween Eyes', 'Solid Pattern', 'Solid Pattern Tri', 'Spots', 'Spots Fade', 'Glitter', 'Candle', 'Fireworks Starburst', 'Fireworks 1D', 'Bouncing Balls', 'Sinelon', 'Sinelon Dual', 'Sinelon Rainbow', 'Popcorn', 'Drip', 'Plasma', 'Percent', 'Ripple Rainbow', 'Heartbeat', 'Pacifica', 'Candle Multi', 'Solid Glitter', 'Sunrise', 'Phased', 'Twinkleup', 'Noise Pal', 'Sine', 'Phased Noise', 'Flow', 'Chunchun', 'Dancing Shadows', 'Washing Machine', 'Candy Cane', 'Blends', 'TV Simulator', 'Dynamic Smooth'];
    // measured in xLights (100-light strip, palette red/green/blue): % of lights lit, mean brightness;
    // and this preview's own mean before correction
    const WLED_XL = {"Solid":[99.6,253.9,255], "Blink":[99.6,253.9,63.8], "Breathe":[99.6,251.9,148.1], "Wipe":[99.6,253.9,255], "Wipe Random":[99.6,253.9,255], "Random Colors":[99.6,252.6,38.4], "Sweep":[99.6,253.9,255], "Dynamic":[99.6,253.9,38.4], "Colorloop":[99.6,253.9,382.5], "Rainbow":[99.6,253.9,382.5], "Scan":[99.6,253.9,15.4], "Scan Dual":[99.6,253.9,22.4], "Fade":[99.6,252,148.1], "Theater":[99.6,253.9,110.3], "Theater Rainbow":[99.6,253.9,382.5], "Running":[99.6,252.1,110.3], "Saw":[99.6,252.1,255], "Twinkle":[99.6,253.9,38.4], "Dissolve":[94.2,240.1,38.4], "Dissolve Rnd":[94.4,240.7,38.4], "Sparkle":[99.6,253.9,38.4], "Sparkle Dark":[99.6,253.9,38.4], "Sparkle+":[99.6,253.9,38.4], "Strobe":[99.6,253.9,63.8], "Strobe Rainbow":[99.6,253.9,382.5], "Strobe Mega":[99.6,253.9,63.8], "Blink Rainbow":[99.6,253.9,382.5], "Android":[99.6,253.9,255], "Chase":[99.6,253.9,110.3], "Chase Random":[99.6,253.9,110.3], "Chase Rainbow":[99.6,253.9,382.5], "Chase Flash":[99.6,253.9,110.3], "Chase Flash Rnd":[10.7,27.2,110.3], "Rainbow Runner":[99.6,253.9,382.5], "Colorful":[99.6,309,255], "Traffic Light":[99.6,253.9,63.8], "Sweep Random":[99.6,253.9,255], "Chase 2":[99.6,253.9,110.3], "Aurora":[8.1,32.4,255], "Stream":[6.9,17.5,255], "Scanner":[85.2,141.7,15.4], "Lighthouse":[92.3,223.2,15.4], "Fireworks":[13.1,21,15.5], "Rain":[1.3,2.7,15.5], "Tetrix":[99.6,253.9,255], "Fire Flicker":[97.1,234.6,276.9], "Gradient":[99.6,252,255], "Loading":[99.6,252,255], "Police":[99.6,253.9,63.8], "Fairy":[99.6,220.3,38.4], "Two Dots":[99.6,253.9,22.4], "Fairytwinkle":[99.6,253.7,38.4], "Running Dual":[99.6,251.4,110.3], "Halloween":[99.6,246.6,255], "Chase 3":[99.6,253.9,110.3], "Tri Wipe":[99.6,253.9,255], "Tri Fade":[99.6,252,148.1], "Lightning":[99.2,252.3,63.8], "ICU":[99.6,253.9,15.4], "Multi Comet":[21.3,45.9,15.4], "Scanner Dual":[92.8,184.9,22.4], "Stream 2":[2.3,5.2,255], "Oscillate":[29.5,75.2,15.4], "Pride 2015":[99.3,218.3,382.5], "Juggle":[73.9,389.1,15.4], "Palette":[99.6,250.5,255], "Fire 2012":[50.4,124.3,276.9], "Colorwaves":[65.6,96.4,255], "Bpm":[75.4,124.8,15.4], "Fill Noise":[99.6,267.2,255], "Noise 1":[99.6,301.5,255], "Noise 2":[99.6,181.2,255], "Noise 3":[46.3,89.9,255], "Noise 4":[65.9,129.1,255], "Colortwinkles":[29.2,65.8,38.4], "Lake":[60.9,81.1,255], "Meteor":[99.1,251.3,15.4], "Meteor Smooth":[77.7,195,15.4], "Railway":[99.6,251.5,255], "Ripple":[99.6,253.2,15.5], "Twinklefox":[41.2,80.8,38.4], "Twinklecat":[41.1,80.5,38.4], "Halloween Eyes":[99.6,253.9,38.4], "Solid Pattern":[99.6,253.9,255], "Solid Pattern Tri":[99.6,253.9,255], "Spots":[99.6,252.9,38.4], "Spots Fade":[99.6,252.9,38.4], "Glitter":[99.6,265,38.4], "Candle":[99.6,251.9,276.9], "Fireworks Starburst":[99.6,269.8,15.5], "Fireworks 1D":[8.5,19.1,15.5], "Bouncing Balls":[3.4,8.6,15.5], "Sinelon":[66.6,111,255], "Sinelon Dual":[90.5,166,255], "Sinelon Rainbow":[63.3,107.1,382.5], "Popcorn":[2.6,6.8,15.5], "Drip":[98.7,248.1,15.5], "Plasma":[65.9,86.5,255], "Percent":[99.6,253.9,148.1], "Ripple Rainbow":[12.2,34.3,382.5], "Heartbeat":[99.6,252.2,63.8], "Pacifica":[32.1,52.2,255], "Candle Multi":[99.6,252,276.9], "Solid Glitter":[99.6,256.4,38.4], "Sunrise":[32.2,60.7,148.1], "Phased":[99.6,252.9,255], "Twinkleup":[99.6,253,38.4], "Noise Pal":[1.7,4.1,255], "Sine":[99.6,252.2,255], "Phased Noise":[99.6,252.9,255], "Flow":[99.6,259.4,255], "Chunchun":[99.6,253.9,15.4], "Dancing Shadows":[56.8,96.3,255], "Washing Machine":[99.6,250.7,15.4], "Candy Cane":[99.6,508.7,255], "Blends":[99.6,240.3,255], "TV Simulator":[75.4,112.2,255], "Dynamic Smooth":[97.9,203.7,38.4]};
    const wledFamily = n => /Twinkle|Sparkle|Glitter|Dissolve|Fairy|Colortwinkles|Random Colors|Dynamic|Spots|Halloween Eyes/.test(n) ? 'sparkle'
        : /Fire|Candle/.test(n) && !/Fireworks/.test(n) ? 'fire'
            : /Rainbow|Colorloop|Pride|Palette|Colorwaves|Phased|Flow|Blends|Gradient|Sine/.test(n) ? 'flow'
                : /Noise|Lake|Pacifica|Aurora|Plasma|Dancing|TV/.test(n) ? 'noise'
                    : /Meteor|Comet|Scan|Sinelon|Lighthouse|ICU|Two Dots|Juggle|Oscillate|Bpm|Chunchun|Washing/.test(n) ? 'dot'
                        : /Strobe|Blink|Lightning|Police|Heartbeat|Traffic/.test(n) ? 'flash'
                            : /Breathe|Fade|Sunrise|Percent/.test(n) ? 'breathe'
                                : /Wipe|Sweep|Loading|Tetrix|Tri /.test(n) ? 'wipe'
                                    : /Fireworks|Rain|Popcorn|Drip|Bouncing|Ripple|Starburst/.test(n) ? 'drops'
                                        : /Solid|Pattern|Candy Cane|Railway|Halloween|Android|Colorful|Stream|Saw/.test(n) && !/Chase/.test(n) ? 'pattern'
                                            : 'chase';
    metaFx({
        id: 'ssfx', label: 'Strip FX (WLED patterns)', xl: 'SingleStrand', cat: 'move', use: ['part'], everyWeight: 2,
        show: ['SingleStrand_FX', 'FX_Speed', 'FX_Intensity'],
        defaults: { SingleStrand_FX: 'Theater' },
        choices: { SingleStrand_FX: WLED },
        labels: { SingleStrand_FX: 'Pattern', FX_Speed: 'Speed', FX_Intensity: 'Intensity' },
        skip: ['SingleStrand_TimingTrack', 'SingleStrand_FX_Palette'],
        extra: () => ['E_NOTEBOOK_SSEFFECT_TYPE=FX', 'E_CHOICE_SingleStrand_FX_Palette=Default'],
        perModel: true,
        grid: {
            draw(c) {
                const o = c.o, W = c.W, H = c.H, pal = c.pal, n = pal.length, name = o.SingleStrand_FX || 'Blink';
                const fam = wledFamily(name), spd = (+o.FX_Speed || 128) / 128, inten = (+o.FX_Intensity || 128) / 255, t = c.f / FPS * spd;
                const col = [0, 0, 0];
                // WLED paints the palette's 2nd color as the background of most patterns;
                // the others are brought to the brightness xLights gives them
                const st = WLED_XL[name], bgOn = st && st[0] > 90 && n > 1, gain = st && !bgOn ? Math.max(0.05, Math.min(30, st[1] / Math.max(1, st[2]))) : 1, bg = pal[1];
                const put = (x, cc, b = 1) => {
                    let r, g2, bl;
                    if (bgOn) { r = cc[0] * b + bg[0] * (1 - b); g2 = cc[1] * b + bg[1] * (1 - b); bl = cc[2] * b + bg[2] * (1 - b); }
                    else { const k = Math.min(1, b * gain) ; r = Math.min(255, cc[0] * b * gain); g2 = Math.min(255, cc[1] * b * gain); bl = Math.min(255, cc[2] * b * gain); if (k < 0) r = g2 = bl = 0; }
                    for (let y = 0; y < H; y++) setPx(c.g, W, H, x, y, [r, g2, bl]);
                };
                for (let x = 0; x < W; x++) {
                    const u = W > 1 ? x / (W - 1) : 0, hsh = U.hash(x * 7919 + 13);
                    switch (fam) {
                        case 'sparkle': { const ph = frac(t * (0.5 + hsh) + hsh * 9); put(x, pal[Math.floor(hsh * 97) % n], ph < inten * 0.6 ? 1 - ph / (inten * 0.6) : 0); break; }
                        case 'fire': put(x, [255, 80 + 120 * U.hash(x * 31 + c.f * 7), 0], 0.4 + 0.6 * U.hash(x * 13 + Math.floor(c.f / 2) * 97)); break;
                        case 'flow': put(x, /Rainbow|Pride|Colorloop/.test(name) ? hsv2rgb(frac(u + t * 0.3), 1, 1, col) : multiBlend(pal, frac(u + t * 0.3), true, col)); break;
                        case 'noise': put(x, multiBlend(pal, noise2(u * 4 + t, t * 0.5), true, col)); break;
                        case 'dot': { const p = Math.abs(1 - 2 * frac(t * 0.4)), d = Math.abs(u - p) * W; put(x, pal[0], d < 1 ? 1 : Math.max(0, 1 - d / (2 + inten * 8))); if (/Dual|Two/.test(name)) { const d2 = Math.abs(u - (1 - p)) * W; if (d2 < 3) put(x, pal[1 % n], 1 - d2 / 3); } break; }
                        case 'flash': put(x, pal[Math.floor(t * 2) % n], frac(t * 3) < 0.25 ? 1 : 0); break;
                        case 'breathe': put(x, pal[0], 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * 2))); break;
                        case 'wipe': { const p = frac(t * 0.3) * 2, k = Math.floor(t * 0.3); put(x, pal[(u < p % 1 || p >= 1 && u >= p - 1 ? k + 1 : k) % n]); break; }
                        case 'drops': { const ph = frac(t * 0.7 + hsh * 5); put(x, pal[Math.floor(hsh * 31) % n], hsh < inten * 0.4 ? Math.max(0, 1 - ph * 2) : 0); break; }
                        case 'pattern': put(x, pal[Math.floor(x / Math.max(1, Math.round(1 + inten * 4))) % n]); break;
                        default: { const k = Math.floor(x - t * 10); put(x, pal[((Math.floor(k / 3) % n) + n) % n], ((k % 3) + 3) % 3 === 0 ? 1 : 0.15); }
                    }
                }
            },
        },
        rand: R => ({ SingleStrand_FX: R.pick(['Theater', 'Running', 'Chase', 'Twinkle', 'Sparkle', 'Rainbow', 'Colorwaves', 'Meteor', 'Scanner', 'Fire Flicker', 'Candy Cane', 'Juggle', 'Pacifica', 'Bouncing Balls', 'Popcorn', 'Lake', 'Fireworks 1D', 'Sinelon', 'Dancing Shadows', 'Phased']), FX_Speed: R.ibetween(90, 180), FX_Intensity: R.ibetween(90, 200) }),
    });

    // =====================================================================
    // State (StateEffect): lights the parts of a prop named in its state list
    // =====================================================================
    metaFx({
        id: 'state', label: 'State (parts of a prop by name)', xl: 'State', cat: 'media', use: ['part', 'vocal'], random: false, why: 'needs a prop with states set up in xLights (like a clock or a sign); choose one in the row',
        show: ['State_StateDefinition', 'State_State', 'State_Color', 'State_Fade_Time'],
        extraOptions: ['State_State'],
        dynChoices: { State_StateDefinition: 'states', State_State: 'stateNames' },
        defaults: { State_StateDefinition: '', State_State: '' },
        labels: { State_StateDefinition: 'State list', State_State: 'Show', State_Color: 'Colors', State_Fade_Time: 'Fade (ms)' },
        skip: ['State_StateSource', 'State_Mode'],
        extra: o => ['E_CHOICE_State_Mode=Default', `E_CHOICE_State_State=${String(o.State_State || '').replace(/,/g, '&comma;')}`],
        render(p, N, out) {
            const model = p.model;
            if (!model || !model.states) return;
            const def = model.states.find(s => s.name === p.o.State_StateDefinition) || model.states[0];
            if (!def) return;
            const want = p.o.State_State;
            const list = def.list.filter(s => !want || s.name === want || s.key === want);
            const set = new Map();
            list.forEach((s, i) => { for (const nd of s.nodes) set.set(nd, i); });
            for (let k = 0; k < N.n; k++) {
                const gi = N.g[k] - model.offset;
                if (!set.has(gi)) continue;
                const s = list[set.get(gi)];
                if (s.color && p.o.State_Color !== 'Cycle') { const c = Effects.hexToRgb(s.color); out[3 * k] = c[0]; out[3 * k + 1] = c[1]; out[3 * k + 2] = c[2]; }
                else palPick(p.pal, set.get(gi), out, 3 * k);
            }
        },
    });

    // =====================================================================
    // DMX (DMXEffect): raw channel values for DMX fixtures
    // =====================================================================
    const DMX_CH = 12;
    Effects.add({
        id: 'dmx', label: 'DMX channels', xl: 'DMX', cat: 'dmx', use: ['part'], random: false, anyModel: true, why: 'sets raw channel values of DMX fixtures; set them in the row',
        options: Object.fromEntries(Array.from({ length: DMX_CH }, (_, i) => ['DMX' + (i + 1), 0])),
        labels: Object.fromEntries(Array.from({ length: DMX_CH }, (_, i) => ['DMX' + (i + 1), 'Channel ' + (i + 1)])),
        ranges: Object.fromEntries(Array.from({ length: DMX_CH }, (_, i) => ['DMX' + (i + 1), [0, 255]])),
        settings: o => Array.from({ length: DMX_CH }, (_, i) => `E_SLIDER_DMX${i + 1}=${Math.max(0, Math.min(255, Math.round(+o['DMX' + (i + 1)] || 0)))}`).join(','),
        render(p, N, out) {
            // the values go straight into the fixture's channels, in order
            for (let i = 0; i < DMX_CH && i < 3 * N.n; i++) out[i] = Math.max(0, Math.min(255, +p.o['DMX' + (i + 1)] || 0));
        },
    });

    // =====================================================================
    // Servo (ServoEffect): moves a servo from one position to another
    // =====================================================================
    Effects.add({
        id: 'servo', label: 'Servo (move a servo)', xl: 'Servo', cat: 'dmx', use: ['part'], random: false, anyModel: true, why: 'moves servos on DMX servo props; set the channel and positions in the row',
        options: { Channel: '', start: 0, end: 100, bit16: 1 },
        kinds: { Channel: 's' },
        labels: { Channel: 'Servo channel (as named in xLights)', start: 'From %', end: 'To %', bit16: '16 bit (0/1)' },
        settings: o => [`E_CHOICE_Channel=${String(o.Channel || '').replace(/,/g, '&comma;')}`, `E_CHECKBOX_16bit=${+o.bit16 ? 1 : 0}`, 'E_CHECKBOX_Timing_Track=0',
            +o.start === +o.end ? `E_TEXTCTRL_Servo=${(+o.start || 0).toFixed(1)}` : Effects.curveString('E', 'Servo', { type: 'Ramp', min: 0, max: 100, p1: +o.start || 0, p2: +o.end || 0 })].join(','),
        render() { },
    });

    // =====================================================================
    // Sketch (SketchEffect): a drawing made in xLights' sketch editor
    // =====================================================================
    Effects.add({
        id: 'sketch', label: 'Sketch (a drawing)', xl: 'Sketch', cat: 'media', use: ['part'], random: false, why: 'needs a drawing made in xLights; paste its sketch definition in the row',
        options: { def: '', DrawPercentage: 40, Thickness: 1, MotionEnabled: 0, MotionPercentage: 100 },
        kinds: { def: 's' },
        labels: { def: 'Sketch definition (copied from xLights)', DrawPercentage: 'Drawn %', Thickness: 'Thickness', MotionEnabled: 'Moving (0/1)', MotionPercentage: 'Motion %' },
        settings: o => [`E_TEXTCTRL_SketchDef=${String(o.def || '').replace(/,/g, '&comma;')}`, `E_SLIDER_DrawPercentage=${Math.round(+o.DrawPercentage || 0)}`, `E_SLIDER_Thickness=${Math.max(1, Math.round(+o.Thickness || 1))}`, `E_CHECKBOX_MotionEnabled=${+o.MotionEnabled ? 1 : 0}`, `E_SLIDER_MotionPercentage=${Math.round(+o.MotionPercentage || 100)}`].join(','),
        // the sketch's paths: "x,y" points in 0..1 after the first ';', segments separated by ';'
        render(p, N, out) {
            const def = String(p.o.def || '');
            const pts = [...def.matchAll(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g)].map(m => [+m[1], +m[2]]).filter(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
            if (pts.length < 2) return;
            const upto = Math.max(2, Math.round(pts.length * clamp01(p.t * 100 / Math.max(1, +p.o.DrawPercentage || 40))));
            for (let k = 0; k < N.n; k++) {
                let best = 1;
                for (let i = 1; i < upto; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1e-9, t = clamp01(((N.u[k] - ax) * dx + ((1 - N.v[k]) - ay) * dy) / l); best = Math.min(best, Math.hypot(N.u[k] - ax - t * dx, (1 - N.v[k]) - ay - t * dy)); }
                if (best < 0.04 * Math.max(1, +p.o.Thickness || 1)) palPick(p.pal, 0, out, 3 * k);
            }
        },
    });

    // =====================================================================
    // Glediator (GlediatorEffect): plays a Glediator / Jinx recording (.gled)
    // =====================================================================
    Effects.add({
        id: 'glediator', label: 'Glediator recording', xl: 'Glediator', cat: 'media', use: ['part'], random: false, why: 'plays a Glediator recording (.gled) from your show folder; choose it in the row',
        options: { file: '', treatment: 'Normal' },
        kinds: { file: 'file' }, fileTypes: { file: ['.gled', '.out', '.csv'] },
        choices: { treatment: ['Normal', 'Loop', 'Slow/Accelerate'] },
        labels: { file: 'Recording', treatment: 'Timing' },
        settings: o => [`E_FILEPICKERCTRL_Glediator_Filename=${String(o.file || '').replace(/,/g, '&comma;')}`, `E_CHOICE_Glediator_DurationTreatment=${o.treatment || 'Normal'}`].join(','),
        render(p, N, out) { if (p.o.file) Effects.get('glow').render(p, N, out); },
    });

    // =====================================================================
    // Pictures, Video and Shader: now chosen by hand too (they were only
    // drawn for imported sequences). The file comes from the show folder.
    // =====================================================================
    const PIC_DIRS = ['none', 'left', 'right', 'up', 'down', 'up-left', 'down-left', 'up-right', 'down-right', 'peekaboo', 'wiggle', 'zoom in', 'flag wave', 'up once', 'down once'];
    const esc2 = v => String(v || '').replace(/,/g, '&comma;');
    {
        const pic = Effects.get('pictures');
        Effects.add({
            ...pic, use: ['part'], random: false, cat: 'media', why: 'shows a picture from your show folder; choose it in the row',
            options: { file: '', scaling: 'Scale To Fit', direction: 'none', speed: 1 },
            kinds: { file: 'file' }, fileTypes: { file: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'] },
            choices: { scaling: ['Scale To Fit', 'Scale Keep Aspect Ratio', 'No Scaling'], direction: PIC_DIRS },
            labels: { file: 'Picture', scaling: 'Fit', direction: 'Moves', speed: 'Speed' },
            settings: o => [`E_TEXTCTRL_Pictures_Filename=${esc2(o.file)}`, `E_CHOICE_Scaling=${o.scaling || 'Scale To Fit'}`, `E_CHOICE_Pictures_Direction=${o.direction || 'none'}`, `E_TEXTCTRL_Pictures_Speed=${(+o.speed || 1).toFixed(1)}`, 'E_CHECKBOX_Pictures_PixelOffsets=0', 'E_CHECKBOX_LoopGIF=1', 'E_CHECKBOX_SuppressGIFBackground=1', 'E_SLIDER_PicturesXC=0', 'E_SLIDER_PicturesYC=0'].join(','),
            render(p, N, out) {
                const o = p.o, d = o.direction || 'none', s = p.sec * (+o.speed || 1) * 0.25;
                if (d === 'none') { pic.render(p, N, out); return; }
                // a moving picture: shift where each light looks into it
                const shift = { left: [s, 0], right: [-s, 0], up: [0, -s], down: [0, s], 'up-left': [s, -s], 'down-left': [s, s], 'up-right': [-s, -s], 'down-right': [-s, s] }[d] || [Math.sin(s * 6) * 0.1, 0];
                const M = { ...N, u: new Float32Array(N.n), v: new Float32Array(N.n) };
                for (let k = 0; k < N.n; k++) { M.u[k] = frac(N.u[k] + shift[0]); M.v[k] = frac(N.v[k] + shift[1]); }
                pic.render(p, M, out);
            },
        });
        const vid = Effects.get('video');
        Effects.add({
            ...vid, use: ['part'], random: false, cat: 'media', why: 'plays a video from your show folder; choose it in the row',
            options: { file: '', speed: 1, start: 0, loopLen: 0, cropL: 0, cropR: 100, cropT: 100, cropB: 0, treatment: 'Normal' },
            kinds: { file: 'file' }, fileTypes: { file: ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.mpg'] },
            choices: { treatment: ['Normal', 'Loop', 'Slow/Accelerate'] },
            labels: { file: 'Video', speed: 'Speed', start: 'Start at (s)', treatment: 'Timing', cropL: 'Crop left %', cropR: 'Crop right %', cropT: 'Crop top %', cropB: 'Crop bottom %' },
            settings: o => [`E_FILEPICKERCTRL_Video_Filename=${esc2(o.file)}`, `E_CHOICE_Video_DurationTreatment=${o.treatment || 'Normal'}`, `E_TEXTCTRL_Video_Speed=${(+o.speed || 1).toFixed(2)}`, `E_TEXTCTRL_Video_Starttime=${(+o.start || 0).toFixed(2)}`, `E_SLIDER_Video_CropLeft=${Math.round(+o.cropL || 0)}`, `E_SLIDER_Video_CropRight=${Math.round(o.cropR ?? 100)}`, `E_SLIDER_Video_CropTop=${Math.round(o.cropT ?? 100)}`, `E_SLIDER_Video_CropBottom=${Math.round(+o.cropB || 0)}`, 'E_CHECKBOX_Video_AspectRatio=0', 'E_CHECKBOX_SynchroniseWithAudio=0'].join(','),
        });
        const sh = Effects.get('shader');
        Effects.add({
            ...sh, use: ['part'], random: false, cat: 'media', why: 'runs a shader (.fs) from your show folder; choose it in the row',
            options: { file: '', speed: 100, leadIn: 0, offX: 0, offY: 0, zoom: 0 },
            kinds: { file: 'file' }, fileTypes: { file: ['.fs'] },
            labels: { file: 'Shader', speed: 'Speed %', leadIn: 'Lead in (frames)', offX: 'Offset left/right', offY: 'Offset up/down', zoom: 'Zoom' },
            settings: o => [`E_0FILEPICKERCTRL_IFS=${esc2(o.file)}`, `E_SLIDER_Shader_Speed=${Math.round(+o.speed || 100)}`, `E_TEXTCTRL_Shader_LeadIn=${Math.round(+o.leadIn || 0)}`, `E_TEXTCTRL_Shader_Offset_X=${Math.round(+o.offX || 0)}`, `E_TEXTCTRL_Shader_Offset_Y=${Math.round(+o.offY || 0)}`, `E_TEXTCTRL_Shader_Zoom=${Math.round(+o.zoom || 0)}`].join(','),
        });
    }

    // ---------- imported sequences: read an effect's own settings back ----------
    //
    // For the preview of an imported xLights effect: which effect here draws it,
    // and its options read from xLights' settings (value curves included).
    const IMPORT_EXTRA = {
        fill: (S, o, cv) => { const c = cv.Fill_Position; o.move = c ? (/Up\/Down/.test(c.type) ? 'fills then empties' : c.p2 >= c.p1 ? 'fills up' : 'empties') : 'stays full'; delete cv.Fill_Position; },
        circles: (S, o) => { const b = k => S['E_CHECKBOX_' + k] === '1'; o.style = b('Circles_Radial_3D') ? 'rainbow rings' : b('Circles_Radial') ? 'rings out' : b('Circles_Plasma') ? 'blobs' : b('Circles_Bubbles') ? 'bubbles' : b('Circles_Linear_Fade') ? 'fading balls' : b('Circles_Bounce') || b('Circles_Collide') ? 'bouncing balls' : 'balls'; },
        fireworks: (S, o) => { o.fireOn = S.E_CHECKBOX_FIRETIMING === '1' && S.E_CHOICE_FIRETIMINGTRACK ? S.E_CHOICE_FIRETIMINGTRACK : 'random times'; },
        shape: (S, o) => { o.shapeOn = S.E_CHECKBOX_Shape_FireTiming === '1' && S.E_CHOICE_Shape_FireTimingTrack ? S.E_CHOICE_Shape_FireTimingTrack : 'all the time'; },
        liquid: (S, o) => { const y = parseFloat(S.E_TEXTCTRL_Y1), x = parseFloat(S.E_TEXTCTRL_X1); o.spout = y >= 75 ? 'from the top' : y <= 25 ? 'from the bottom' : x <= 25 ? 'from the left' : x >= 75 ? 'from the right' : 'from the top'; },
        text: (S, o) => { const f = /(\d+)\s*$/.exec(S.E_FONTPICKER_Text_Font || ''); o.fontSize = f ? +f[1] : 12; },
        state: (S, o) => { o.State_State = S.E_CHOICE_State_State || ''; },
    };
    function metaImport(name, S) {
        let e = null;
        if (name === 'SingleStrand') { const t = S.E_NOTEBOOK_SSEFFECT_TYPE || 'Chase'; e = t === 'Skips' ? Effects.get('skips') : t === 'FX' ? Effects.get('ssfx') : null; }
        else if (name === 'VU Meter') e = /Timing Event/.test(S.E_CHOICE_VUMeter_Type || '') ? null : Effects.get('vumusic');
        else if (name === 'Text') e = S.E_CHOICE_Text_LyricTrack ? null : Effects.get('text');
        else e = Effects.LIST.find(x => x.meta && x.xl === name) || null;
        if (!e || !e.meta) return null;
        const o = {}, cv = {};
        for (const m of (typeof XLMeta !== 'undefined' && XLMeta[e.meta]) || []) {
            if (!(m.id in e.options)) continue;
            const keys = [m.key, 'E_SLIDER_' + m.id, 'E_TEXTCTRL_' + m.id, 'E_CHECKBOX_' + m.id, 'E_CHOICE_' + m.id, 'E_SPINCTRL_' + m.id];
            const k = keys.find(x => S[x] != null);
            if (k != null) {
                const v = S[k];
                if (m.k === 'b') o[m.id] = v === '1' || v === 'true' ? 1 : 0;
                else if (m.k === 'i' || m.k === 'f') { const n = parseFloat(v); if (!isNaN(n)) o[m.id] = k.startsWith('E_SLIDER_') && m.div > 1 && m.raw ? n / m.div : n; }
                else o[m.id] = String(v).replace(/&comma;/g, ',');
            }
            const c = U.parseCurve(S['E_VALUECURVE_' + m.id]);
            if (c) { c.scale = m.raw && m.div > 1 ? 1 / m.div : 1; cv[m.id] = c; }
        }
        if (IMPORT_EXTRA[e.id]) IMPORT_EXTRA[e.id](S, o, cv);
        return { id: e.id, o, curves: cv };
    }

    // On a group, shapes that belong to one prop run on each prop separately (as
    // Pinwheel and Shockwave do); washes and things that travel run across the yard.
    for (const id of ['fill', 'garlands', 'tree', 'life', 'lightning', 'lines', 'fire', 'candle', 'snowstorm', 'circles', 'galaxy', 'fireworks', 'shape', 'tendril', 'liquid', 'vumusic', 'music', 'piano', 'guitar', 'kaleidoscope', 'warp', 'skips', 'ssfx']) { const e = Effects.get(id); if (e) e.perModel = true; }

    Effects.more = { frameOf, cyclePos, multiBlend, hsv2rgb, rgb2hsv, rng, buffers, sample, gridRender, setPx, metaFx, ramp, upDown, capSize, drawLine, drawCircle, drawThickLine, atValue, FIRE_PAL, canvasRender, audioLevel, noteLevels, metaImport };
})();
