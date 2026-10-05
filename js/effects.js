'use strict';

// The effect library. Each effect has two halves that must agree:
//   * render(): an approximation drawn in the browser preview
//   * settings(): the xLights settings string written into the .xsq
// The settings strings are lifted from working effects in real sequences
// (an invented settings string renders nothing in xLights, silently).
//
// Renderers work in each row's buffer: every node has u,v in 0..1 (left->right,
// bottom->top) and its order k along the row. out[] receives r,g,b 0..255.
const Effects = (() => {
    const ADD = ',T_CHOICE_LayerMethod=Additive';
    // Row blends besides adding light. xLights' layer method on the upper layer
    // (PixelBuffer mixColors): "1 is Unmask" shows the layer below only where this
    // one is lit, at this one's brightness; "1 is Mask" cuts this one's shape out of it.
    const BLENDS = {
        add: { label: 'Add to the layers below', xl: 'Additive' },
        unmask: { label: 'Shape shows the colors below', xl: '1 is Unmask' },
        mask: { label: 'Shape cuts out of the layers below', xl: '1 is Mask' },
    };

    const frac = x => x - Math.floor(x);
    const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
    function hash(n) {
        n = (n ^ 61) ^ (n >>> 16);
        n = Math.imul(n, 9);
        n ^= n >>> 4;
        n = Math.imul(n, 0x27d4eb2d);
        n ^= n >>> 15;
        return (n >>> 0) / 4294967296;
    }

    // Smoothly through the palette; f in [0, n)
    function palBlend(pal, f, out, o, b = 1) {
        const n = pal.length;
        const i = ((Math.floor(f) % n) + n) % n, j = (i + 1) % n, w = f - Math.floor(f);
        const a = pal[i], c = pal[j];
        out[o] = (a[0] + (c[0] - a[0]) * w) * b;
        out[o + 1] = (a[1] + (c[1] - a[1]) * w) * b;
        out[o + 2] = (a[2] + (c[2] - a[2]) * w) * b;
    }
    function palPick(pal, i, out, o, b = 1) {
        const c = pal[((i % pal.length) + pal.length) % pal.length];
        out[o] = c[0] * b; out[o + 1] = c[1] * b; out[o + 2] = c[2] * b;
    }

    const fadeOf = (p, fin, fout) => {
        let b = 1;
        if (fin > 0) b = Math.min(b, p.sec / fin);
        if (fout > 0) b = Math.min(b, (p.dur - p.sec) / fout);
        return clamp01(b);
    };

    // xLights value curves (ValueCurve::RenderType) in real units (RV=TRUE):
    // Ramp p1->p2; Ramp Up/Down p1->p2 (middle)->p3; Ramp Up/Down Hold p1->p2,
    // held for p3% of the middle, ->p1; Saw Tooth p3 times p1->p2->p1; Sine.
    function curveAt(c, t) {
        const lerp = (a, b, f) => a + (b - a) * f;
        t = clamp01(t);
        switch (c.type) {
            case 'Ramp': return lerp(c.p1, c.p2, t);
            case 'Ramp Up/Down': return t < 0.5 ? lerp(c.p1, c.p2, t * 2) : lerp(c.p2, c.p3, (t - 0.5) * 2);
            case 'Ramp Up/Down Hold': {
                const a = 0.5 - 0.5 * c.p3 / 100, b = 0.5 + 0.5 * c.p3 / 100;
                return t < a ? lerp(c.p1, c.p2, a ? t / a : 1) : t <= b ? c.p2 : lerp(c.p2, c.p1, (t - b) / (1 - b || 1));
            }
            case 'Saw Tooth': { const n = Math.max(1, Math.round(c.p3)); const x = frac(t * n); return x < 0.5 ? lerp(c.p1, c.p2, x * 2) : lerp(c.p2, c.p1, (x - 0.5) * 2); }
            case 'Sine': return lerp(c.min, c.max, 0.5 + 0.5 * Math.sin(2 * Math.PI * t * Math.max(1, c.p3 || 1)));
            case 'Custom': {
                // Values=x:y;... with y 0..1 of min..max
                const v = c.values || [];
                if (!v.length) return c.min;
                if (t <= v[0][0]) return lerp(c.min, c.max, v[0][1]);
                for (let i = 1; i < v.length; i++) if (t <= v[i][0]) { const [x0, y0] = v[i - 1], [x1, y1] = v[i]; return lerp(c.min, c.max, y0 + (y1 - y0) * ((t - x0) / ((x1 - x0) || 1))); }
                return lerp(c.min, c.max, v[v.length - 1][1]);
            }
            case 'Flat': return c.p1;
        }
        return c.p1;
    }
    const f2 = v => (+v).toFixed(2);
    // E_VALUECURVE_<name>=Active=TRUE|Id=ID_VALUECURVE_<name>|Type=...|Min|Max|P1..|RV=TRUE|
    function curveString(prefix, name, c) {
        const ps = ['p1', 'p2', 'p3'].filter(k => c[k] != null && c[k] !== 0).map(k => `|P${k[1]}=${f2(c[k])}`).join('');
        return `${prefix}_VALUECURVE_${name}=Active=TRUE|Id=ID_VALUECURVE_${name}|Type=${c.type}|Min=${f2(c.min)}|Max=${f2(c.max)}${ps}|RV=TRUE|`;
    }
    // Pinwheel 3D styles (PinwheelEffect::adjustColor); x = 0..1 across the arm.
    const shade3d = (look, x) => look === '3D' ? 1 - Math.abs(x - 0.5) / 0.5 : look === '3D Inverted' ? Math.abs(x - 0.5) / 0.5 : look === 'Sweep' ? x : 1;
    const LOOKS = ['3D', 'None', '3D Inverted', 'Sweep'];
    // Moving arms / twist / centre over the effect (value curves).
    const PW_ARMS = { steady: null, grow: { type: 'Ramp', p1: 10, p2: 100 }, shrink: { type: 'Ramp', p1: 100, p2: 10 }, pulse: { type: 'Ramp Up/Down', p1: 15, p2: 100, p3: 15 } };
    const SP_TWIST = { steady: null, 'twist up': 'up', wobble: 'wobble' };
    const SW_MOVE = { still: null, rise: { type: 'Ramp', p1: 0, p2: 100 }, fall: { type: 'Ramp', p1: 100, p2: 0 }, bounce: { type: 'Ramp Up/Down Hold', p1: 0, p2: 50, p3: 40 } };
    const spCurve = o => {
        const r = Math.max(-300, Math.min(300, +o.rotation || 20));
        if (o.twistMove === 'twist up') return { type: 'Ramp', min: -300, max: 300, p1: r, p2: Math.max(-300, Math.min(300, r * 3)) };
        if (o.twistMove === 'wobble') return { type: 'Saw Tooth', min: -300, max: 300, p1: r, p2: -r, p3: 2 };
        return null;
    };

    // Fan_Revolutions is in degrees over the whole effect (slider max 3600).
    const fanRevs = o => Math.round(Math.max(0, Math.min(10, +o.turns || 0)) * 360);

    const fades = o => (o.fadeIn ? `,T_TEXTCTRL_Fadein=${o.fadeIn}` : '') + (o.fadeOut ? `,T_TEXTCTRL_Fadeout=${o.fadeOut}` : '');

    // How far out a shape's edge is at polar angle a (1 = circle), for Ripple.
    function shapeProfile(shape) {
        const poly = (n, rot) => a => { const s = 2 * Math.PI / n; const x = ((a - rot) % s + s) % s; return Math.cos(Math.PI / n) / Math.cos(x - s / 2); };
        const star = (n, inner) => a => { const s = 2 * Math.PI / n; const x = ((a - Math.PI / 2) % s + s) % s / s; return inner + (1 - inner) * Math.abs(1 - 2 * x); };
        switch (shape) {
            case 'Square': return poly(4, Math.PI / 4);
            case 'Triangle': return poly(3, Math.PI / 2);
            case 'Star': return star(5, 0.4);
            case 'Snow Flake': return star(6, 0.2);
            default: return () => 1;
        }
    }

    // Snowflake shapes (SnowflakesEffect types 1-9): [dx, dy, colour (1 centre, 2 edge)]
    const FLAKES = [
        [[0, 0, 1]],
        [[0, 0, 1], [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2]],
        [[0, 0, 1], [-1, 0, 2], [1, 0, 2]],
        [[0, 0, 1], [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2], [-2, 0, 2], [2, 0, 2], [0, -2, 2], [0, 2, 2]],
        [[0, 0, 1], [-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2], [-1, 2, 2], [1, 2, 2], [-1, -2, 2], [1, -2, 2], [2, -1, 2], [2, 1, 2], [-2, -1, 2], [-2, 1, 2]],
        [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
        [[0, 0, 1], [1, 0, 1], [0, 1, 1]],
        [[0, 0, 1], [-1, -1, 2], [1, 1, 2], [-1, 1, 2], [1, -1, 2]],
        [[0, 0, 1], [0, -1, 2], [0, 1, 2], [0, -2, 2], [0, 2, 2]],
    ];
    const flakeCache = new Map();
    function flakeGrid(W, H, count, type) {
        const key = `${W}x${H}|${count}|${type}`;
        let g = flakeCache.get(key);
        if (g) return g;
        g = new Uint8Array(W * H);
        const dh = Math.max(1, Math.floor(H / 4));
        for (let n = 0; n < count; n++) {
            const x = Math.floor(hash(n * 2 + 11) * W), y = Math.min(H - 1, (n % 4) * dh + Math.floor(hash(n * 2 + 12) * dh));
            const shape = FLAKES[type === 0 ? Math.floor(hash(n * 3 + 5) * 9) : Math.max(0, Math.min(8, type - 1))];
            for (const [dx, dy, c] of shape) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H) g[yy * W + xx] = c; }
        }
        if (flakeCache.size > 64) flakeCache.clear();
        flakeCache.set(key, g);
        return g;
    }

    // Pictures (imported effects): images are loaded by the page (setPictureLoader)
    // and kept as small RGBA arrays.
    const pictures = new Map();
    let pictureLoader = null;
    const setPictureLoader = fn => { pictureLoader = fn; };
    function pictureFor(path) {
        if (!path) return null;
        let e = pictures.get(path);
        if (e) return e.ready ? e : null;
        e = { ready: false };
        pictures.set(path, e);
        if (pictureLoader) Promise.resolve(pictureLoader(path)).then(src => new Promise((ok, no) => {
            if (!src) return no();
            const img = new Image();
            img.onload = () => ok(img); img.onerror = no;
            img.src = src;
        })).then(img => {
            const c = document.createElement('canvas');
            const sc = Math.min(1, 256 / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            Object.assign(e, { ready: true, w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data, nw: img.width, nh: img.height });
        }).catch(() => { e.failed = true; });
        return null;
    }

    // The Spirograph line for one frame on a W x H buffer (palette index + 1 per cell).
    const spiroCache = new Map();
    function spiroGrid(p, W, H) {
        const o = p.o;
        const key = `${o.R}|${o.r}|${o.d}|${o.speed}|${o.animate}|${o.length}|${o.width}|${p.pal.length}|${W}x${H}|${Math.round(p.sec * 40)}`;
        let g = spiroCache.get(key);
        if (g) return g;
        g = new Uint8Array(W * H);
        const nc = p.pal.length;
        const frames = Math.round(p.sec * 40);
        const state = Math.floor(frames * o.speed * 25 / 50);
        const xc = W / 2, yc = H / 2;
        const R = xc * o.R / 100;
        let r = Math.max(0.00001, xc * o.r / 100);
        if (r > R) r = R;
        let d = xc * o.d / 100;
        if (o.animate) d += frames * o.animate * 25 / 5000 * d;
        const width = Math.max(1, Math.round(o.width));
        const step = 1 / width, stepw = 1 / (Math.log10(width) + 1);
        const dmod = Math.max(1, Math.floor(W / nc));
        const len = Math.max(0, o.length) * 18, m = state % 1440;
        for (let i = 1; i <= len; i += step) {
            const t = (i + m) * Math.PI / 180;
            const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t) + xc;
            const y = (R - r) * Math.sin(t) + d * Math.sin(((R - r) / r) * t) + yc;
            const ci = Math.min(nc - 1, Math.floor(Math.hypot(x - xc, y - yc) / W * 100 / dmod));
            const tt = ((R - r) / r) * t;
            for (let w = -width / 2; w <= width / 2; w += stepw) {
                const xx = Math.trunc(x + w * Math.cos(tt)), yy = Math.trunc(y + w * Math.sin(tt));
                if (xx >= 0 && xx < W && yy >= 0 && yy < H) g[yy * W + xx] = ci + 1;
            }
        }
        if (spiroCache.size > 64) spiroCache.clear();
        spiroCache.set(key, g);
        return g;
    }

    const CHASE_DIRS =['Left-Right', 'Right-Left', 'From Middle', 'To Middle', 'Bounce from Left'];

    const LIST = [
        {
            id: 'on', label: 'Solid color', xl: 'On', use: ['part', 'hit'],
            // start/end: brightness at the start and end of the effect (a ramp when they differ)
            options: { fadeIn: 0, fadeOut: 0, start: 100, end: 100, cycles: 1, transparency: 0 },
            settings: o => `E_TEXTCTRL_Eff_On_End=${o.end ?? 100},E_TEXTCTRL_Eff_On_Start=${o.start ?? 100}` + fades(o),
            render(p, N, out) {
                const s0 = p.o.start ?? 100, s1 = p.o.end ?? 100;
                const x = (p.o.cycles || 1) > 1 ? frac(p.t * p.o.cycles) : p.t;
                const b = fadeOf(p, p.o.fadeIn, p.o.fadeOut) * (s0 + (s1 - s0) * x) / 100 * (1 - Math.max(0, Math.min(100, p.o.transparency || 0)) / 100);
                for (let k = 0; k < N.n; k++) palPick(p.pal, 0, out, 3 * k, b);
            },
        },
        {
            // hitColour: each hit takes the next palette colour (written per effect in the .xsq)
            id: 'pulse', label: 'Flash and fade', xl: 'On', use: ['hit'], hitColour: true,
            options: {},
            settings: () => 'E_TEXTCTRL_Eff_On_End=0,E_TEXTCTRL_Eff_On_Start=100',
            render(p, N, out) {
                const b = 1 - p.t;
                for (let k = 0; k < N.n; k++) palPick(p.pal, p.index, out, 3 * k, b);
            },
        },
        {
            id: 'wash', label: 'Color wash', xl: 'Color Wash', use: ['part'],
            options: { cycles: 1, circular: 0 },
            settings: o => `E_TEXTCTRL_ColorWash_Cycles=${(+o.cycles).toFixed(1)}` + (o.circular ? ',E_CHECKBOX_ColorWash_CircularPalette=1' : ''),
            // ColorWashEffect + GetMultiColorBlend: once through the colors per cycle,
            // ending on the last one (round to the first again only when circular)
            render(p, N, out) {
                const n = p.pal.length, pos = Math.min(0.99999, frac(p.t * Math.max(0.1, +p.o.cycles || 1)));
                const f = n <= 1 ? 0 : p.o.circular ? pos * n : pos * (n - 1);
                for (let k = 0; k < N.n; k++) palBlend(p.pal, f, out, 3 * k);
            },
        },
        {
            id: 'chase', label: 'Chase', xl: 'SingleStrand', use: ['part', 'hit'],
            options: { direction: 'Left-Right', chases: 1, rotations: 1, size: 33 },
            choices: { direction: CHASE_DIRS },
            settings: o => `E_CHECKBOX_Chase_Group_All=0,E_CHOICE_Chase_Type1=${o.direction},E_CHOICE_Fade_Type=From Head,E_CHOICE_SingleStrand_Colors=Palette,E_CHOICE_Skips_Direction=Left,E_NOTEBOOK_SSEFFECT_TYPE=Chase,E_SLIDER_Color_Mix1=${o.size},E_SLIDER_Number_Chases=${o.chases},E_SLIDER_Skips_Advance=0,E_SLIDER_Skips_BandSize=1,E_SLIDER_Skips_SkipSize=1,E_SLIDER_Skips_StartPos=1,E_TEXTCTRL_Chase_Rotations=${(+o.rotations).toFixed(1)}`,
            render(p, N, out) {
                const o = p.o, size = Math.max(0.02, o.size / 100);
                let pos = frac(p.t * o.rotations);
                for (let k = 0; k < N.n; k++) {
                    let u = N.u[k];
                    if (o.direction === 'Right-Left') u = 1 - u;
                    else if (o.direction === 'From Middle') u = Math.abs(u - 0.5) * 2;
                    else if (o.direction === 'To Middle') u = 1 - Math.abs(u - 0.5) * 2;
                    let best = 0, ci = 0;
                    for (let c = 0; c < o.chases; c++) {
                        let head = frac(pos + c / o.chases);
                        if (o.direction === 'Bounce from Left') head = 1 - Math.abs(1 - 2 * frac(p.t * o.rotations / 2 + c / o.chases));
                        const d = head - u;
                        const dd = d < 0 ? d + 1 : d;
                        if (dd <= size) { const b = 1 - dd / size; if (b > best) { best = b; ci = c; } }
                    }
                    palPick(p.pal, ci, out, 3 * k, best);
                }
            },
        },
        {
            id: 'bars', label: 'Bars', xl: 'Bars', use: ['part', 'hit'],
            options: { direction: 'up', bars: 3, cycles: 1, look3d: 1 },
            choices: { direction: ['up', 'down', 'Left', 'Right', 'expand', 'compress'] },
            labels: { look3d: '3D look (0/1)' },
            settings: o => `E_CHECKBOX_Bars_3D=${o.look3d ? 1 : 0},E_CHECKBOX_Bars_Gradient=0,E_CHECKBOX_Bars_Highlight=0,E_CHOICE_Bars_Direction=${o.direction},E_SLIDER_Bars_BarCount=${o.bars},E_TEXTCTRL_Bars_Cycles=${(+o.cycles).toFixed(1)}`,
            render(p, N, out) {
                const o = p.o, n = p.pal.length, bands = Math.max(1, o.bars) * n;
                const shift = p.t * o.cycles;
                for (let k = 0; k < N.n; k++) {
                    let c;
                    switch (o.direction) {
                        case 'down': c = N.v[k] + shift; break;
                        case 'Left': c = N.u[k] + shift; break;
                        case 'Right': c = N.u[k] - shift; break;
                        case 'expand': c = Math.abs(N.v[k] - 0.5) - shift; break;
                        case 'compress': c = Math.abs(N.v[k] - 0.5) + shift; break;
                        default: c = N.v[k] - shift;
                    }
                    const f = frac(c) * bands;
                    palPick(p.pal, Math.floor(f), out, 3 * k, o.look3d ? 1 - frac(f) : 1);
                }
            },
        },
        {
            id: 'spirals', label: 'Spirals', xl: 'Spirals', use: ['part'],
            options: { count: 3, rotation: 20, thickness: 40, look3d: 1, twistMove: 'steady' },
            choices: { twistMove: Object.keys(SP_TWIST) },
            labels: { look3d: '3D look (0/1)', twistMove: 'Twist moves' },
            settings: o => { const c = spCurve(o); return `E_CHECKBOX_Spirals_3D=${o.look3d ? 1 : 0},E_CHECKBOX_Spirals_Blend=0,E_CHECKBOX_Spirals_Grow=0,E_CHECKBOX_Spirals_Shrink=0,E_SLIDER_Spirals_Count=${o.count},E_SLIDER_Spirals_Rotation=${o.rotation},E_SLIDER_Spirals_Thickness=${o.thickness},E_TEXTCTRL_Spirals_Movement=${(o.rotation >= 0 ? 1 : -1).toFixed(1)}` + (c ? ',' + curveString('E', 'Spirals_Rotation', c) : ''); },
            render(p, N, out) {
                const o = p.o, n = p.pal.length;
                const c = spCurve(o);
                const twist = (c ? curveAt(c, p.t) : o.rotation) / 10;
                const strands = Math.max(1, o.count) * n;
                for (let k = 0; k < N.n; k++) {
                    const ph = (N.u[k] + N.v[k] * twist / strands * n) * strands + p.t * strands * Math.sign(o.rotation || 1);
                    const band = o.thickness / 100 + 0.25, x = frac(ph);
                    palPick(p.pal, Math.floor(ph), out, 3 * k, x < band ? (o.look3d ? (o.rotation >= 0 ? 1 - x / band : x / band) : 1) : 0);
                }
            },
        },
        {
            id: 'pinwheel', label: 'Pinwheel', xl: 'Pinwheel', use: ['part'],
            options: { arms: 3, speed: 10, twist: 0, look: '3D', armMove: 'steady', size: 100, thickness: 20, cw: 0, offset: 0, xc: 0, yc: 0 },
            choices: { look: LOOKS, armMove: Object.keys(PW_ARMS) },
            labels: { look: 'Look', armMove: 'Arms', size: 'Arm length %', thickness: 'Arm width %', cw: 'Clockwise (0/1)', offset: 'Start angle', xc: 'Center left/right', yc: 'Center up/down' },
            settings: o => { const c = PW_ARMS[o.armMove]; return `E_CHECKBOX_Pinwheel_Rotation=${o.cw ? 1 : 0},E_CHOICE_Pinwheel_3D=${LOOKS.includes(o.look) ? o.look : '3D'},E_CHOICE_Pinwheel_Style=New Render Method,E_SLIDER_PinwheelXC=${Math.round(o.xc || 0)},E_SLIDER_PinwheelYC=${Math.round(o.yc || 0)},E_SLIDER_Pinwheel_ArmSize=${Math.round(o.size ?? 100)},E_SLIDER_Pinwheel_Arms=${o.arms},E_SLIDER_Pinwheel_Offset=${Math.round(o.offset || 0)},E_SLIDER_Pinwheel_Speed=${o.speed},E_SLIDER_Pinwheel_Thickness=${Math.round(o.thickness ?? 20)},E_SLIDER_Pinwheel_Twist=${o.twist}` + (c ? ',' + curveString('E', 'Pinwheel_ArmSize', { ...c, min: 0, max: 400 }) : ''); },
            render(p, N, out) {
                const o = p.o;
                const rot = (o.cw ? -1 : 1) * p.sec * o.speed / 10 + (o.offset || 0) / 360;
                const c = PW_ARMS[o.armMove];
                // arms reach half the buffer's diagonal at 100% (ArmSize goes to 400%)
                const reach = 0.7072 * (c ? curveAt(c, p.t) : (o.size ?? 100)) / 100;
                // an arm is about Pinwheel_Thickness % of its share of the circle (a
                // little more on small buffers; tuned against xLights renders)
                const band = Math.min(1, Math.max(0.02, (o.thickness ?? 20) / 100 * 1.2));
                const cx = 0.5 + (o.xc || 0) / 200, cy = 0.5 + (o.yc || 0) / 200;
                for (let k = 0; k < N.n; k++) {
                    const dx = N.u[k] - cx, dy = N.v[k] - cy;
                    const r = Math.hypot(dx, dy);
                    if (r > reach) continue;
                    const a = (Math.atan2(dy, dx) / (2 * Math.PI) + rot + r * o.twist / 100) * o.arms;
                    const w = frac(a);
                    if (w < band) palPick(p.pal, Math.floor(a), out, 3 * k, shade3d(o.look || '3D', w / band));
                }
            },
        },
        {
            id: 'twinkle', label: 'Twinkle', xl: 'Twinkle', use: ['part'],
            options: { count: 20, steps: 30 },
            settings: o => `E_CHECKBOX_Twinkle_ReRandom=1,E_CHECKBOX_Twinkle_Strobe=0,E_CHOICE_Twinkle_Style=New Render Method,E_SLIDER_Twinkle_Count=${o.count},E_SLIDER_Twinkle_Steps=${o.steps}`,
            render(p, N, out) {
                const o = p.o, period = Math.max(2, o.steps) * 0.025;
                for (let k = 0; k < N.n; k++) {
                    const s = N.seed[k];
                    const x = p.sec / period + hash(s) * 7;
                    const cyc = Math.floor(x);
                    const on = hash(s * 31 + cyc * 7919) < o.count / 100;
                    const b = on ? 1 - Math.abs(frac(x) * 2 - 1) : 0;
                    palPick(p.pal, Math.floor(hash(s + cyc) * 97), out, 3 * k, b);
                }
            },
        },
        {
            id: 'shockwave', label: 'Shockwave', xl: 'Shockwave', use: ['hit', 'part'], hitColour: true,
            options: { width: 30, move: 'still', cx: 50, r0: 1, r1: 100, w0: null },
            choices: { move: Object.keys(SW_MOVE) },
            labels: { move: 'Centre moves' },
            settings: o => { const c = SW_MOVE[o.move]; return `E_CHECKBOX_Shockwave_Blend_Edges=1,E_CHECKBOX_Shockwave_Scale=1,E_NOTEBOOK_Shockwave=Position,E_SLIDER_Shockwave_Accel=0,E_SLIDER_Shockwave_CenterX=50,E_SLIDER_Shockwave_CenterY=50,E_SLIDER_Shockwave_Cycles=1,E_SLIDER_Shockwave_End_Radius=100,E_SLIDER_Shockwave_End_Width=${o.width},E_SLIDER_Shockwave_Start_Radius=1,E_SLIDER_Shockwave_Start_Width=${o.width}` + (c ? ',' + curveString('E', 'Shockwave_CenterY', { ...c, min: 0, max: 100 }) : ''); },
            render(p, N, out) {
                // ShockwaveEffect::Render (Scale to Buffer on): radius r -> r/200 and width w -> w/100
                // of the buffer's longer side; the ring's edges fade; imported ones blend through
                // their palette as the ring grows (made-here hits take one color each)
                const o = p.o, w0 = o.w0 == null ? o.width : o.w0;
                const R = ((o.r0 ?? 1) + ((o.r1 ?? 100) - (o.r0 ?? 1)) * p.t) / 200;
                const half = Math.max(0.002, (w0 + (o.width - w0) * p.t) / 200);
                const c = SW_MOVE[o.move];
                const cy = c ? curveAt(c, p.t) / 100 : (o.cy ?? 50) / 100, cx = (o.cx ?? 50) / 100;
                const n = p.pal.length, col = [0, 0, 0];
                if (o.palBlend) palBlend(p.pal, Math.min(n - 1, p.t * (n - 1)), col, 0); else palPick(p.pal, p.index, col, 0);
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h, M = Math.max(W, H);
                    const d = Math.hypot((N.u[k] - cx) * W, (N.v[k] - cy) * H) / M;
                    const e = Math.abs(d - R);
                    if (e > half) continue;
                    const b = 1 - e / half;
                    out[3 * k] = col[0] * b; out[3 * k + 1] = col[1] * b; out[3 * k + 2] = col[2] * b;
                }
            },
        },
        {
            id: 'marquee', label: 'Marquee', xl: 'Marquee', use: ['part'],
            options: { band: 3, skip: 2, speed: 3 },
            settings: o => `E_CHECKBOX_Marquee_PixelOffsets=0,E_CHECKBOX_Marquee_Reverse=0,E_CHECKBOX_Marquee_WrapX=0,E_NOTEBOOK_Marquee=Settings,E_SLIDER_MarqueeXC=0,E_SLIDER_MarqueeYC=0,E_SLIDER_Marquee_Band_Size=${o.band},E_SLIDER_Marquee_ScaleX=100,E_SLIDER_Marquee_ScaleY=100,E_SLIDER_Marquee_Skip_Size=${o.skip},E_SLIDER_Marquee_Speed=${o.speed},E_SLIDER_Marquee_Stagger=0,E_SLIDER_Marquee_Start=0,E_SLIDER_Marquee_Thickness=1`,
            render(p, N, out) {
                const o = p.o, period = Math.max(1, o.band + o.skip);
                const shift = Math.floor(p.sec * o.speed * 4);
                for (let k = 0; k < N.n; k++) {
                    const pos = N.k[k] + shift;
                    const inBand = (pos % period) < o.band;
                    palPick(p.pal, Math.floor(pos / period), out, 3 * k, inBand ? 1 : 0);
                }
            },
        },
        {
            id: 'butterfly', label: 'Butterfly (color swirl)', xl: 'Butterfly', use: ['part'],
            options: { speed: 10 },
            settings: o => `E_CHOICE_Butterfly_Colors=Palette,E_CHOICE_Butterfly_Direction=Normal,E_SLIDER_Butterfly_Chunks=1,E_SLIDER_Butterfly_Skip=2,E_SLIDER_Butterfly_Speed=${o.speed},E_SLIDER_Butterfly_Style=1`,
            render(p, N, out) {
                const s = p.sec * p.o.speed / 10;
                for (let k = 0; k < N.n; k++) {
                    const x = N.u[k] * 6, y = N.v[k] * 6;
                    const f = (Math.sin(x + s) + Math.sin(y * 1.3 - s * 0.8) + Math.sin((x + y) * 0.7 + s * 1.2) + 3) / 6;
                    palBlend(p.pal, f * p.pal.length, out, 3 * k);
                }
            },
        },
        {
            // FanEffect::Render: blades sweeping round the centre; as a hit (grow < 100)
            // they grow out and shrink back in.
            id: 'fan', label: 'Fan (spinning blades)', xl: 'Fan', use: ['part', 'hit'],
            options: { blades: 3, width: 50, turns: 2, twist: 0, reverse: 0, grow: 100 },
            labels: { blades: 'Blades', width: 'Blade width %', turns: 'Turns', twist: 'Blade bend °', reverse: 'Reverse (0/1)', grow: 'Time at full size %' },
            settings: o => `E_CHECKBOX_Fan_Blend_Edges=1,E_CHECKBOX_Fan_Reverse=${o.reverse ? 1 : 0},E_NOTEBOOK_Fan=Position,E_SLIDER_Fan_Accel=0,E_SLIDER_Fan_Blade_Angle=${Math.round(o.twist)},E_SLIDER_Fan_Blade_Width=${Math.round(o.width)},E_SLIDER_Fan_CenterX=50,E_SLIDER_Fan_CenterY=50,E_SLIDER_Fan_Duration=${Math.round(o.grow)},E_SLIDER_Fan_Element_Width=100,E_SLIDER_Fan_End_Radius=150,E_SLIDER_Fan_Num_Blades=${Math.round(o.blades)},E_SLIDER_Fan_Num_Elements=1,E_SLIDER_Fan_Revolutions=${fanRevs(o)},E_SLIDER_Fan_Start_Angle=0,E_SLIDER_Fan_Start_Radius=1`,
            render(p, N, out) {
                const o = p.o, nc = p.pal.length;
                const blades = Math.max(1, Math.round(o.blades));
                const div = 360 / blades, bw = div * Math.max(5, Math.min(100, o.width)) / 100, ca = bw / nc;
                const off = p.t * fanRevs(o), grow = Math.max(0, Math.min(100, o.grow)) / 100, ramp = (1 - grow) / 2;
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
                    const big = Math.max(W, H) / 200;
                    let r1 = big, r2 = 150 * big;
                    const maxR = r2, delta = r2 - r1;
                    if (grow < 1) {
                        if (p.t < ramp) r2 -= delta * (1 - p.t / ramp);
                        else if (p.t > 1 - ramp) r1 = r2 - delta * ((1 - p.t) / ramp);
                    }
                    const x1 = (N.u[k] - 0.5) * W, y1 = (N.v[k] - 0.5) * H;
                    const r = Math.hypot(x1, y1);
                    if (r < r1 || r > r2) continue;
                    let th = Math.atan2(x1, y1) * 180 / Math.PI + (r / maxR) * o.twist;
                    th = o.reverse ? off - th + 180 : th + 180 + off;
                    th = ((th % 360) + 360) % 360;
                    const a = th % div;
                    if (a > bw) continue;
                    const ea = a % ca;
                    palPick(p.pal, Math.min(nc - 1, Math.floor(a / ca)), out, 3 * k, clamp01(1 - Math.abs(ea - ca / 2) * 2 / ca));
                }
            },
        },
        {
            // RippleEffect, the classic style: a shape grows out of (or into) the
            // centre with a fading 3D edge; each cycle takes the next colour.
            id: 'ripple', label: 'Ripple (growing shape)', xl: 'Ripple', use: ['part', 'hit'],
            options: { shape: 'Circle', movement: 'Explode', thickness: 4, cycles: 1 },
            choices: { shape: ['Circle', 'Square', 'Triangle', 'Star', 'Snow Flake'], movement: ['Explode', 'Implode'] },
            labels: { shape: 'Shape', movement: 'Grows', thickness: 'Edge thickness', cycles: 'Times' },
            settings: o => `E_CHECKBOX_Ripple3D=1,E_CHOICE_Ripple_Movement=${o.movement},E_CHOICE_Ripple_Object_To_Draw=${o.shape},E_FILEPICKERCTRL_Ripple_SVG=,E_SLIDER_Ripple_Thickness=${Math.round(o.thickness)},E_SLIDER_Ripple_XC=0,E_SLIDER_Ripple_YC=0,E_TEXTCTRL_Ripple_Cycles=${Math.max(0.1, Math.min(30, +o.cycles)).toFixed(1)}`,
            render(p, N, out) {
                const o = p.o, nc = p.pal.length;
                const pos = frac(p.t * Math.max(0.1, Math.min(30, +o.cycles)));
                const ci = Math.min(nc - 1, Math.floor(pos * nc));
                const th = Math.max(1, Math.round(o.thickness)), grow = o.movement !== 'Implode';
                // the rings xLights draws: the radius steps by i (cumulatively), each fainter
                const rings = [];
                let rad = 0, b = 1;
                for (let i = 0; i < th; i += 0.5) { b *= 1 - i / th; rad += grow ? i : -i; rings.push([rad, b]); }
                const prof = shapeProfile(o.shape);
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
                    const maxR = W > H ? W / 2 : H / 2;
                    const r0 = grow ? maxR * pos : maxR - maxR * pos;
                    const x1 = (N.u[k] - 0.5) * W, y1 = (N.v[k] - 0.5) * H;
                    const d = Math.hypot(x1, y1) / prof(Math.atan2(y1, x1));
                    let lit = 0;
                    for (const [dr, bb] of rings) { const R = r0 + dr; if (R >= 0 && Math.abs(d - R) <= 0.75) lit = bb; }
                    if (lit) palPick(p.pal, ci, out, 3 * k, lit);
                }
            },
        },
        {
            // SpirographEffect: a rolling hypotrochoid line drawing.
            id: 'spirograph', label: 'Spirograph (line pattern)', xl: 'Spirograph', use: ['part'],
            options: { R: 70, r: 15, d: 50, speed: 10, animate: 0, length: 30, width: 2 },
            labels: { R: 'Outer size %', r: 'Wheel size %', d: 'Pen distance %', speed: 'Speed', animate: 'Breathe', length: 'Line length', width: 'Line width' },
            settings: o => `E_SLIDER_Spirograph_R=${Math.round(o.R)},E_SLIDER_Spirograph_d=${Math.round(o.d)},E_SLIDER_Spirograph_r=${Math.round(o.r)},E_TEXTCTRL_Spirograph_Animate=${Math.round(o.animate)},E_TEXTCTRL_Spirograph_Length=${Math.round(o.length)},E_TEXTCTRL_Spirograph_Speed=${Math.round(o.speed)},E_TEXTCTRL_Spirograph_Width=${Math.max(1, Math.round(o.width))}`,
            render(p, N, out) {
                for (let k = 0; k < N.n; k++) {
                    const W = Math.max(4, Math.round(N.bw ? N.bw[k] : N.w)), H = Math.max(4, Math.round(N.bh ? N.bh[k] : N.h));
                    const g = spiroGrid(p, W, H);
                    const c = g[Math.round(N.v[k] * (H - 1)) * W + Math.round(N.u[k] * (W - 1))];
                    if (c) palPick(p.pal, c - 1, out, 3 * k);
                }
            },
        },
        {
            // WaveEffect (sine / triangle): a band waving across the buffer.
            id: 'wave', label: 'Wave', xl: 'Wave', use: ['part'],
            options: { type: 'Sine', waves: 2, height: 60, thickness: 20, speed: 20, direction: 'Right to Left' },
            choices: { type: ['Sine', 'Triangle'], direction: ['Right to Left', 'Left to Right'] },
            labels: { type: 'Shape', waves: 'Waves across', height: 'Height %', thickness: 'Thickness %', speed: 'Speed', direction: 'Moves' },
            settings: o => `E_CHECKBOX_Mirror_Wave=0,E_CHOICE_Fill_Colors=None,E_CHOICE_Wave_Direction=${o.direction},E_CHOICE_Wave_Type=${o.type},E_SLIDER_Number_Waves=${Math.round(Math.max(0.5, +o.waves) * 360)},E_SLIDER_Thickness_Percentage=${Math.round(o.thickness)},E_SLIDER_Wave_Height=${Math.round(o.height)},E_SLIDER_Wave_YOffset=0,E_TEXTCTRL_Wave_Speed=${(+o.speed).toFixed(2)}`,
            render(p, N, out) {
                const o = p.o, deg = Math.max(0.5, +o.waves) * 360;
                const state = Math.round(p.sec * 40) * o.speed * 0.5;
                const ltr = o.direction === 'Left to Right';
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
                    const x = N.u[k] * (W - 1), y = N.v[k] * (H - 1), yc = H / 2;
                    let ys;
                    if (o.type === 'Triangle') {
                        const amp = H * o.height / 100, xx = ltr ? W - x - 1 : x, waves = deg / 180 / 5;
                        ys = amp ? (H - amp) / 2 + Math.abs(((state / 10 + xx) * waves) % (2 * amp) - amp) : 0;
                    } else {
                        const d = x * deg / W + (ltr ? -state : state);
                        ys = yc * o.height / 100 * Math.sin(d * Math.PI / 180) + yc;
                    }
                    const half = Math.max(0.5, yc * o.thickness / 100);
                    if (y >= ys - half && y <= ys + half) palPick(p.pal, 0, out, 3 * k);
                }
            },
        },
        {
            // MeteorsEffect (down / up / left / right): falling streaks with fading tails.
            id: 'meteors', label: 'Meteors', xl: 'Meteors', use: ['part'],
            options: { direction: 'Down', count: 25, length: 25, speed: 10 },
            choices: { direction: ['Down', 'Up', 'Left', 'Right'] },
            labels: { direction: 'Falling', count: 'How many %', length: 'Tail length %', speed: 'Speed' },
            settings: o => `E_CHECKBOX_Meteors_UseMusic=0,E_CHOICE_Meteors_Effect=${o.direction},E_CHOICE_Meteors_Type=Palette,E_SLIDER_Meteors_Count=${Math.round(o.count)},E_SLIDER_Meteors_Length=${Math.round(o.length)},E_SLIDER_Meteors_Speed=${Math.round(o.speed)},E_SLIDER_Meteors_Swirl_Intensity=0`,
            render(p, N, out) {
                const o = p.o, nc = p.pal.length, vert = o.direction === 'Down' || o.direction === 'Up';
                const frames = p.sec * 40;
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
                    const lane = Math.round((vert ? N.u[k] * (W - 1) : N.v[k] * (H - 1)));
                    const L = vert ? H : W;
                    let pos = (vert ? N.v[k] : N.u[k]) * (L - 1);
                    if (o.direction === 'Down' || o.direction === 'Left') pos = L - 1 - pos;
                    const tail = Math.max(1, L * o.length / 100);
                    // MeteorsEffect: each step a lane starts a meteor with chance count/200 and
                    // meteors move one row a step (speed/2 steps a frame); spacing tuned against
                    // xLights renders (tails overlap)
                    const gap = 300 / Math.max(1, o.count);
                    const head = frames * o.speed / 2 + hash(lane * 7919 + 13) * gap;
                    const d = frac((head - pos) / gap) * gap;
                    if (d < tail) palPick(p.pal, Math.floor(hash(lane * 31 + Math.floor((head - pos) / gap)) * nc), out, 3 * k, 1 - d / tail);
                }
            },
        },
        {
            // CurtainEffect: a curtain opening towards (or closing from) an edge.
            id: 'curtain', label: 'Curtain (open / close)', xl: 'Curtain', use: ['part', 'hit'],
            options: { effect: 'open', edge: 'left', times: 1 },
            choices: { effect: ['open', 'close', 'open then close', 'close then open'], edge: ['left', 'center', 'right', 'bottom', 'middle', 'top'] },
            labels: { effect: 'Curtain', edge: 'From', times: 'Times' },
            settings: o => `E_CHECKBOX_Curtain_Repeat=${+o.times > 1 ? 1 : 0},E_CHOICE_Curtain_Edge=${o.edge},E_CHOICE_Curtain_Effect=${o.effect},E_SLIDER_Curtain_Swag=0,E_TEXTCTRL_Curtain_Speed=${Math.max(0.1, +o.times || 1).toFixed(1)}`,
            render(p, N, out) {
                const o = p.o, times = Math.max(1, Math.round(+o.times || 1));
                const tt = times <= 1 ? p.t : frac(p.t * times);
                const lit = { open: 1 - tt, close: tt, 'open then close': Math.abs(1 - 2 * tt), 'close then open': 1 - Math.abs(1 - 2 * tt) }[o.effect] ?? 1;
                for (let k = 0; k < N.n; k++) {
                    const u = N.u[k], v = N.v[k];
                    let d;
                    switch (o.edge) {
                        case 'right': d = 1 - u; break;
                        case 'center': d = Math.abs(u - 0.5) * 2; d = 1 - d; break;
                        case 'top': d = 1 - v; break;
                        case 'bottom': d = v; break;
                        case 'middle': d = 1 - Math.abs(v - 0.5) * 2; break;
                        default: d = u;
                    }
                    if (o.edge === 'center' || o.edge === 'middle') { if (1 - d <= lit) palBlend(p.pal, u * (p.pal.length - 1), out, 3 * k); }
                    else if (d <= lit) palBlend(p.pal, u * (p.pal.length - 1), out, 3 * k);
                }
            },
        },
        {
            // MorphEffect: a line sweeps across (bottom to top by default) in the first
            // part of the effect, leaving a tail that drains away.
            id: 'morph', label: 'Morph (sweep with tail)', xl: 'Morph', use: ['part', 'hit'],
            options: { direction: 'up', sweep: 20 },
            choices: { direction: ['up', 'down', 'left', 'right'] },
            labels: { direction: 'Sweeps', sweep: 'Head time %' },
            settings: o => {
                const [sx1, sy1, sx2, sy2, ex1, ey1, ex2, ey2] = { up: [0, 0, 100, 0, 0, 100, 100, 100], down: [0, 100, 100, 100, 0, 0, 100, 0], left: [100, 0, 100, 100, 0, 0, 0, 100], right: [0, 0, 0, 100, 100, 0, 100, 100] }[o.direction] || [0, 0, 100, 0, 0, 100, 100, 100];
                return `E_CHECKBOX_Morph_AutoRepeat=0,E_CHECKBOX_Morph_End_Link=0,E_CHECKBOX_Morph_Start_Link=0,E_CHECKBOX_ShowHeadAtStart=0,E_NOTEBOOK_Morph=Start,E_SLIDER_MorphAccel=0,E_SLIDER_MorphDuration=${Math.round(Math.max(1, Math.min(100, o.sweep)))},E_SLIDER_MorphEndLength=1,E_SLIDER_MorphStartLength=1,E_SLIDER_Morph_End_X1=${ex1},E_SLIDER_Morph_End_X2=${ex2},E_SLIDER_Morph_End_Y1=${ey1},E_SLIDER_Morph_End_Y2=${ey2},E_SLIDER_Morph_Repeat_Count=0,E_SLIDER_Morph_Repeat_Skip=1,E_SLIDER_Morph_Stagger=0,E_SLIDER_Morph_Start_X1=${sx1},E_SLIDER_Morph_Start_X2=${sx2},E_SLIDER_Morph_Start_Y1=${sy1},E_SLIDER_Morph_Start_Y2=${sy2}`;
            },
            render(p, N, out) {
                const o = p.o, D = Math.max(0.01, Math.min(1, o.sweep / 100));
                const head = p.t / D, tailLen = 1 / D - 1, tailEnd = head - tailLen;
                const tc = p.pal.length > 1 ? 1 : 0;
                for (let k = 0; k < N.n; k++) {
                    const s = { up: N.v[k], down: 1 - N.v[k], left: 1 - N.u[k], right: N.u[k] }[o.direction] ?? N.v[k];
                    if (s > head) continue;
                    if (head - s < 0.03 && head <= 1.03) { palPick(p.pal, 0, out, 3 * k); continue; }
                    const pct = tailLen > 0 ? (s - tailEnd) / tailLen : 0;
                    if (pct > 0) palPick(p.pal, tc, out, 3 * k, pct > 0.5 ? 1 : pct / 0.5);
                }
            },
        },
        {
            // SnowflakesEffect: flakes drifting down.
            id: 'snowflakes', label: 'Snowflakes (falling)', xl: 'Snowflakes', use: ['part'],
            options: { count: 10, speed: 10, type: 1 },
            labels: { count: 'How many', speed: 'Speed', type: 'Flake shape (0-9, 0 = mixed)' },
            settings: o => `E_CHOICE_Falling=Driving,E_SLIDER_Snowflakes_Count=${Math.round(o.count)},E_SLIDER_Snowflakes_Speed=${Math.round(o.speed)},E_SLIDER_Snowflakes_Type=${Math.round(o.type ?? 1)}`,
            // SnowflakesEffect, Driving: a fixed set of flakes, drawn twice and scrolled
            // diagonally (one copy each way, the second half a buffer lower)
            render(p, N, out) {
                const o = p.o;
                const mv = Math.floor(Math.round(p.sec * 40) * o.speed / 2);
                for (let k = 0; k < N.n; k++) {
                    const W = Math.max(2, Math.round(N.bw ? N.bw[k] : N.w)), H = Math.max(2, Math.round(N.bh ? N.bh[k] : N.h));
                    const g = flakeGrid(W, H, Math.round(o.count), Math.round(o.type ?? 1));
                    const x = Math.round(N.u[k] * (W - 1)), y = Math.round(N.v[k] * (H - 1));
                    const ny = (y + Math.floor(mv / 10)) % H;
                    let c = g[ny * W + ((x + Math.floor(mv / 20)) % W)];
                    if (!c) c = g[((ny + Math.floor(H / 2)) % H) * W + (((x - Math.floor(mv / 20)) % W) + W) % W];
                    if (c) palPick(p.pal, c - 1, out, 3 * k);
                }
            },
        },
        {
            // StrobeEffect: random lights flashing for a few frames each.
            id: 'strobe', label: 'Strobe', xl: 'Strobe', use: ['part', 'hit'],
            options: { count: 3, duration: 10 },
            labels: { count: 'Flashes per frame', duration: 'Flash length (frames)' },
            settings: o => `E_CHECKBOX_Strobe_Music=0,E_SLIDER_Number_Strobes=${Math.round(o.count)},E_SLIDER_Strobe_Duration=${Math.round(o.duration)},E_SLIDER_Strobe_Type=1`,
            render(p, N, out) {
                const o = p.o, nc = p.pal.length, frame = Math.floor(p.sec * 40), dur = Math.max(1, Math.round(o.duration));
                for (let k = 0; k < N.n; k++) {
                    const s = N.seed[k];
                    // `count` new flashes a frame anywhere in the buffer
                    const chance = Math.min(1, Math.max(1, o.count) / Math.max(1, (N.bw ? N.bw[k] * N.bh[k] : N.w * N.h)));
                    for (let a = 0; a < dur; a++) {
                        const f = frame - a;
                        if (hash(s * 7 + f * 2654435761) < chance) { palPick(p.pal, Math.floor(hash(s + f) * nc), out, 3 * k, 1 - a / dur); break; }
                    }
                }
            },
        },
        {
            // OffEffect: the lights go dark, hiding every row under it.
            id: 'off', label: 'Off (dark)', xl: 'Off', use: ['part', 'hit'], blackout: true,
            options: {},
            settings: () => '',
            render() { },
        },
        {
            // VUMeterEffect timing events: a flash on every mark of a timing track, or
            // a bar sweeping across, back and forth from one mark to the next.
            id: 'vumeter', label: 'Beat meter (flash / sweep on marks)', xl: 'VU Meter', use: ['part'],
            options: { type: 'sweep', track: 'Beats', size: 6 },
            choices: { type: ['sweep', 'flash'], track: ['Beats', 'Bars', 'Note Onsets'] },
            labels: { type: 'Each mark', track: 'Timing track', size: 'Bar width / flash frames' },
            settings: o => `E_CHOICE_VUMeter_TimingTrack=${o.track},E_CHOICE_VUMeter_Type=${o.type === 'flash' ? 'Timing Event Pulse' : 'Timing Event Alternate Timed Sweep'},E_SLIDER_VUMeter_Bars=${Math.max(1, Math.round(o.size))}`,
            render(p, N, out) {
                const o = p.o, marks = p.marks || [];
                const now = p.abs;
                // the mark playing now (marks are sorted)
                let lo = 0, hi = marks.length - 1, m = -1;
                while (lo <= hi) { const mid = (lo + hi) >> 1; if (marks[mid].s <= now) { m = mid; lo = mid + 1; } else hi = mid - 1; }
                if (m < 0 || marks[m].s < p.start - 1e-6) return;
                const mk = marks[m], size = Math.max(1, Math.round(o.size));
                if (o.type === 'flash') {
                    const fr = Math.floor((now - mk.s) * 40 + 1e-6);
                    if (fr >= size) return;
                    for (let k = 0; k < N.n; k++) palPick(p.pal, 0, out, 3 * k, (size - fr) / size);
                    return;
                }
                if (now >= mk.e) return;
                const count = marks.filter((x, i) => i <= m && x.s >= p.start - 1e-6).length;
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w;
                    const frames = Math.max(1, (mk.e - mk.s) * 40);
                    const startX = (W + 2 * size) / frames * ((now - mk.s) * 40) - size;
                    let x = N.u[k] * (W - 1);
                    if (count % 2 === 0) x = W - 1 - x;
                    const i = Math.floor(x - startX);
                    if (i >= 0 && i < size) palBlend(p.pal, i / size * (p.pal.length - 1), out, 3 * k);
                }
            },
        },
        {
            // Imported Pictures: the image from the show folder, fitted to the buffer
            // (Scale To Fit / Keep Aspect Ratio / No Scaling). Glows until it has loaded.
            id: 'pictures', label: 'Picture', xl: 'Pictures', use: [],
            options: { file: '', scaling: 'Scale To Fit' },
            settings: () => '',
            render(p, N, out) {
                const img = pictureFor(p.o.file);
                if (!img) { for (let k = 0; k < N.n; k++) palPick(p.pal, 0, out, 3 * k, 0.3); return; }
                for (let k = 0; k < N.n; k++) {
                    const W = N.bw ? N.bw[k] : N.w, H = N.bh ? N.bh[k] : N.h;
                    let fx, fy;
                    if (p.o.scaling === 'Scale To Fit') { fx = N.u[k]; fy = 1 - N.v[k]; }
                    else {
                        const s = p.o.scaling === 'No Scaling' ? 1 : Math.min(W / img.nw, H / img.nh);
                        const iw = img.nw * s, ih = img.nh * s;
                        fx = (N.u[k] * W - (W - iw) / 2) / iw; fy = ((1 - N.v[k]) * H - (H - ih) / 2) / ih;
                    }
                    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) continue;
                    const i = 4 * (Math.floor(fy * img.h) * img.w + Math.floor(fx * img.w));
                    const a = img.data[i + 3] / 255;
                    out[3 * k] = img.data[i] * a; out[3 * k + 1] = img.data[i + 1] * a; out[3 * k + 2] = img.data[i + 2] * a;
                }
            },
        },
        {
            id: 'nothing', label: 'Nothing', xl: 'Off', use: [], options: {}, settings: () => '', render() { },
        },
        {
            // Imported xLights effects the preview has no drawing for: a dim glow in
            // their first color, so you can see where they are. (Never offered in menus.)
            id: 'glow', label: 'xLights effect', xl: 'On', use: [],
            options: {},
            settings: () => '',
            // a sparse shimmer (about a quarter of the lights at a time), not a solid fill:
            // these effects rarely light everything
            render(p, N, out) {
                const step = Math.floor(p.sec * 8);
                for (let k = 0; k < N.n; k++) if (hash(N.seed[k] * 31 + step * 7919) < 0.25) palPick(p.pal, (N.seed[k] >>> 3) % p.pal.length, out, 3 * k, 0.8);
            },
        },
        {
            id: 'faces', label: 'Singing face', xl: 'Faces', use: ['vocal'], needsFace: true,
            options: { face: '' },
            settings: (o, ctx) => `E_CHECKBOX_Faces_Outline=1,E_CHOICE_Faces_EyeBlinkFrequency=Normal,E_CHOICE_Faces_Eyes=Auto,E_CHOICE_Faces_FaceDefinition=${o.face},E_CHOICE_Faces_TimingTrack=${ctx.lyricTrack},T_TEXTCTRL_Fadein=.2,T_TEXTCTRL_Fadeout=.3`,
            render(p, N, out) {
                // Faces are drawn per model by the renderer (it needs node numbers).
            },
        },
        {
            id: 'lyrictext', label: 'Show the words', xl: 'Text', use: ['vocal'],
            options: { size: 20 },
            // 'Use OS Fonts' is the only safe font choice: any other value goes to
            // the bitmap-font path, where an unknown name crashes xLights.
            settings: (o, ctx) => `E_CHECKBOX_TextToCenter=1,E_CHOICE_Text_Count=none,E_CHOICE_Text_Dir=none,E_CHOICE_Text_Effect=normal,E_CHOICE_Text_Font=Use OS Fonts,E_FONTPICKER_Text_Font=Arial Black ${Math.round(o.size)},E_CHECKBOX_Text_Color_PerWord=0,E_CHOICE_Text_LyricTrack=${ctx.lyricTrack} - Words,E_SLIDER_Text_XStart=0,E_SLIDER_Text_YStart=0,E_TEXTCTRL_Text=,E_TEXTCTRL_Text_Speed=0`,
            render(p, N, out) {
                const word = p.word;
                if (!word) return;
                const g = textMask(word, N.w || 96, N.h || 50, p.o.size);
                for (let k = 0; k < N.n; k++) {
                    const x = Math.min(g.w - 1, Math.floor(N.u[k] * (g.w - 1) + 0.5));
                    const y = Math.min(g.h - 1, Math.floor((1 - N.v[k]) * (g.h - 1) + 0.5));
                    const a = g.data[y * g.w + x];
                    if (a) palPick(p.pal, 0, out, 3 * k, a);
                }
            },
        },
    ];

    // ---------- moving heads (DMX) ----------
    //
    // xLights' Moving Head effect: per fixture a list of "Name: value" commands
    // (MovingHeadEffect::RenderMovingHead). The pattern maths is
    // CalculatePatternPoint / CalculatePatternPositions, ported for the preview.

    const MH_PATTERNS = ['Circle', 'Eight', 'Line', 'Diamond', 'Square', 'Leaf', 'Lissajous', 'Still'];
    function mhPatternPoint(alg, it) {
        const h = Math.PI / 2, pi = Math.PI;
        switch (alg) {
            case 'Eight': return [Math.cos(it * 2 + h), Math.cos(it)];
            case 'Line': return [Math.cos(it), Math.cos(it)];
            case 'Diamond': return [Math.cos(it - h) ** 3, Math.cos(it) ** 3];
            case 'Square':
                if (it < pi / 2) return [(it * 2 / pi) * 2 - 1, 1];
                if (it < pi) return [1, (1 - (it - pi / 2) * 2 / pi) * 2 - 1];
                if (it < pi * 1.5) return [(1 - (it - pi) * 2 / pi) * 2 - 1, -1];
                return [-1, ((it - pi * 1.5) * 2 / pi) * 2 - 1];
            case 'Leaf': return [Math.cos(it + h) ** 5, Math.cos(it)];
            case 'Lissajous': return [Math.cos(2 * it - h), Math.cos(3 * it)];
            default: return [Math.cos(it + h), Math.cos(it)];
        }
    }
    // Where a head points (degrees) at time p.t, for head number `slot` (0-based).
    function mhAim(o, t, slot) {
        if (o.pattern === 'Still') return { pan: +o.pan + (slot - 0) * 0, tilt: +o.tilt };
        let prog = t * (+o.cycles || 1) + slot * (+o.spread || 0) / 360;
        prog -= Math.floor(prog);
        const [x, y] = mhPatternPoint(o.pattern, prog * 2 * Math.PI);
        return { pan: +o.pan + x * (+o.width || 0), tilt: +o.tilt + y * (+o.height || 0) };
    }
    const hsv = hex => {
        const [r, g, b] = hexToRgb(hex).map(v => v / 255);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6; if (h < 0) h += 1;
        return [h, mx ? d / mx : 0, mx];
    };
    function mhCommands(o, colors, heads) {
        const f = v => (+v).toFixed(1);
        const cmds = [`Pan: ${f(o.pan)}`, `Tilt: ${f(o.tilt)}`, 'PanOffset: 0.0', 'TiltOffset: 0.0', 'Groupings: 1', `Cycles: ${f(o.cycles || 1)}`, `Heads: ${heads.join(',')}`];
        if (o.pattern !== 'Still') {
            cmds.push(`Pattern: ${o.pattern}`, `PatternWidth: ${f(o.width)}`, `PatternHeight: ${f(o.height)}`, `PatternXOffset: ${f(o.pan)}`, `PatternYOffset: ${f(o.tilt)}`, `PatternPhaseOffset: ${f(o.spread || 0)}`);
            if (o.pattern === 'Lissajous') cmds.push('PatternXFreq: 2.0', 'PatternYFreq: 3.0', 'PatternXPhase: 90.0', 'PatternYPhase: 0.0');
        }
        const cols = (colors && colors.length ? colors : ['#FFFFFF']).map(c => hsv(c).map(v => v.toFixed(6)).join(','));
        cmds.push(`Color: ${cols.join(',')}`);
        const d = Math.max(0, Math.min(1, (+o.dimmer || 0) / 100)).toFixed(6);
        cmds.push(`Dimmer: 0.000000,${d},1.000000,${d}`);
        cmds.push('Shutter: On');
        return cmds.join(';');
    }

    LIST.push({
        id: 'moving', label: 'Moving head', xl: 'Moving Head', use: ['part', 'hit'], dmx: true,
        options: { pattern: 'Circle', width: 45, height: 20, pan: 0, tilt: 0, cycles: 1, spread: 45, dimmer: 100 },
        choices: { pattern: MH_PATTERNS },
        labels: { width: 'Pattern width °', height: 'Pattern height °', cycles: 'Rounds per part' },
        // one block of commands per fixture the row reaches (xLights reads MH1..MH8)
        settings: (o, ctx) => {
            const heads = ctx.show && ctx.fx ? Show.movingHeadsIn(ctx.show, ctx.fx.target).map(m => m.mh.fixture) : [1];
            const list = [...new Set(heads.length ? heads : [1])].sort((a, b) => a - b);
            return list.map(n => `E_TEXTCTRL_MH${n}_Settings=${mhCommands(o, ctx.fx ? ctx.fx.colors : null, list).replace(/,/g, '&comma;')}`).join(',');
        },
        render(p, N, out) {
            const o = p.o;
            const n = p.pal.length;
            const f = n > 1 ? (p.t * (+o.cycles || 1) % 1) * (n - 1) : 0;
            const tmp = [0, 0, 0];
            palBlend(p.pal, f, tmp, 0);
            const d = Math.max(0, Math.min(1, (+o.dimmer || 0) / 100));
            for (let k = 0; k < N.n; k++) {
                const aim = mhAim(o, p.t, k);
                out[3 * k] = tmp[0] * d; out[3 * k + 1] = tmp[1] * d; out[3 * k + 2] = tmp[2] * d;
                mhState[N.g[k]] = { pan: aim.pan, tilt: aim.tilt, r: tmp[0] * d, g: tmp[1] * d, b: tmp[2] * d };
            }
        },
    });
    // where each moving head points this frame, by light index (read by the viewer)
    let mhState = {};

    // On a group row: shapes that belong to one prop (a pinwheel, a ring, a
    // marquee round a window) run on each model separately by default; things
    // that travel (chases, washes) run across the whole yard.
    // (moving heads too: xLights only runs the Moving Head effect on each head's own buffer)
    const PER_MODEL = new Set(['bars', 'spirals', 'pinwheel', 'shockwave', 'marquee', 'moving', 'fan', 'ripple', 'spirograph', 'wave', 'meteors', 'curtain', 'morph', 'snowflakes', 'strobe', 'vumeter']);
    for (const e of LIST) e.perModel = PER_MODEL.has(e.id);

    const BY_ID = new Map(LIST.map(e => [e.id, e]));

    // Rasterised words for the Text preview, cached.
    const textCache = new Map();
    // xLights draws the font with one point per buffer cell (measured against
    // its own render of the same word on the matrix).
    function textMask(word, w, h, pt) {
        const key = word + '|' + w + 'x' + h + '|' + pt;
        let m = textCache.get(key);
        if (m) return m;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        let size = pt || h * 0.7;
        g.font = `900 ${size}px Arial Black, Arial, sans-serif`;
        const tw = g.measureText(word).width;
        if (tw > w * 0.95) { size *= w * 0.95 / tw; g.font = `900 ${size}px Arial Black, Arial, sans-serif`; }
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(word, w / 2, h / 2);
        const d = g.getImageData(0, 0, w, h).data;
        const data = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) data[i] = d[i * 4 + 3] / 255;
        m = { w, h, data };
        if (textCache.size > 300) textCache.clear();
        textCache.set(key, m);
        return m;
    }

    // ---------- colours ----------

    const DEFAULT_SCHEMES = [
        { id: 'christmas', label: 'Christmas', colors: ['#FF1414', '#14E632', '#FFFFFF'] },
        { id: 'candycane', label: 'Candy cane', colors: ['#FF1414', '#FFFFFF'] },
        { id: 'icy', label: 'Icy', colors: ['#FFFFFF', '#8FD6FF', '#2A6BAF'] },
        { id: 'warm', label: 'Warm white', colors: ['#FFF3D6', '#FF9A3C', '#FFD9A0'] },
        { id: 'gold', label: 'Gold', colors: ['#FFD166', '#FF9A3C', '#FFFFFF'] },
        { id: 'sacred', label: 'Silent night', colors: ['#FFFFFF', '#6FA8FF', '#B9A0FF'] },
        { id: 'neon', label: 'Neon', colors: ['#FF2FA0', '#19E0E0', '#FFE14D'] },
        { id: 'fire', label: 'Fire', colors: ['#FF2A00', '#FF8A00', '#FFD400'] },
        { id: 'rainbow', label: 'Rainbow', colors: ['#FF0000', '#FF8000', '#FFFF00', '#00FF00', '#0080FF', '#8000FF'] },
        { id: 'white', label: 'White', colors: ['#FFFFFF'] },
        { id: 'halloween', label: 'Halloween', colors: ['#FF6A00', '#8A2BE2', '#39FF14'] },
        { id: 'orangepurple', label: 'Orange & purple', colors: ['#FF6A00', '#8A2BE2'] },
        { id: 'greenpurple', label: 'Green & purple', colors: ['#39FF14', '#8A2BE2'] },
        { id: 'redorange', label: 'Red & orange', colors: ['#FF1414', '#FF6A00'] },
    ];

    // The user's own list of schemes (add / edit / remove), kept in the browser
    // and in project files. Rows copy the colours, so editing a scheme later
    // does not change lights already planned.
    const SCHEME_KEY = 'xlweb-schemes';
    const cloneSchemes = list => list.map(s => ({ id: s.id, label: s.label, colors: s.colors.slice() }));
    let schemes = cloneSchemes(DEFAULT_SCHEMES);
    // Built-in schemes added after someone saved their own list still reach them;
    // ones they deleted stay deleted (SEEN_KEY: built-ins they have already had).
    const SEEN_KEY = 'xlweb-schemes-seen';
    try {
        const saved = JSON.parse(localStorage.getItem(SCHEME_KEY) || 'null');
        if (Array.isArray(saved) && saved.length && saved.every(s => s && s.id && Array.isArray(s.colors) && s.colors.length)) {
            schemes = cloneSchemes(saved);
            const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '["christmas","candycane","icy","warm","gold","sacred","neon","fire","rainbow","white"]'));
            const have = new Set(schemes.map(s => s.id));
            const fresh = DEFAULT_SCHEMES.filter(s => !seen.has(s.id) && !have.has(s.id));
            if (fresh.length) { schemes = schemes.concat(cloneSchemes(fresh)); localStorage.setItem(SCHEME_KEY, JSON.stringify(schemes)); }
        }
        localStorage.setItem(SEEN_KEY, JSON.stringify(DEFAULT_SCHEMES.map(s => s.id)));
    } catch (e) { /* defaults */ }

    function setSchemes(list) {
        schemes = cloneSchemes(list && list.length ? list : DEFAULT_SCHEMES);
        try { localStorage.setItem(SCHEME_KEY, JSON.stringify(schemes)); } catch (e) { /* storage blocked */ }
        document.dispatchEvent(new CustomEvent('xl:schemes'));
    }
    const resetSchemes = () => setSchemes(DEFAULT_SCHEMES);

    // ---------- random colour schemes that still look deliberate ----------

    const HUE_NAMES = [[0, 'Red'], [18, 'Coral'], [32, 'Orange'], [48, 'Gold'], [60, 'Yellow'], [90, 'Lime'], [130, 'Green'], [160, 'Mint'],
        [180, 'Teal'], [195, 'Aqua'], [212, 'Sky'], [232, 'Blue'], [255, 'Indigo'], [275, 'Violet'], [300, 'Magenta'], [325, 'Pink'], [345, 'Rose'], [360, 'Red']];
    const hueName = h => { h = ((h % 360) + 360) % 360; let best = HUE_NAMES[0]; for (const n of HUE_NAMES) if (Math.abs(n[0] - h) < Math.abs(best[0] - h)) best = n; return best[1]; };
    function hsl(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
        return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    // Harmonies: analogous, complementary, triad, split-complementary, one hue + white.
    function randomScheme(rng = Math.random) {
        const h = Math.floor(rng() * 360);
        const kinds = [
            ['analogous', [h - 30, h, h + 30]],
            ['complementary', [h, h + 180]],
            ['triad', [h, h + 120, h + 240]],
            ['split', [h, h + 150, h + 210]],
            ['mono', [h]],
        ];
        const [kind, hues] = kinds[Math.floor(rng() * kinds.length)];
        const colors = hues.map(x => hsl(x, 0.85 + rng() * 0.15, 0.48 + rng() * 0.1));
        if (kind === 'mono') colors.push(hsl(h, 0.9, 0.75));
        if (kind === 'mono' || rng() < 0.35) colors.push('#FFFFFF');
        const names = [...new Set(hues.map(hueName))];
        const label = names.length > 1 ? names.slice(0, 2).join(' & ') : `${names[0]} glow`;
        return { id: 'r' + Math.random().toString(36).slice(2, 8), label, colors };
    }

    const hexToRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

    // extra: { sparkles: 0..200, music: bool } -> palette sparkles (white)
    function paletteString(colors, extra = null) {
        const slots = colors.slice(0, 8);
        while (slots.length < 8) slots.push('#000000');
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(`C_BUTTON_Palette${i + 1}=${slots[i]}`);
        for (let i = 0; i < Math.min(8, colors.length); i++) parts.push(`C_CHECKBOX_Palette${i + 1}=1`);
        if (extra && extra.sparkles > 0) {
            parts.push(`C_SLIDER_SparkleFrequency=${Math.round(Math.min(200, extra.sparkles))}`, 'C_COLOURPICKERCTRL_SparklesColour=#FFFFFF');
            if (extra.music) parts.push('C_CHECKBOX_MusicSparkles=1');
        }
        return parts.sort().join(',');
    }

    // The same look, turned round (a later phrase, or every other beat of a chopped row).
    const FLIP = { 'Left-Right': 'Right-Left', 'Right-Left': 'Left-Right', 'From Middle': 'To Middle', 'To Middle': 'From Middle', up: 'down', down: 'up', expand: 'compress', compress: 'expand', Left: 'Right', Right: 'Left', left: 'right', right: 'left', 'Right to Left': 'Left to Right', 'Left to Right': 'Right to Left', Down: 'Up', Up: 'Down', Explode: 'Implode', Implode: 'Explode', open: 'close', close: 'open' };
    function flip(effect, o) {
        const out = { ...o };
        for (const k of ['direction', 'movement', 'effect']) if (out[k] && FLIP[out[k]]) out[k] = FLIP[out[k]];
        if (effect === 'pinwheel' && out.speed) out.speed = -out.speed;
        if (effect === 'spirals' && out.rotation) out.rotation = -out.rotation;
        if (effect === 'fan') out.reverse = out.reverse ? 0 : 1;
        return out;
    }

    // ---------- imported xLights effects ----------

    const kvOf = str => { const o = {}; for (const part of String(str || '').split(',')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i)] = part.slice(i + 1); } return o; };
    // The colors an xLights palette string has ticked, in order.
    function palColors(str) {
        const kv = kvOf(str), out = [];
        for (let i = 1; i <= 8; i++) {
            if (kv['C_CHECKBOX_Palette' + i] !== '1') continue;
            const v = kv['C_BUTTON_Palette' + i] || '';
            const hex = /#[0-9a-f]{6}/i.exec(v);
            out.push(hex ? hex[0].toUpperCase() : '#FFFFFF');
        }
        return out.length ? out : ['#FFFFFF'];
    }
    // The same palette with its ticked colors replaced by `colors` (in order, repeating).
    function recolorPal(str, colors) {
        const parts = String(str || '').split(',');
        let j = 0;
        const ticked = new Set();
        for (const part of parts) { const m = /^C_CHECKBOX_Palette(\d)=1$/.exec(part); if (m) ticked.add(m[1]); }
        const order = [...ticked].sort();
        const map = new Map(order.map(n => [n, colors[(j++) % colors.length]]));
        return parts.map(part => { const m = /^C_BUTTON_Palette(\d)=/.exec(part); return m && map.has(m[1]) ? `C_BUTTON_Palette${m[1]}=${map.get(m[1])}` : part; }).join(',');
    }
    const MIXES = { Additive: 'add', Max: 'add', 'Highlight Vibrant': 'add', '1 is Unmask': 'unmask', '1 is True Unmask': 'unmask', '1 is Mask': 'mask', Layered: 'layered', Average: 'average' };
    // How the preview draws an imported effect: the closest effect here, its main
    // settings read from xLights' own, plus brightness, fades, blend and buffer.
    // The exported sequence always gets the original settings, untouched.
    // Imported effect settings the preview reads: option <- [xLights setting, default, scale].
    // Each may also come as a value curve (E_VALUECURVE_<setting>), followed over the effect.
    const XL_NUM = {
        On: ['on', { start: ['Eff_On_Start', 100], end: ['Eff_On_End', 100], cycles: ['On_Cycles', 1], transparency: ['On_Transparency', 0] }],
        'Color Wash': ['wash', { cycles: ['ColorWash_Cycles', 1], circular: ['ColorWash_CircularPalette', 0] }],
        SingleStrand: ['chase', { chases: ['Number_Chases', 1], rotations: ['Chase_Rotations', 1], size: ['Color_Mix1', 33] }],
        Bars: ['bars', { bars: ['Bars_BarCount', 1], cycles: ['Bars_Cycles', 1], look3d: ['Bars_3D', 0] }],
        Spirals: ['spirals', { count: ['Spirals_Count', 1], rotation: ['Spirals_Rotation', 20], thickness: ['Spirals_Thickness', 50], look3d: ['Spirals_3D', 0] }],
        Pinwheel: ['pinwheel', { arms: ['Pinwheel_Arms', 3], speed: ['Pinwheel_Speed', 10], twist: ['Pinwheel_Twist', 0], size: ['Pinwheel_ArmSize', 100], thickness: ['Pinwheel_Thickness', 0], cw: ['Pinwheel_Rotation', 0], offset: ['Pinwheel_Offset', 0], xc: ['PinwheelXC', 0], yc: ['PinwheelYC', 0] }],
        Twinkle: ['twinkle', { count: ['Twinkle_Count', 3], steps: ['Twinkle_Steps', 30] }],
        Shockwave: ['shockwave', { width: ['Shockwave_End_Width', 10], w0: ['Shockwave_Start_Width', 5], cx: ['Shockwave_CenterX', 50], cy: ['Shockwave_CenterY', 50], r0: ['Shockwave_Start_Radius', 1], r1: ['Shockwave_End_Radius', 10] }],
        Marquee: ['marquee', { band: ['Marquee_Band_Size', 3], skip: ['Marquee_Skip_Size', 0], speed: ['Marquee_Speed', 3] }],
        Butterfly: ['butterfly', { speed: ['Butterfly_Speed', 10] }],
        Fan: ['fan', { blades: ['Fan_Num_Blades', 3], width: ['Fan_Blade_Width', 50], turns: ['Fan_Revolutions', 720, 1 / 360], twist: ['Fan_Blade_Angle', 90], reverse: ['Fan_Reverse', 0], grow: ['Fan_Duration', 80] }],
        Ripple: ['ripple', { thickness: ['Ripple_Thickness', 3], cycles: ['Ripple_Cycles', 1] }],
        Spirograph: ['spirograph', { R: ['Spirograph_R', 20], r: ['Spirograph_r', 10], d: ['Spirograph_d', 30], speed: ['Spirograph_Speed', 10], animate: ['Spirograph_Animate', 0], length: ['Spirograph_Length', 20], width: ['Spirograph_Width', 1] }],
        Wave: ['wave', { waves: ['Number_Waves', 900, 1 / 360], height: ['Wave_Height', 50], thickness: ['Thickness_Percentage', 5], speed: ['Wave_Speed', 10] }],
        Meteors: ['meteors', { count: ['Meteors_Count', 10], length: ['Meteors_Length', 25], speed: ['Meteors_Speed', 10] }],
        Curtain: ['curtain', { times: ['Curtain_Speed', 1] }],
        Morph: ['morph', { sweep: ['MorphDuration', 20] }],
        Snowflakes: ['snowflakes', { count: ['Snowflakes_Count', 5], speed: ['Snowflakes_Speed', 10], type: ['Snowflakes_Type', 1] }],
        Strobe: ['strobe', { count: ['Number_Strobes', 3], duration: ['Strobe_Duration', 10] }],
    };
    const PREFIXES = ['E_SLIDER_', 'E_TEXTCTRL_', 'E_CHECKBOX_', 'E_SPINCTRL_'];
    function parseCurve(v) {
        if (!/Active=TRUE/.test(v || '')) return null;
        const f = {};
        for (const part of v.split('|')) { const i = part.indexOf('='); if (i > 0) f[part.slice(0, i)] = part.slice(i + 1); }
        const c = { type: f.Type || 'Flat', min: parseFloat(f.Min) || 0, max: parseFloat(f.Max) || 100, p1: parseFloat(f.P1) || 0, p2: parseFloat(f.P2) || 0, p3: parseFloat(f.P3) || 0 };
        if (f.Values) c.values = f.Values.split(';').map(x => x.split(':').map(Number)).filter(x => x.length === 2 && !isNaN(x[0]));
        if (!f.RV) { const span = c.max - c.min; c.p1 = c.min + span * c.p1 / 100; c.p2 = c.min + span * c.p2 / 100; }
        return c;
    }
    // An option's value at t (0..1 through the effect) when it follows a curve.
    function optionsAt(o, t) {
        if (!o.__curves) return o;
        const out = { ...o };
        for (const [k, c] of Object.entries(o.__curves)) out[k] = curveAt(c, t) * (c.scale || 1);
        return out;
    }
    const TRANSFORMS = new Set(['Rotate CC 90', 'Rotate CW 90', 'Rotate 180', 'Flip Horizontal', 'Flip Vertical', 'Rotate CC 90 and Flip', 'Rotate CW 90 and Flip']);
    // How the preview draws an imported effect: the closest effect here, its main
    // settings (and their value curves) read from xLights' own, plus brightness,
    // fades, blend, buffer, transform and rotation. The exported sequence always
    // gets the original settings, untouched.
    function fromXl(name, settings, pal) {
        const S = kvOf(settings);
        const str = (k, d) => (S[k] != null && S[k] !== '' ? S[k] : d);
        const pick = (v, list, d) => (list.includes(v) ? v : d);
        let id = 'glow', o = {};
        const curves = {};
        const tbl = XL_NUM[name];
        if (tbl) {
            id = tbl[0];
            for (const [key, [set, def, scale = 1]] of Object.entries(tbl[1])) {
                let v = def;
                for (const pre of PREFIXES) { const x = parseFloat(S[pre + set]); if (!isNaN(x)) { v = x; break; } }
                o[key] = v * scale;
                const c = parseCurve(S['E_VALUECURVE_' + set]);
                if (c) { c.scale = scale; curves[key] = c; }
            }
        }
        switch (name) {
            case 'SingleStrand': o.direction = pick(str('E_CHOICE_Chase_Type1'), CHASE_DIRS, /Right/.test(str('E_CHOICE_Chase_Type1', '')) ? 'Right-Left' : 'Left-Right'); break;
            case 'Bars': o.direction = pick(str('E_CHOICE_Bars_Direction'), ['up', 'down', 'Left', 'Right', 'expand', 'compress'], 'up'); break;
            case 'Pinwheel': o.look = pick(str('E_CHOICE_Pinwheel_3D'), LOOKS, 'None'); break;
            case 'Shockwave': o.palBlend = 1; break;
            case 'Ripple': o.shape = pick(str('E_CHOICE_Ripple_Object_To_Draw'), ['Circle', 'Square', 'Triangle', 'Star', 'Snow Flake'], 'Circle'); o.movement = str('E_CHOICE_Ripple_Movement', 'Explode'); break;
            case 'Wave': o.type = pick(str('E_CHOICE_Wave_Type'), ['Sine', 'Triangle'], 'Sine'); o.direction = str('E_CHOICE_Wave_Direction', 'Right to Left'); break;
            case 'Meteors': o.direction = pick(str('E_CHOICE_Meteors_Effect'), ['Down', 'Up', 'Left', 'Right'], 'Down'); break;
            case 'Curtain': o.effect = str('E_CHOICE_Curtain_Effect', 'open'); o.edge = str('E_CHOICE_Curtain_Edge', 'left'); break;
            case 'Morph': {
                const n = k => parseFloat(S['E_SLIDER_' + k]);
                const sy = n('Morph_Start_Y1') || 0, ey = isNaN(n('Morph_End_Y1')) ? 100 : n('Morph_End_Y1'), sx = n('Morph_Start_X1') || 0, ex = n('Morph_End_X1') || 0;
                o.direction = Math.abs(ey - sy) >= Math.abs(ex - sx) ? (ey >= sy ? 'up' : 'down') : (ex >= sx ? 'right' : 'left');
                break;
            }
            case 'Off': id = /Transparent/.test(str('E_CHOICE_Off_Style', 'Black')) ? 'nothing' : 'off'; break;
            // these only bend or mirror the layers under them; they draw nothing themselves
            case 'Warp': case 'Kaleidoscope': id = 'nothing'; break;
            case 'Faces': id = 'faces'; o = { face: str('E_CHOICE_Faces_FaceDefinition', '') }; break;
            case 'Pictures': id = 'pictures'; o = { file: str('E_FILEPICKER_Pictures_Filename', ''), scaling: str('E_CHOICE_Scaling', 'Scale To Fit') }; break;
            case 'VU Meter': {
                const t = str('E_CHOICE_VUMeter_Type', '');
                if (/Timing Event .*Sweep/.test(t)) { id = 'vumeter'; o = { type: 'sweep', track: str('E_CHOICE_VUMeter_TimingTrack', ''), size: parseFloat(S.E_SLIDER_VUMeter_Bars) || 6 }; }
                else if (/Timing Event Pulse/.test(t)) { id = 'vumeter'; o = { type: 'flash', track: str('E_CHOICE_VUMeter_TimingTrack', ''), size: parseFloat(S.E_SLIDER_VUMeter_Bars) || 8 }; }
                break;
            }
        }
        const eff = BY_ID.get(id) || BY_ID.get('glow');
        const colors = palColors(pal);
        const tr = v => (v === 'Wipe' ? 'wipe' : v === 'Circle Explode' ? 'circle' : null);
        const num = (k, d) => { const v = parseFloat(S[k]); return isNaN(v) ? d : v; };
        const opts = { ...eff.options, ...o };
        if (Object.keys(curves).length) opts.__curves = curves;
        // the whole picture turning (RotoZoom): turns over the effect, or a fixed angle
        const rotCurve = parseCurve(S.B_VALUECURVE_Rotation);
        const turns = num('B_SLIDER_Rotations', 0) / 10;
        return {
            eff, o: opts, colors, pal: colors.map(hexToRgb),
            mix: MIXES[str('T_CHOICE_LayerMethod', 'Normal')] || 'normal',
            level: Math.max(0, Math.min(100, num('C_SLIDER_Brightness', 100))),
            fadeIn: Math.max(0, num('T_TEXTCTRL_Fadein', 0)), fadeOut: Math.max(0, num('T_TEXTCTRL_Fadeout', 0)),
            inTr: tr(str('T_CHOICE_In_Transition_Type', '')), outTr: tr(str('T_CHOICE_Out_Transition_Type', '')),
            perModel: /Per Model|Overlay/.test(str('B_CHOICE_BufferStyle', '')),
            // a group's "Per Preview" buffer vs its own (Default) one
            ppv: /^Per Preview/.test(str('B_CHOICE_BufferStyle', 'Default')),
            transform: TRANSFORMS.has(str('B_CHOICE_BufferTransform', '')) ? str('B_CHOICE_BufferTransform', '') : null,
            spin: rotCurve && turns > 0 ? turns * Math.abs((rotCurve.p2 - rotCurve.p1) / 100 || 1) : 0,
            rot0: !rotCurve ? num('B_SLIDER_Rotation', 0) / 100 : 0,
        };
    }

    const resetMovingHeads = () => { mhState = {}; };
    const movingHeadState = () => mhState;

    return {
        LIST, get: id => BY_ID.get(id), resetMovingHeads, movingHeadState, MH_PATTERNS,
        get SCHEMES() { return schemes; },
        DEFAULT_SCHEMES, setSchemes, resetSchemes, randomScheme,
        hexToRgb, paletteString, ADD, BLENDS, flip, curveAt, curveString, hash, fromXl, palColors, recolorPal, optionsAt, setPictureLoader,
    };
})();
