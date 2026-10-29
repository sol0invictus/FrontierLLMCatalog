# Agent guide: Frontier LLM Catalogue

This repo is a static page comparing open-weight LLMs at config-file depth. All model facts live in `data/models.js`. The page is rendered by `assets/app.js` and bundled by `scripts/build.py`. See `README.md` for layout and views.

## Source provenance (mandatory)

Every fact must cite the highest-tier source that states it. Look at the sources in this order and stop at the first one that covers the fact:

| Tier | Code | Source |
|---|---|---|
| 1 | `R` | **Technical report** from the lab (paper or PDF). |
| 2 | `B` | **Official blog** from the lab: launch posts, engineering blogs and official methodology documents published on the lab's own site. |
| 3 | `C` | **Hugging Face model page and code**: the model card on Hugging Face, the model's implementation in the `huggingface/transformers` repo (`src/transformers/models/<model>/`), and the `config.json` and weight index in the model files. The lab's own reference implementation (for example Meta's TorchTitan model definition) also counts as tier 3 code. |
| 4 | `X` | **Other sources**: posts on X/Twitter, third-party blogs, inference-engine write-ups (vLLM, SGLang, llama.cpp, Baseten), news coverage, and blogs on huggingface.co written by Hugging Face staff rather than the lab. |
| — | `D` | **Derived**: values calculated on this page from cited sources. Show the formula, either in the fact itself or in the page's method notes. |

Rules:

1. **Search every tier before using a lower one.** Do not cite tier 4 for a fact until you have checked the report, the lab's blog posts, the Hugging Face model card, the transformers implementation and config.json. A gated `config.json` is not a reason to drop to tier 4: the transformers `configuration_<model>.py` and `modeling_<model>.py` usually carry the same values.
2. **Combine tiers when one source does not cover the whole fact.** Tag the fact with each code in tier order (for example `s: "B+C"`), and say in the text which part comes from which source.
3. **When tiers disagree, show the higher tier's value** and give the lower tier's value in the note (for example, Beam benchmarks use the launch-blog table and note the model card's number for the released weights).
4. **Classify by author, not by host.** A Hugging Face blog post written by Hugging Face staff is tier 4. The model card on huggingface.co is tier 3. A lab's own post on another domain (for example pytorch.org for Meta) is tier 2.
5. **Never present tier 4 as official.** If only tier 4 covers a fact, keep it and tag it `X` so the reader can see it is unconfirmed.
6. **List each model's `docs` in tier order**, using the same codes. The Sources section groups them by tier.
7. **Re-check for new tier 1 and tier 2 sources** whenever a model is updated. Labs often publish the technical report after launch. When one appears, re-source the facts it covers.

## Data conventions

- Facts are `{ v | t, s }` objects in `data/models.js`. `s` is a source code string from the table above.
- Benchmarks: each model's `benchSource` says where its scores come from and at what tier. Put the evaluation setting for each score in `n`. Set `cmp: false` on a row when the labs' protocols differ (for example with tools versus without).
- Each model has `refs` (per-section source links: `arch`, `pretrain`, `sft`, `rl`, `tricks`, `bench`) and `tricks` (training tricks with `cat`, `name`, `t`, `s`). Every section shows its refs under the heading, so add the report section and blog post a section draws on.
- Read the transformers `modular_<model>.py` / `modeling_<model>.py` (and any custom `modeling_*.py` in the model repo) for every model. Record anything that differs from a standard Llama-style block: norms, residual form, gating, router math, numerics kept in FP32, positional scheme, logit caps.
- Block diagrams live in `data/diagrams.js` (one per model, drawn as inline SVG by `diagramFigure` in `assets/app.js`). Build them from the transformers model code. Mark a step `n: true` only when it departs from a standard Llama-style block, and keep labels short (the renderer squeezes text that overflows its box).
- When layers play different roles across the network (for example DeepSeek-V4.1-Flash: encoder vs decoder, CSA2 Full / Reindex / Reuse, Engram layers), add a whole-network entry to `window.STACKS` in `data/diagrams.js`. Derive each layer's role from config.json fields, not by hand. The page then shows a "Layer stack" figure above the one-layer diagram.
- Layer layouts come from tier 3 code or config (`layer_types`, `layers_block_type`, or the reference code). The `layersNote` names the field used.

## Workflow

1. Edit `data/models.js`.
2. Run `python3 scripts/build.py`.
3. Check `dist/index.html` in a browser at desktop and phone widths, in light and dark mode.
4. Republish `build/artifact.html` to the existing artifact URL in the memory or README.
5. Commit the source and `dist/index.html` together. `dist/` is the folder Cloudflare Pages serves.
