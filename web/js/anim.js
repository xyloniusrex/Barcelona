/* anim.js — on-device playback of the Python-rendered MJPEG clips.
 * The clip is fetched once, parsed into frames, stored in the Cache API and
 * replayed from there forever: the server renders each clip exactly once per
 * device. */
const Anim = (() => {
  const CACHE_NAME = 'poligo-anim-v1';
  const MARKER = new TextEncoder().encode('--poligoframe');
  const BODY_SEP = new TextEncoder().encode('\r\n\r\n');

  function findSeq(bytes, from, target) {
    outer: for (let i = from; i <= bytes.length - target.length; i++) {
      for (let j = 0; j < target.length; j++) {
        if (bytes[i + j] !== target[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function parseMultipart(buf) {
    const frames = [];
    let idx = 0;
    while (frames.length < 500) {
      const head = findSeq(buf, idx, MARKER);
      if (head < 0) break;
      const bodyStart = findSeq(buf, head, BODY_SEP);
      if (bodyStart < 0) break;
      const dataStart = bodyStart + BODY_SEP.length;
      const nextHead = findSeq(buf, dataStart, MARKER);
      const end = nextHead < 0 ? buf.length : nextHead - 2; // strip trailing \r\n
      frames.push(buf.slice(dataStart, Math.max(dataStart, end)));
      if (nextHead < 0) break;
      idx = nextHead;
    }
    return frames;
  }

  async function fromCacheOrFetch(url) {
    const cache = await caches.open(CACHE_NAME);
    let res = await cache.match(url);
    let hit = true;
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error('clip fetch failed');
      await cache.put(url, res.clone());
      hit = false;
    }
    return { res, hit };
  }

  async function loadClip(url) {
    const { res, hit } = await fromCacheOrFetch(url);
    const buf = new Uint8Array(await res.arrayBuffer());
    const parts = parseMultipart(buf);
    const bitmaps = [];
    for (const p of parts) {
      try { bitmaps.push(await createImageBitmap(new Blob([p]))); } catch (e) { /* skip bad frame */ }
    }
    return { bitmaps, hit, fps: 20 };
  }

  function play(canvas, clip, opts = {}) {
    const ctx = canvas.getContext('2d');
    const frameMs = 1000 / (clip.fps || 20);
    let i = 0, last = 0, playing = true, loops = 0;

    function frame(now) {
      if (!playing) return;
      if (now - last >= frameMs) {
        last = now;
        const bm = clip.bitmaps[i];
        if (!bm) { playing = false; return; }
        if (canvas.width !== bm.width || canvas.height !== bm.height) {
          canvas.width = bm.width;
          canvas.height = bm.height;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bm, 0, 0);
        i++;
        if (i >= clip.bitmaps.length) {
          i = 0;
          loops++;
          if (opts.loops && loops >= opts.loops) {
            playing = false;
            if (opts.onDone) opts.onDone();
            return;
          }
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return () => { playing = false; };
  }

  async function playOnce(url, canvas, opts = {}) {
    const clip = await loadClip(url);
    play(canvas, clip, Object.assign({ loops: 1 }, opts));
    return clip;
  }

  async function loop(url, canvas) {
    const clip = await loadClip(url);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (clip.bitmaps.length) {
        canvas.width = clip.bitmaps[0].width;
        canvas.height = clip.bitmaps[0].height;
        canvas.getContext('2d').drawImage(clip.bitmaps[0], 0, 0);
      }
      return () => {};
    }
    return play(canvas, clip);
  }

  return { loadClip, play, playOnce, loop, CACHE_NAME };
})();
