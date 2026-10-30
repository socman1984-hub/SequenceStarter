// Module worker: Whisper speech recognition with word timestamps
// (Transformers.js). Audio arrives as 16 kHz mono windows, each already cut
// at a gap in the singing, so no word is split and long instrumental stretches
// never reach the model (that is where Whisper invents text).
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

let asr = null, loadedModel = null, device = null;
const post = (type, data = {}) => self.postMessage({ type, ...data });

// The browser refuses to cache a single file much over 250 MB, and the larger
// speech model's encoder is 336 MB: it would download again on every run. So big
// files are kept in parts, with a small entry for the file itself written last,
// which means a part-saved file just counts as not cached.
const PART_BYTES = 100 * 1048576;
const openCache = () => caches.open('transformers-cache');
const partKey = (key, i) => `${key}?part=${i}`;

env.useCustomCache = true;
env.customCache = {
    async match(key) {
        const cache = await openCache();
        const hit = await cache.match(key);
        const n = hit && parseInt(hit.headers.get('x-parts') || '0', 10);
        if (!n) return hit;
        const parts = [];
        for (let i = 0; i < n; i++) {
            const part = await cache.match(partKey(key, i));
            if (!part) return undefined;
            parts.push(await part.blob());
        }
        const whole = new Blob(parts);
        return new Response(whole, { headers: { 'content-length': String(whole.size) } });
    },
    async put(key, response) {
        const cache = await openCache();
        const whole = await response.clone().blob();
        if (whole.size <= PART_BYTES) return cache.put(key, response);
        const n = Math.ceil(whole.size / PART_BYTES);
        for (let i = 0; i < n; i++) {
            await cache.put(partKey(key, i), new Response(whole.slice(i * PART_BYTES, (i + 1) * PART_BYTES)));
        }
        await cache.put(key, new Response(null, { headers: { 'x-parts': String(n) } }));
    },
};

async function load(model) {
    if (asr && loadedModel === model) return;
    device = (self.navigator && navigator.gpu && await navigator.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
    const files = {};
    asr = await pipeline('automatic-speech-recognition', model, {
        device,
        dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: x => {
            if (x.status === 'progress' && x.total) {
                files[x.file] = [x.loaded, x.total];
                let l = 0, t = 0;
                for (const k in files) { l += files[k][0]; t += files[k][1]; }
                post('download', { loaded: l, total: t });
            }
        },
    });
    loadedModel = model;
}

self.onmessage = async (e) => {
    const { model, windows, multilingual } = e.data;
    try {
        post('status', { text: 'Loading speech model' });
        await load(model);
        post('status', { text: `Listening for words (${device === 'webgpu' ? 'GPU' : 'CPU'})` });
        const words = [];
        for (let i = 0; i < windows.length; i++) {
            const w = windows[i];
            const opts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
            if (multilingual) opts.task = 'transcribe';
            const r = await asr(w.audio, opts);
            for (const c of r.chunks || []) {
                const [s, en] = c.timestamp;
                if (s == null) continue;
                words.push({ text: c.text.trim(), s: w.t0 + s, e: w.t0 + (en ?? s + 0.2) });
            }
            post('progress', { value: (i + 1) / windows.length });
        }
        post('done', { words, device });
    } catch (err) {
        post('error', { message: String(err && err.message || err) });
    }
};
