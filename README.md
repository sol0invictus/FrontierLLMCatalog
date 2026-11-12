# Frontier LLM Catalogue

A standalone static site that compares frontier open-weight LLMs at config-file depth: layer layout, attention pattern, MoE routing, token budgets per training stage, data mixes, RL methods and benchmarks with their evaluation settings.

Models covered (35): Muse Spark Open and Muse Glimmer 30B (Meta), Inkling, Inkling-Small and Inkling 2 Small (Thinking Machines Lab), DeepSeek-V4.1-Flash, DeepSeek-V4-Pro and DeepSeek-V4-Flash, Reflection Beam 1.0, Nemotron 3.5 Super, Nemotron 3.5 Lightning and Nemotron 3 Ultra (NVIDIA), Kimi K3 and Kimi K3.1 Pro (Moonshot AI), GLM-5.3 and GLM-5.3-Flash (Z.ai), MiMo-V2.6-Pro and MiMo-V2.6-Flash (Xiaomi), Qwen3.8-Max, Qwen3.8-Flash-Next and Qwen3.8-27B (Alibaba), MiniMax M3 and M3.1-Flash, Step 5 Preview (StepFun), Hy4-preview (Tencent), Motif 3 (Motif Technologies), Laguna S 2.1 (Poolside), LFM2.5-8B-A1B and LFM3-1.7B (Liquid AI), Gemma 4 31B (Google DeepMind), gpt-oss-120b (OpenAI), Olmo 3 32B Think (Ai2), Ripple-65B Preview (Ricursive Intelligence), SmolLM3-3B (Hugging Face) and Mistral Large 4 (Mistral AI).

## Views

- **Overview** (the default, with no model selected): a sortable table of every model (params, layers, attention, experts, context, cache at 1M, pretraining tokens, sources and license), architecture fingerprints on a shared depth scale, a benchmark heatmap and memory per sequence. All four group models into size tiers by total parameters (1T and up, 400B to 1T, 100B to 400B, under 100B; `TIERS` in `assets/app.js`). Sorting applies within each tier, and heatmap shading and the best-score box are relative within a tier. Click any row to open that model. Link: `/`.
- **One model**: pick a model and read its full dossier top to bottom: overview, layer diagram, spec sheet, memory per sequence, pretraining stages and mixes, fine-tuning, RL methods, training tricks, published ablations (when the lab gives any), benchmarks with settings, and sources. Link: `/<slug>`, where the slug comes from the model name (e.g. `/reflection-beam-1.0`, `/ripple-65b-preview`). A model's id also works (`/beam`) and redirects to the slug.
- **Compare two**: choose Model A and Model B (at most two). Every section is side by side. The benchmark table shows A − B where settings are comparable. Link: `/compare/<a>-vs-<b>` (e.g. `/compare/muse-spark-open-vs-reflection-beam-1.0`).

Old hash links (`#model-beam`, `#compare-muse-beam`) still open the right view and switch to the path. Inside the Claude artifact or a `file://` page, where the path can't change, the same routes go in the hash (`#model-<slug>`).

Model ids: `muse`, `glimmer`, `inkling`, `inklingsm`, `dsv41`, `dsv4pro`, `dsv4flash`, `beam`, `super`, `lightning`, `ultra3`, `kimik3`, `kimik31`, `glm53`, `glm53f`, `mimo26`, `mimo26f`, `qwen38`, `qwen38fn`, `qwen3827`, `minimaxm3`, `minimaxm31f`, `step5`, `hy4`, `motif3`, `laguna`, `lfm25`, `lfm3`, `gemma4`, `gptoss`, `olmo3`, `ripple`, `smollm3`, `ml4`. Pick the model from the dropdown (grouped by lab).

## Layout

```
index.html          page shell (sections, controls)
assets/styles.css   design tokens and styles (light, matching sunnyguha.com)
assets/app.js       renders every section from the data file
data/models.js      all model facts, benchmark rows and source links
data/diagrams.js    per-model block diagrams (drawn as inline SVG)
scripts/build.py    inlines everything into dist/index.html
dist/index.html     self-contained page; dist/ is the folder to host
build/artifact.html same page without the html/head/body wrapper (git-ignored)
```

## View

Serve `dist/` with the bundled server, which returns `index.html` for paths like `/ripple-65b-preview` the way the host does:

```bash
python3 scripts/serve.py
```

Then open http://localhost:8765. Opening `dist/index.html` straight from disk also works, with hash links.

## Deploy (Cloudflare Pages)

The site is one self-contained file, `dist/index.html`, with no external requests. It is committed, so Pages needs no build step. Model pages are paths with no file behind them (`/ripple-65b-preview`). Pages serves `index.html` for those as long as `dist/` has no top-level `404.html`, so don't add one.

1. Push the repo to GitHub.
2. In Cloudflare, go to Workers & Pages → Create → Pages → Connect to Git, and pick the repo.
3. Set **Framework preset** to None, leave **Build command** empty, and set **Build output directory** to `dist`.
4. After the first deploy, open the project's Custom domains tab and add the subdomain you want (for example `llms.sunnyguha.com`). Cloudflare adds the DNS record when the zone is on the same account.

Run `python3 scripts/build.py` and commit `dist/index.html` with every data change; Pages redeploys on each push. Alternatively set the build command to `python3 scripts/build.py` so Pages rebuilds it itself.

## Add a model

1. Append an object to `MODELS` in `data/models.js`, using an existing entry as the template. Fill `specs` for each key in `SPEC_ROWS`, and give `layers` as either a Nemotron-style string (`patternFromString`) or a rule (`patternFromRules`).
2. Add its scores to the relevant rows in `BENCHMARKS`. Set `cmp: false` on a row when harnesses or settings differ enough that the scores are not head-to-head.
3. Tag every fact with a source code: `R` report, `B` the lab's own blog or site, `C` Hugging Face card, transformers code or config.json, `X` third party, `D` derived here.
4. Rebuild the bundle:

```bash
python3 scripts/build.py
```

## Source policy

See [AGENTS.md](AGENTS.md) for the mandatory provenance order: technical report, then official blog, then Hugging Face model card / transformers code / config.json, then other sources.
