# Prompt Variables — UX prototype

A self-contained, **static** prototype of the ComfyUI Prompt Variables UX. No backend,
no build step — a single `index.html`. It demonstrates the same substitution rules the
real fork applies in its on-prompt handler (`comfy_extras/nodes_variables.py`):

1. **Last-write-wins** — duplicate variable names: the later node wins.
2. **Missing token → left literal** — `[token]` with no Variable is kept verbatim, never blanked.
3. **No nesting / no recursion** — an inserted value is placed once and never re-scanned.

Edit the Variable nodes and the prompt; the resolved output updates live with highlighting.

## Deploy to Vercel

This is a zero-config static site. Either way gives a public URL to share.

**Option A — CLI (fastest):**
```bash
cd prototype
npx vercel --prod        # first run: `npx vercel login`
```

**Option B — Vercel dashboard (same flow your coworker used):**
1. vercel.com → **Add New… → Project** → import `bertfy/comfy-variables`.
2. Set **Root Directory** to `prototype`.
3. **Framework Preset:** Other. Leave build/output empty.
4. **Deploy.**

## Run locally
```bash
# from repo root
python -m http.server -d prototype 8000   # then open http://localhost:8000
```
