'use strict';

// Imported xLights Shader and Video effects, drawn for the preview.
//   Shaders: ISF (.fs) files run with WebGL2 the way xLights' ShaderEffect runs
//   them (same uniforms, zoom/offset, inputs from the effect's settings).
//   Videos: the file played in a <video> element, kept in step with the song.
// Files come from the show folder through setLoader(path -> object URL).
const XLMedia = (() => {
    let loader = null;
    const setLoader = fn => { loader = fn; };
    const urls = new Map();
    function urlFor(path) {
        if (!urls.has(path)) urls.set(path, loader ? Promise.resolve(loader(path)).catch(() => null) : Promise.resolve(null));
        return urls.get(path);
    }

    // ---------- shaders ----------

    let gl = null, glCanvas = null, quad = null;
    function getGL() {
        if (gl || gl === false) return gl;
        try {
            glCanvas = document.createElement('canvas');
            gl = glCanvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false }) || false;
        } catch (e) { gl = false; }
        if (gl) {
            quad = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]), gl.STATIC_DRAW);
        }
        return gl;
    }
    const VS = `#version 300 es
precision highp float;
uniform vec2 RENDERSIZE; uniform vec2 XL_OFFSET; uniform float XL_ZOOM; uniform float XL_DURATION;
in vec2 vpos; in vec2 tpos;
out vec2 texCoord; out vec2 orig_FragNormCoord; out vec2 orig_FragCoord; out vec2 xl_FragNormCoord; out vec2 xl_FragCoord;
vec2 XL_ZOOM_OFFSET(vec2 coord) { return ((coord.xy - (XL_OFFSET - 0.5) - 0.5) / XL_ZOOM) + 0.5; }
void main() {
  gl_Position = vec4(vpos, 0.0, 1.0); texCoord = tpos;
  orig_FragNormCoord = tpos; xl_FragNormCoord = XL_ZOOM_OFFSET(tpos);
  orig_FragCoord = orig_FragNormCoord * RENDERSIZE; xl_FragCoord = xl_FragNormCoord * RENDERSIZE;
}`;
    const POW = `float xl_pow(float x, float y) { if (x >= 0.0 || fract(y) != 0.0) return pow(x, y); float m = pow(abs(x), y); return (mod(y, 2.0) != 0.0) ? -m : m; }
vec2 xl_pow(vec2 x, vec2 y) { return vec2(xl_pow(x.x, y.x), xl_pow(x.y, y.y)); }
vec3 xl_pow(vec3 x, vec3 y) { return vec3(xl_pow(x.x, y.x), xl_pow(x.y, y.y), xl_pow(x.z, y.z)); }
vec4 xl_pow(vec4 x, vec4 y) { return vec4(xl_pow(x.x, y.x), xl_pow(x.y, y.y), xl_pow(x.z, y.z), xl_pow(x.w, y.w)); }
`;
    // ISF JSON header + body
    function parseIsf(text) {
        let json = {}, body = text;
        const a = text.indexOf('/*'), b = text.indexOf('*/');
        if (a >= 0 && b > a) {
            try { json = JSON.parse(text.slice(a + 2, b)); } catch (e) { json = {}; }
            body = text.slice(b + 2);
        }
        return { json, body };
    }
    // Desktop GLSL turns int literals into floats where needed; GLSL ES does not.
    // Second attempt: integer literals become floats except in array indexes,
    // int declarations, for-loop counters and #directives.
    function floatify(src) {
        return src.split('\n').map(line => {
            if (/^\s*#/.test(line) || /\bint\b|\bivec|\bfor\s*\(|\[[^\]]*\]|%|\bswitch\b|\bcase\b/.test(line)) return line;
            return line.replace(/(^|[^\w.])(\d+)(?![\w.])/g, '$1$2.0');
        }).join('\n');
    }
    // GLSL ES only allows constant initializers on globals: move the others into
    // the start of main() (declare at the top, assign when main begins).
    function hoistGlobals(src) {
        let depth = 0;
        const moved = [];
        const lines = src.split('\n').map(line => {
            const atTop = depth === 0;
            for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') depth--; }
            if (!atTop) return line;
            const m = /^\s*((?:highp |mediump |lowp )?(?:float|int|bool|vec[234]|ivec[234]|mat[234]))\s+(\w+)\s*=\s*([^;]+);\s*(\/\/.*)?$/.exec(line);
            if (!m || /^\s*const\b/.test(line)) return line;
            moved.push(`${m[2]} = ${m[3]};`);
            return `${m[1]} ${m[2]};`;
        });
        if (!moved.length) return src;
        return lines.join('\n').replace(/void\s+main\s*\(\s*(void)?\s*\)\s*\{/, x => x + '\n' + moved.join('\n'));
    }
    function buildFs(json, body, floaty, hoist) {
        let pre = `#version 300 es
precision highp float; precision highp int;
uniform float TIME; uniform float TIMEDELTA; uniform vec2 RENDERSIZE; uniform bool clearBuffer; uniform bool resetNow;
uniform int NUMCOLORS; uniform int PASSINDEX; uniform int FRAMEINDEX; uniform vec2 XL_OFFSET; uniform float XL_ZOOM; uniform float XL_DURATION;
uniform sampler2D texSampler; uniform vec4 DATE;
in vec2 texCoord; in vec2 orig_FragNormCoord; in vec2 orig_FragCoord; in vec2 xl_FragNormCoord; in vec2 xl_FragCoord;
out vec4 fragmentColor;
#define XL_SHADER
`;
        let fft = '', canvas = '';
        for (const inp of json.INPUTS || []) {
            const n = inp.NAME;
            if (!n) continue;
            switch ((inp.TYPE || '').toLowerCase()) {
                case 'float': pre += `uniform float ${n};\n`; break;
                case 'bool': case 'event': pre += `uniform bool ${n};\n`; break;
                case 'long': pre += `uniform int ${n};\n`; break;
                case 'point2d': pre += `uniform vec2 ${n};\n`; break;
                case 'color': pre += `uniform vec4 ${n};\n`; break;
                case 'audiofft': case 'audio': fft = n; break;
                case 'image': canvas = n; break;
            }
        }
        pre += POW;
        pre += `vec4 IMG_NORM_PIXEL(sampler2D s, vec2 l) { return texture(s, l); }
vec4 IMG_PIXEL(sampler2D s, vec2 l) { return texture(s, l / RENDERSIZE); }
vec4 IMG_THIS_PIXEL(sampler2D s) { return texture(s, xl_FragNormCoord); }
vec4 IMG_THIS_NORM_PIXEL(sampler2D s) { return texture(s, xl_FragNormCoord); }
ivec2 IMG_SIZE(sampler2D s) { return textureSize(s, 0); }
`;
        let code = body.replace(/\u0085/g, '.')
            .replace(/gl_FragColor/g, 'fragmentColor').replace(/vv_FragNormCoord|isf_FragNormCoord|gl_FragNormCoord/g, 'xl_FragNormCoord')
            .replace(/isf_FragCoord|gl_FragCoord/g, 'xl_FragCoord').replace(/\bvarying\s/g, 'uniform ').replace(/texture2D\s*\(/g, 'texture(')
            .replace(/(^|[^\w])pow\s*\(/g, '$1xl_pow(');
        if (fft) code = code.replace(new RegExp('\\b' + fft + '\\b', 'g'), 'texSampler');
        else if (canvas) code = code.replace(new RegExp('\\b' + canvas + '\\b', 'g'), 'texSampler');
        if (hoist) code = hoistGlobals(code);
        if (floaty) code = floatify(code);
        return pre + code;
    }
    function compile(src) {
        const g = gl;
        const mk = (type, s) => { const sh = g.createShader(type); g.shaderSource(sh, s); g.compileShader(sh); if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) { const log = g.getShaderInfoLog(sh); g.deleteShader(sh); throw new Error(log); } return sh; };
        const p = g.createProgram();
        g.attachShader(p, mk(g.VERTEX_SHADER, VS));
        g.attachShader(p, mk(g.FRAGMENT_SHADER, src));
        g.bindAttribLocation(p, 0, 'vpos'); g.bindAttribLocation(p, 1, 'tpos');
        g.linkProgram(p);
        if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
        return p;
    }
    const shaders = new Map();   // path -> { state, prog, json, error }
    function shaderFor(path) {
        let e = shaders.get(path);
        if (e) return e;
        e = { state: 'loading' };
        shaders.set(path, e);
        if (!getGL()) { e.state = 'failed'; e.error = 'no WebGL2'; return e; }
        urlFor(path).then(u => (u ? fetch(u).then(r => r.text()) : null)).then(text => {
            if (!text) { e.state = 'failed'; e.error = 'file not found'; return; }
            const { json, body } = parseIsf(text);
            e.json = json;
            for (const [floaty, hoist] of [[false, false], [true, false], [false, true], [true, true]]) {
                try { e.prog = compile(buildFs(json, body, floaty, hoist)); e.state = 'ready'; return; } catch (err) { e.error = String(err.message || err).slice(0, 300); }
            }
            e.state = 'failed';
            console.warn('Shader preview unavailable for', path, e.error);
        }).catch(err => { e.state = 'failed'; e.error = String(err); });
        return e;
    }
    // One frame of a shader as RGBA (w x h), or null while loading / if it can't run here.
    // s: { path, time, speed, zoom, ox, oy, params: kv of the effect settings, colors: [[r,g,b]...] }
    function shaderFrame(s, w, h) {
        const e = shaderFor(s.path);
        if (e.state !== 'ready') return null;
        const g = gl;
        w = Math.max(2, Math.min(256, Math.round(w))); h = Math.max(2, Math.min(256, Math.round(h)));
        if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
        g.viewport(0, 0, w, h);
        g.useProgram(e.prog);
        g.bindBuffer(g.ARRAY_BUFFER, quad);
        g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 16, 0);
        g.enableVertexAttribArray(1); g.vertexAttribPointer(1, 2, g.FLOAT, false, 16, 8);
        const U = n => g.getUniformLocation(e.prog, n);
        const f1 = (n, v) => { const l = U(n); if (l) g.uniform1f(l, v); };
        const i1 = (n, v) => { const l = U(n); if (l) g.uniform1i(l, v); };
        f1('TIME', s.time); f1('TIMEDELTA', 0.025); f1('XL_ZOOM', s.zoom); f1('XL_DURATION', s.duration || 1);
        const l2 = U('RENDERSIZE'); if (l2) g.uniform2f(l2, w, h);
        const lo = U('XL_OFFSET'); if (lo) g.uniform2f(lo, s.ox, s.oy);
        const ld = U('DATE'); if (ld) g.uniform4f(ld, 2000, 1, 1, s.abs || 0);
        i1('NUMCOLORS', s.colors.length); i1('PASSINDEX', 0); i1('FRAMEINDEX', Math.round(s.time * 40));
        f1('clearBuffer', 0); f1('resetNow', s.first ? 1 : 0);
        let ci = 0;
        for (const inp of e.json.INPUTS || []) {
            const n = inp.NAME, t = (inp.TYPE || '').toLowerCase(), l = n && U(n);
            if (!l) continue;
            const kv = s.params;
            const num = (key, def) => { for (const pre of ['E_SLIDER_', 'E_TEXTCTRL_']) { const v = parseFloat(kv[pre + key]); if (!isNaN(v)) return v; } return def; };
            if (t === 'float') g.uniform1f(l, num('SHADERXYZZY_' + n, (inp.DEFAULT ?? 0) * 100) / 100);
            else if (t === 'long') {
                const ch = kv['E_CHOICE_SHADERXYZZY_' + n];
                let v = inp.DEFAULT ?? 0;
                if (ch != null && Array.isArray(inp.LABELS) && Array.isArray(inp.VALUES)) { const i = inp.LABELS.indexOf(ch); if (i >= 0) v = inp.VALUES[i]; }
                else v = Math.round(num('SHADERXYZZY_' + n, v));
                g.uniform1i(l, v);
            } else if (t === 'bool' || t === 'event') g.uniform1i(l, kv['E_CHECKBOX_SHADERXYZZY_' + n] === '1' ? 1 : (inp.DEFAULT ? 1 : 0));
            else if (t === 'point2d') {
                const d = inp.DEFAULT || [0, 0];
                g.uniform2f(l, num('SHADERXYZZY_' + n + 'X', d[0] * 100) / 100, num('SHADERXYZZY_' + n + 'Y', d[1] * 100) / 100);
            } else if (t === 'color') {
                const c = s.colors[ci % Math.max(1, s.colors.length)] || [255, 255, 255];
                ci++;
                g.uniform4f(l, c[0] / 255, c[1] / 255, c[2] / 255, 1);
            }
        }
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        const px = new Uint8Array(w * h * 4);
        g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        return { w, h, data: px };
    }
    const shaderState = path => { const e = shaders.get(path); return e ? e.state : 'none'; };

    // ---------- videos ----------

    const videos = new Map();   // key -> { el, ready, canvas, ctx }
    function videoFor(key, path) {
        let v = videos.get(key);
        if (v) return v;
        v = { ready: false };
        videos.set(key, v);
        urlFor(path).then(u => {
            if (!u) { v.failed = true; return; }
            const el = document.createElement('video');
            el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
            el.src = u;
            el.addEventListener('loadeddata', () => { v.ready = true; });
            el.addEventListener('error', () => { v.failed = true; });
            v.el = el;
            v.canvas = document.createElement('canvas');
            v.ctx = v.canvas.getContext('2d', { willReadFrequently: true });
        });
        return v;
    }
    // The video frame for time `at` (seconds into the video), w x h RGBA, or null.
    // While the song plays the video plays along; otherwise it seeks.
    function videoFrame(key, path, at, speed, w, h, playing, crop) {
        const v = videoFor(key, path);
        if (!v.ready || v.failed) return null;
        const el = v.el;
        const dur = el.duration || 0;
        if (dur > 0) at = Math.max(0, Math.min(dur - 0.05, at));
        if (playing) {
            el.playbackRate = Math.max(0.1, Math.min(4, speed || 1));
            if (el.paused) el.play().catch(() => { });
            if (Math.abs(el.currentTime - at) > 0.35) el.currentTime = at;
        } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - at) > 0.04) el.currentTime = at;
        }
        w = Math.max(2, Math.min(256, Math.round(w))); h = Math.max(2, Math.min(256, Math.round(h)));
        if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
        const vw = el.videoWidth, vh = el.videoHeight;
        if (!vw || !vh) return null;
        // crop: left/right/top/bottom in % of the frame (xLights: left 0, right 100, bottom 0, top 100)
        const sx = vw * (crop.left / 100), sw = vw * Math.max(1, crop.right - crop.left) / 100;
        const sy = vh * (1 - crop.top / 100), sh = vh * Math.max(1, crop.top - crop.bottom) / 100;
        try { v.ctx.drawImage(el, sx, sy, sw, sh, 0, 0, w, h); } catch (e) { return null; }
        return { w, h, data: v.ctx.getImageData(0, 0, w, h).data, topDown: true };
    }
    function pauseAll() { for (const v of videos.values()) if (v.el && !v.el.paused) v.el.pause(); }

    return { setLoader, shaderFrame, shaderState, videoFrame, pauseAll };
})();
