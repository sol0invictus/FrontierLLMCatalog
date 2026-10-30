/*
 * Block diagrams, one per model. Drawn by assets/app.js as inline SVG.
 *
 * A diagram is: inputs (steps above the repeated block) -> block -> outputs.
 * A step is { l: label, s: sub-label, n: true if it departs from a standard
 * Llama-style block }, or { row: [step, step, ...] } for parallel boxes.
 * A block has either `branches` (sequential sub-blocks on one residual stream,
 * each ending in a merge) or `variants` (alternative block types, one per layer).
 * Labels stay short; everything comes from the transformers model code (tier 3)
 * unless the model's `s` says otherwise.
 */
window.DIAGRAMS = {
  muse: {
    s: "C",
    caption: "One Muse Spark Open decoder layer, repeated 62 times. Every input modality is RMS-normalized before it enters the FP32 residual stream. Both branches are sandwich-normed and merge through a learned norm-preserving gate rather than a plain add.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "202,048 × 8192" },
        { l: "Vision encoder", s: "1.8B ViT, 14px" },
        { l: "Audio encoder", s: "conv, 80 ms/token" },
      ] },
      { row: [
        { l: "RMSNorm", s: "weightless", n: true },
        { l: "Projection + RMSNorm", s: "→ 8192, weightless", n: true },
        { l: "RMSNorm", s: "weightless", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 62",
      stream: "residual stream, FP32",
      branches: [
        {
          title: "Attention (46 sliding-window + 16 global)",
          steps: [
            { l: "RMSNorm", s: "gain-centered: weight + 1", n: true },
            { l: "Q, K, V projections", s: "128 Q heads / 16 KV heads, d = 64" },
            { l: "QK-norm, then q × 5.47", s: "weightless; 43.78/√64 query scale", n: true },
            { l: "RoPE θ = 500k on SWA layers", s: "global layers: no RoPE", n: true },
            { l: "Attention", s: "window 2048, or full context" },
            { l: "Per-head output RMSNorm", s: "weightless", n: true },
            { l: "× σ(W_g x)", s: "sigmoid gate, 8192 → 8192", n: true },
            { l: "Output projection", s: "8192 → 8192" },
            { l: "Post-norm", s: "RMSNorm, no weight", n: true },
          ],
          merge: { l: "α·x + β·h", s: "β = σ(g/0.3), α² + β² = 1", n: true },
        },
        {
          title: "Compressed MoE (every layer)",
          steps: [
            { l: "RMSNorm", s: "gain-centered" },
            { row: [
              { l: "Sigmoid router (FP32)", s: "+ bias → top-8" },
              { l: "Down-projection", s: "8192 → 4096 + RMSNorm", n: true },
            ] },
            { l: "256 SwiGLU experts, top-8", s: "4096 → 4096 → 4096" },
            { l: "Per-expert RMSNorm", s: "before routing weights", n: true },
            { l: "Weighted sum", s: "weights renormalized over 8" },
            { l: "Up-projection", s: "4096 → 8192", n: true },
            { l: "Post-norm", s: "gain applied before normalizing", n: true },
          ],
          merge: { l: "α·x + β·h", s: "second gate, same form", n: true },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm", s: "plain weight (init 1), BF16 input" },
      { l: "LM head", s: "logits × 1/√32, then 20·tanh(z/20)", n: true },
    ],
  },

  glimmer: {
    s: "R+C",
    caption: "One Muse Glimmer layer, repeated 52 times. It keeps Muse Spark's attention (3:1 sliding/global, weightless QK-norm, sigmoid gate) but uses a dense SwiGLU FFN and plain residual adds.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "202,048 × 6656" },
        { l: "Perception Encoder", s: "1.8B ViT-G/14, frozen" },
      ] },
      { row: [
        { l: "RMSNorm", s: "weightless", n: true },
        { l: "Pixel shuffle → MLP → RMSNorm", s: "2×2, weightless norm", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 52",
      stream: "residual stream",
      branches: [
        {
          title: "Attention (39 sliding-window + 13 global)",
          steps: [
            { l: "RMSNorm", s: "gain-centered: weight + 1", n: true },
            { l: "Q, K, V projections", s: "32 Q heads / 2 KV heads, d = 128" },
            { l: "QK-norm, then q × 3.87", s: "weightless; 43.78/√128 query scale", n: true },
            { l: "RoPE θ = 500k on SWA layers", s: "global layers: no RoPE", n: true },
            { l: "Attention", s: "window 2048, or full context" },
            { l: "× σ(W_g x)", s: "sigmoid gate, 6656 → 4096", n: true },
            { l: "Output projection", s: "4096 → 6656" },
            { l: "Post-norm", s: "gain-centered", n: true },
          ],
          merge: { l: "x + h", s: "plain add (no residual gate)" },
        },
        {
          title: "Dense FFN (every layer)",
          steps: [
            { l: "RMSNorm", s: "gain-centered" },
            { l: "SwiGLU FFN", s: "6656 → 19,968 → 6656" },
            { l: "Post-norm", s: "gain-centered", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "× 1/√(6656/256), then 20·tanh(z/20)", n: true },
    ],
  },

  inkling: {
    s: "B+C",
    caption: "One Inkling layer, repeated 66 times. Positions come from a learned relative bias instead of RoPE, and short causal convolutions sit on K, V and both branch outputs. The 2 shared experts compete in the same normalization as the 6 routed picks.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "201,024 × 6144" },
        { l: "Image patches", s: "40×40 px → 4-layer hMLP", n: true },
        { l: "Audio", s: "dMel, 80 bins", n: true },
      ] },
      { row: [
        { l: "RMSNorm", s: "learned gain", n: true },
        { l: "RMSNorm" },
        { l: "RMSNorm" },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 66",
      stream: "residual stream",
      note: "Layers 0–1: dense SwiGLU FFN (24576) instead of MoE",
      branches: [
        {
          title: "Attention (55 sliding-window + 11 global)",
          steps: [
            { l: "RMSNorm", s: "learned gain" },
            { row: [
              { l: "Q projection", s: "64 heads × 128" },
              { l: "K, V + short conv", s: "16 or 8 KV heads, k=4", n: true },
              { l: "Relative coeffs", s: "16 per head", n: true },
            ] },
            { l: "QK-norm", s: "per head, learned weight" },
            { l: "Attention + relative bias", s: "scale 1/d; window 512, or full", n: true },
            { l: "Output projection", s: "8192 → 6144" },
            { l: "Short conv", s: "kernel 4, residual, FP32", n: true },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "MoE (layers 2–65)",
          steps: [
            { l: "RMSNorm", s: "learned gain" },
            { l: "Sigmoid router", s: "258 columns: 256 routed + 2 shared", n: true },
            { row: [
              { l: "6 of 256 experts", s: "SwiGLU 6144 → 3072" },
              { l: "2 shared experts", s: "weighted by the router", n: true },
            ] },
            { l: "Weighted sum", s: "8 weights normalized jointly, × 8 × g", n: true },
            { l: "Short conv", s: "kernel 4, residual, FP32", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "hidden ÷ 24 (μP), no softcap", n: true },
        { l: "MTP stack", s: "8 layers (6 SWA + 2 global)", n: true },
      ] },
    ],
  },

  dsv41: {
    s: "R+C",
    caption: "One DeepSeek-V4.1-Flash layer, repeated 40 times on four mHC residual streams. Every layer keeps its own query and 128-token SWA KV. Most layers borrow the shared FP4 main KV and top-512 indices from an earlier Full or Reindex layer. In the decoder, only L20 builds main KV, from the encoder's output.",
    inputs: [
      { row: [
        { l: "Text embedding", s: "129,280 × 5120" },
        { l: "DeepSeek-ViT", s: "32 layers, 3×3 unshuffle → MLP", n: true },
      ] },
    ],
    block: {
      title: "Layer",
      repeat: "× 40",
      stream: "4 mHC residual streams",
      note: "L0–1 SWA only · Engram at L1, L14 · decoder KV from encoder output",
      branches: [
        {
          title: "CSA2 + sliding-window attention",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "uses the previous block's mix", n: true },
            { row: [
              { l: "Query", s: "LoRA 1280 → 64 × 512", n: true },
              { l: "SWA KV (own)", s: "latent, window 128, FP8", n: true },
              { l: "Main KV", s: "Full: new · else shared, FP4", n: true },
            ] },
            { l: "Indexer", s: "Full / Reindex: own top-512 · Reuse: borrowed", n: true },
            { l: "Sparse attention + sink", s: "one shared K = V latent, softmax 1/√512", n: true },
            { l: "Grouped output projection", s: "8 groups × 1024 → 5120", n: true },
          ],
          merge: { l: "X ← B·X + C·h", s: "Sinkhorn-mixed, 4 streams", n: true },
        },
        {
          title: "DeepSeekMoE (every layer)",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "uses the previous block's mix", n: true },
            { l: "√softplus router (FP32)", s: "+ text or image bias → top-6", n: true },
            { row: [
              { l: "6 of 384 experts", s: "SwiGLU 2304, clamp 10", n: true },
              { l: "1 shared expert", s: "SwiGLU 2304" },
            ] },
            { l: "Weighted sum × 1.5", s: "weights renormalized over 6" },
          ],
          merge: { l: "X ← B·X + C·h", s: "Sinkhorn-mixed, 4 streams", n: true },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "logits in FP32" },
        { l: "DSpark drafter", s: "3 SWA-128 blocks, 5 tokens", n: true },
      ] },
    ],
  },

  beam: {
    s: "C",
    caption: "One Beam decoder layer, repeated 52 times. Token embeddings enter unnormalized. Global layers drop RoPE for a position-dependent query scale, and each residual add uses a fixed, norm-preserving depth schedule.",
    inputs: [{ l: "Token embedding", s: "151,936 × 5120, no norm or scale" }],
    block: {
      title: "Decoder layer",
      repeat: "× 52",
      stream: "residual stream, FP32",
      note: "Layers 0–2: dense SwiGLU FFN (20480) instead of MoE",
      branches: [
        {
          title: "Attention (43 sliding-window + 9 global)",
          steps: [
            { l: "RMSNorm", s: "learned gain" },
            { l: "Q, K, V projections", s: "48 Q heads / 8 KV heads, d = 128" },
            { l: "QK-norm", s: "per head, learned weight" },
            { l: "RoPE θ = 10k on SWA layers", s: "global: no RoPE, q × (1+(p+1)/2048)^0.1", n: true },
            { l: "Attention", s: "window 512, or full context" },
            { l: "× σ(W_g x + b_head)", s: "elementwise gate, per-head bias", n: true },
            { l: "Output projection", s: "6144 → 5120" },
            { l: "Post-norm", s: "RMSNorm (sandwich)", n: true },
          ],
          merge: { l: "h/√k + x·√((k−1)/k)", s: "fixed, k = 2(l+1)", n: true },
        },
        {
          title: "MoE (layers 3–51)",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router (FP32)", s: "+ bias; top-4 of 8 groups → top-8", n: true },
            { l: "256 SwiGLU experts, top-8", s: "5120 → 2560 → 5120, FP32, no clamp", n: true },
            { l: "Weighted sum × 2.5", s: "routed scale after combine" },
            { l: "Post-norm", s: "RMSNorm (sandwich)", n: true },
          ],
          merge: { l: "h/√k + x·√((k−1)/k)", s: "k = 2(l+1) + 1", n: true },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "30·tanh(z/30) in FP32, no multiplier", n: true },
    ],
  },

  super: {
    s: "R+C",
    caption: "Nemotron 3.5 Super stacks 88 single-purpose blocks. Each block is one of three types, chosen by layers_block_type, and every block is a pre-norm plus a plain residual add.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "131,072 × 4096, no norm" },
        { l: "C-RADIO ViT-H/16", s: "pixel shuffle 0.5× → MLP", n: true },
      ] },
    ],
    block: {
      title: "Block",
      repeat: "× 88",
      stream: "residual stream",
      variants: [
        {
          title: "Mamba-2 × 40",
          steps: [
            { l: "RMSNorm" },
            { l: "in_proj", s: "→ x, z, B, C, dt" },
            { l: "Causal conv1d", s: "kernel 4" },
            { l: "SSM scan", s: "128 heads × 64, state 128, + D·x", n: true },
            { l: "Gated RMSNorm", s: "× SiLU(z), 8 groups", n: true },
            { l: "out_proj", s: "8192 → 4096" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "Attention × 8",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V projections", s: "32 Q / 2 KV, d = 128, no QK-norm" },
            { l: "Attention, no RoPE", s: "full context, no gate, 1/√d", n: true },
            { l: "Output projection", s: "4096 → 4096" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "LatentMoE × 40",
          steps: [
            { l: "RMSNorm" },
            { row: [
              { l: "Sigmoid router", s: "+ bias → top-22" },
              { l: "Latent proj", s: "4096 → 1024", n: true },
            ] },
            { l: "512 experts, relu²", s: "1024 → 2688 → 1024, no gate", n: true },
            { l: "Latent up-proj", s: "1024 → 4096", n: true },
            { l: "+ shared expert", s: "full width, 4096 → 5376", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "plain: no multiplier or softcap" },
        { l: "MTP head", s: "1 shared layer, 7 drafts", n: true },
      ] },
    ],
  },

  lightning: {
    s: "R+C",
    caption: "Nemotron 3.5 Lightning uses the same three block types as Super at smaller width: 52 blocks, plain MoE without the latent projection, and a single MTP layer.",
    inputs: [{ l: "Token embedding", s: "131,072 × 2688, no norm" }],
    block: {
      title: "Block",
      repeat: "× 52",
      stream: "residual stream",
      variants: [
        {
          title: "Mamba-2 × 23",
          steps: [
            { l: "RMSNorm" },
            { l: "in_proj", s: "→ x, z, B, C, dt" },
            { l: "Causal conv1d", s: "kernel 4" },
            { l: "SSM scan", s: "64 heads × 64, state 128, + D·x", n: true },
            { l: "Gated RMSNorm", s: "× SiLU(z), 8 groups", n: true },
            { l: "out_proj", s: "4096 → 2688" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "Attention × 6",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V projections", s: "32 Q / 2 KV, d = 128, no QK-norm" },
            { l: "Attention, no RoPE", s: "full context, no gate, 1/√d", n: true },
            { l: "Output projection", s: "4096 → 2688" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "MoE × 23",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router", s: "+ bias → top-6 of 128" },
            { l: "128 experts, relu²", s: "2688 → 1856 → 2688, no gate", n: true },
            { l: "+ shared expert", s: "2688 → 3712 → 2688", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "plain: no multiplier or softcap" },
        { l: "MTP head", s: "pruned from Super 3", n: true },
      ] },
    ],
  },

  kimik3: {
    s: "R+C",
    caption: "One Kimi K3 layer, repeated 93 times. Three of every four layers use Kimi Delta Attention; the fourth (and the last) uses NoPE Gated MLA. Before each sublayer, Attention Residuals mix the embedding and earlier block summaries instead of reading one running sum.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "163,840 × 7168" },
        { l: "MoonViT-V2", s: "27 layers, from scratch, 2×2 shuffle → MLP", n: true },
      ] },
    ],
    block: {
      title: "Layer",
      repeat: "× 93",
      stream: "AttnRes: 9 block summaries",
      note: "Layer 0: dense SiTU-GLU FFN (33,792) instead of MoE",
      branches: [
        {
          title: "Token mixer (69 KDA + 24 MLA)",
          steps: [
            { l: "AttnRes mix", s: "softmax(w · RMSNorm(blocks))", n: true },
            { l: "RMSNorm" },
            { l: "KDA: q, k, v → conv4 + SiLU", s: "q, k L2-norm; 96 heads × 128", n: true },
            { l: "Gated delta rule", s: "α = exp(−5σ(e^A z)), β = σ(Wx)", n: true },
            { l: "or Gated MLA (NoPE)", s: "latent 512, 96 heads, no RoPE", n: true },
            { l: "× σ(W_g x), full rank", s: "KDA: after head-wise RMSNorm", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "add to block partial sum", s: "summary every 12 layers", n: true },
        },
        {
          title: "Stable LatentMoE",
          steps: [
            { l: "AttnRes mix", s: "own pseudo-query", n: true },
            { l: "RMSNorm" },
            { l: "Sigmoid router (FP32)", s: "+ QB bias → top-16 of 896", n: true },
            { row: [
              { l: "W↓ 7168 → 3584", s: "16 SiTU-GLU experts (3072)", n: true },
              { l: "2 shared experts", s: "full width, SiTU-GLU" },
            ] },
            { l: "RMSNorm → W↑ 3584 → 7168", s: "on the weighted sum", n: true },
          ],
          merge: { l: "add to block partial sum", s: "plus shared output", n: true },
        },
      ],
    },
    outputs: [
      { l: "AttnRes over all blocks → RMSNorm", n: true },
      { row: [
        { l: "LM head", s: "untied, no softcap" },
        { l: "EAGLE-3 draft", s: "from MTP; reads blocks 1, 4, final", n: true },
      ] },
    ],
  },


  glm53: {
    s: "R+B+C",
    caption: "One GLM-5.3 layer, repeated 78 times (the same base as GLM-5.2). Every layer is MLA with DeepSeek Sparse Attention; only 21 layers run the lightning indexer, and the rest reuse the top-2,048 tokens it picked.",
    inputs: [{ l: "Token embedding", s: "154,880 × 6144" }],
    block: {
      title: "Decoder layer",
      repeat: "× 78",
      stream: "residual stream",
      note: "Layers 0–2: dense SwiGLU FFN (12,288) instead of MoE",
      branches: [
        {
          title: "MLA + DeepSeek Sparse Attention",
          steps: [
            { l: "RMSNorm" },
            { row: [
              { l: "Q: 6144 → 2048 → 64 × 256", s: "RMSNorm on the latent" },
              { l: "KV latent 512 + RoPE 64", s: "RMSNorm, cached" },
            ] },
            { l: "Interleaved RoPE θ = 8M", s: "64 of 256 query dims", n: true },
            { l: "Indexer: top-2,048 tokens", s: "21 layers compute, 57 reuse (IndexShare)", n: true },
            { l: "Sparse attention", s: "64 heads × 256 over selected tokens", n: true },
            { l: "Output projection", s: "64 × 256 → 6144" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE (layers 3–77)",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router (FP32)", s: "+ bias → top-8 of 256" },
            { row: [
              { l: "8 SwiGLU experts", s: "6144 → 2048 → 6144" },
              { l: "1 shared expert", s: "SwiGLU 2048" },
            ] },
            { l: "Weighted sum × 2.5", s: "weights renormalized over 8" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP layer (shared steps)", s: "reuses step-1 KV and top-k", n: true },
      ] },
    ],
  },


  mimo26: {
    s: "R+C",
    caption: "One MiMo-V2.6-Pro layer, repeated 70 times. Sixty layers see only the last 128 tokens and add a learned sink logit; ten global layers use RoPE θ = 10M on a third of each head. No shared experts.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "152,576 × 6144" },
        { l: "MiMo-ViT + audio encoder", s: "681M ViT, 20-codebook RVQ", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 70",
      stream: "residual stream",
      note: "Layer 0: global attention with a dense SwiGLU FFN (16,384)",
      branches: [
        {
          title: "Attention (60 SWA + 10 global)",
          steps: [
            { l: "RMSNorm" },
            { l: "Fused QKV", s: "128 Q / 8 KV, QK 192, V 128" },
            { l: "Partial RoPE, 64 of 192 dims", s: "θ 10k (SWA) or 10M (global)", n: true },
            { l: "V × 0.612", s: "fixed value scale", n: true },
            { l: "Attention + sink logit", s: "window 128 (SWA) or full", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE (layers 1–69)",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router (FP32)", s: "+ bias → top-8 of 384; frozen in RL", n: true },
            { l: "8 SwiGLU experts", s: "6144 → 2048 → 6144, no shared", n: true },
            { l: "Weighted sum", s: "renormalized over 8" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "DFlash drafter", s: "5 SWA layers, 7 tokens per pass", n: true },
      ] },
    ],
  },


  qwen38: {
    s: "C",
    caption: "One Qwen3.8 layer, repeated 92 times. Three of every four use Gated DeltaNet; the fourth uses softmax attention with a sigmoid output gate. Norms are zero-centered (1 + w) and the shared expert has its own gate.",
    inputs: [{ l: "Token embedding", s: "248,320 × 8192" }],
    block: {
      title: "Decoder layer",
      repeat: "× 92",
      stream: "residual stream",
      note: "Every layer is MoE; no dense layers",
      branches: [
        {
          title: "Token mixer (69 DeltaNet + 23 attention)",
          steps: [
            { l: "RMSNorm (1 + w)", n: true },
            { l: "DeltaNet: q, k, v → conv4", s: "16 QK / 128 V heads × 128", n: true },
            { l: "Gated delta rule (FP32)", s: "g = −e^A·softplus(a + dt), β = σ(b)", n: true },
            { l: "or attention: 64 Q / 4 KV × 256", s: "QK-norm, RoPE 64 dims, θ 10M", n: true },
            { l: "Output gate", s: "attn: × σ(gate); DeltaNet: SiLU-gated norm", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm (1 + w)", n: true },
            { l: "Softmax router", s: "top-10 of 512, renormalized" },
            { row: [
              { l: "10 SwiGLU experts", s: "8192 → 2048 → 8192" },
              { l: "Shared expert × σ(w·x)", s: "SwiGLU 2048", n: true },
            ] },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm (1 + w)", n: true },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP layer", s: "multi-step trained" },
      ] },
    ],
  },


  ultra3: {
    s: "R+C",
    caption: "Nemotron 3 Ultra stacks 108 single-purpose blocks of three types (layers_block_type), each a pre-norm plus a plain residual add. It is Super's design at 2× width: 256 Mamba heads, 512 latent experts with top-22, and 12 attention blocks.",
    inputs: [{ l: "Token embedding", s: "131,072 × 8192, no norm" }],
    block: {
      title: "Block",
      repeat: "× 108",
      stream: "residual stream",
      variants: [
        {
          title: "Mamba-2 × 48",
          steps: [
            { l: "RMSNorm" },
            { l: "in_proj", s: "→ x, z, B, C, dt" },
            { l: "Causal conv1d", s: "kernel 4" },
            { l: "SSM scan", s: "256 heads × 64, state 128, + D·x", n: true },
            { l: "Gated RMSNorm", s: "× SiLU(z), 8 groups", n: true },
            { l: "out_proj", s: "16384 → 8192" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "Attention × 12",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V projections", s: "64 Q / 2 KV, d = 128, no QK-norm" },
            { l: "Attention, no RoPE", s: "full context, no gate, 1/√d", n: true },
            { l: "Output projection", s: "8192 → 8192" },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "LatentMoE × 48",
          steps: [
            { l: "RMSNorm" },
            { row: [
              { l: "Sigmoid router", s: "+ bias → top-22" },
              { l: "Latent proj", s: "8192 → 2048", n: true },
            ] },
            { l: "512 experts, relu²", s: "2048 → 5120 → 2048, no gate", n: true },
            { l: "Latent up-proj", s: "2048 → 8192", n: true },
            { l: "+ shared expert", s: "full width, 8192 → 10240", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "plain: no multiplier or softcap" },
        { l: "MTP head", s: "shared weights, 2 steps in training", n: true },
      ] },
    ],
  },


  gemma4: {
    s: "R+C",
    caption: "One Gemma 4 31B layer, repeated 60 times. Every branch is sandwich-normed. Global layers (one in six) have no value projection: values are the normalized keys, and RoPE touches only a quarter of each head.",
    inputs: [
      { row: [
        { l: "Token embedding × √5376", s: "262,144 × 5376, tied", n: true },
        { l: "Vision encoder (550M)", s: "frozen in pretraining" },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 60",
      stream: "residual stream",
      note: "All dense; layer scalar keeps FP16 in range",
      branches: [
        {
          title: "Attention (50 SWA + 10 global)",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K (, V) projections", s: "32 Q; SWA 16 KV × 256; global 4 KV × 512" },
            { l: "QK-norm; V = RMSNorm(K) on global", s: "no scale on V; attention scale 1.0", n: true },
            { l: "RoPE θ 10k (SWA)", s: "global: p-RoPE p = 0.25, θ 1M", n: true },
            { l: "Attention", s: "window 1,024, or full context" },
            { l: "Output projection" },
            { l: "Post-norm", s: "RMSNorm (sandwich)", n: true },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "Dense FFN",
          steps: [
            { l: "RMSNorm" },
            { l: "GeGLU (tanh GELU)", s: "5376 → 21,504 → 5376" },
            { l: "Post-norm", s: "RMSNorm (sandwich)", n: true },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head (tied)", s: "30·tanh(z/30) softcap", n: true },
        { l: "MTP drafter", s: "4 layers, cross-attends main KV", n: true },
      ] },
    ],
  },


  gptoss: {
    s: "R+C",
    caption: "One gpt-oss-120b layer, repeated 36 times, alternating a 128-token banded window and dense attention. Each head can spend probability on a learned sink, and the expert SwiGLU is clamped with a +1 on the up branch.",
    inputs: [{ l: "Token embedding", s: "201,088 × 2880, untied" }],
    block: {
      title: "Decoder layer",
      repeat: "× 36",
      stream: "residual stream",
      note: "Even layers: banded window 128; odd layers: dense",
      branches: [
        {
          title: "Attention (18 banded + 18 dense)",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V (with bias)", s: "64 Q / 8 KV, d = 64" },
            { l: "RoPE θ 150k + YaRN ×32", s: "131K context" },
            { l: "Softmax with sink logit", s: "learned per head", n: true },
            { l: "Output projection (bias)" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm" },
            { l: "Router (with bias)", s: "top-4 of 128, softmax over the 4" },
            { l: "4 experts, clamped SwiGLU", s: "(up + 1)·g·σ(1.702 g), |·| ≤ 7", n: true },
            { l: "Weighted sum", s: "MXFP4 expert weights", n: true },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "Unembedding", s: "untied, no softcap" },
    ],
  },


  inklingsm: {
    s: "B+C",
    caption: "One Inkling-Small layer, repeated 42 times. It is Inkling's block at 4096 width: learned relative position bias instead of RoPE, short causal convolutions on K, V and both branch outputs, and 2 shared experts normalized with the 6 routed picks.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "201,024 × 4096" },
        { l: "Image patches", s: "40×40 px → 4-layer hMLP", n: true },
        { l: "Audio", s: "dMel spectrogram", n: true },
      ] },
      { row: [
        { l: "RMSNorm", s: "learned gain", n: true },
        { l: "RMSNorm" },
        { l: "RMSNorm" },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 42",
      stream: "residual stream",
      note: "Layers 0–1: dense SwiGLU FFN (16,384) instead of MoE",
      branches: [
        {
          title: "Attention (35 sliding-window + 7 global)",
          steps: [
            { l: "RMSNorm", s: "learned gain" },
            { row: [
              { l: "Q projection", s: "32 heads × 128" },
              { l: "K, V + short conv", s: "8 KV heads, k=4", n: true },
              { l: "Relative coeffs", s: "16 per head", n: true },
            ] },
            { l: "QK-norm", s: "per head, learned weight" },
            { l: "Attention + relative bias", s: "scale 1/d; window 512, or full", n: true },
            { l: "Output projection", s: "4096 → 4096" },
            { l: "Short conv", s: "kernel 4, residual, FP32", n: true },
          ],
          merge: { l: "x + h" },
        },
        {
          title: "MoE (layers 2–41)",
          steps: [
            { l: "RMSNorm", s: "learned gain" },
            { l: "Sigmoid router", s: "256 routed + 2 shared columns", n: true },
            { row: [
              { l: "6 of 256 experts", s: "SwiGLU 4096 → 2048" },
              { l: "2 shared experts", s: "weighted by the router", n: true },
            ] },
            { l: "Weighted sum", s: "8 weights normalized jointly, × 8 × g", n: true },
            { l: "Short conv", s: "kernel 4, residual, FP32", n: true },
          ],
          merge: { l: "x + h" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "hidden ÷ 16 (μP), no softcap", n: true },
    ],
  },


  dsv4pro: {
    s: "R+C",
    caption: "One DeepSeek-V4-Pro layer, repeated 61 times on four mHC residual streams. Each layer attends over its own 128-token window plus either CSA entries (4 tokens each, top-1024 picked by an indexer) or HCA entries (128 tokens each, all of them). One 512-dim vector serves as both key and value.",
    inputs: [{ l: "Token embedding", s: "129,280 × 7168" }],
    block: {
      title: "Layer",
      repeat: "× 61",
      stream: "4 mHC residual streams",
      note: "L0–1 HCA · even layers CSA, odd HCA · L0–2 hash-routed",
      branches: [
        {
          title: "CSA or HCA + sliding window",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained, FP32", n: true },
            { row: [
              { l: "Query", s: "LoRA 1536 → 128 × 512, RMS-normed", n: true },
              { l: "Window KV", s: "last 128 tokens" },
              { l: "Compressed KV", s: "CSA 4→1 · HCA 128→1", n: true },
            ] },
            { l: "Indexer (CSA only)", s: "64 × 128 heads, FP4, top-1024", n: true },
            { l: "Attention + sink, K = V", s: "partial RoPE, output rotated by −i", n: true },
            { l: "Grouped output projection", s: "16 groups × 1024 → 7168", n: true },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B, 4 streams", n: true },
        },
        {
          title: "DeepSeekMoE",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained, FP32", n: true },
            { l: "√softplus router (FP32)", s: "bias picks top-6 · L0–2: token-ID hash", n: true },
            { row: [
              { l: "6 of 384 experts", s: "SwiGLU 3072, clamp 10", n: true },
              { l: "1 shared expert", s: "SwiGLU 3072" },
            ] },
            { l: "Weighted sum × 2.5", s: "weights renormalized over 6" },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B, 4 streams", n: true },
        },
      ],
    },
    outputs: [
      { l: "Merge 4 streams → RMSNorm", s: "sigmoid weights", n: true },
      { row: [
        { l: "LM head", s: "untied, FP32 logits" },
        { l: "MTP + DSpark", s: "1 MTP layer · DSpark in -0813", n: true },
      ] },
    ],
  },


  dsv4flash: {
    s: "R+C",
    caption: "One DeepSeek-V4-Flash layer, repeated 43 times on four mHC residual streams. Each layer attends over its own 128-token window plus either CSA entries (4 tokens each, top-512 picked by an indexer) or HCA entries (128 tokens each, all of them). One 512-dim vector serves as both key and value.",
    inputs: [{ l: "Token embedding", s: "129,280 × 4096" }],
    block: {
      title: "Layer",
      repeat: "× 43",
      stream: "4 mHC residual streams",
      note: "L0–1 window only · even layers CSA, odd HCA · L0–2 hash-routed",
      branches: [
        {
          title: "CSA or HCA + sliding window",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained, FP32", n: true },
            { row: [
              { l: "Query", s: "LoRA 1024 → 64 × 512, RMS-normed", n: true },
              { l: "Window KV", s: "last 128 tokens" },
              { l: "Compressed KV", s: "CSA 4→1 · HCA 128→1", n: true },
            ] },
            { l: "Indexer (CSA only)", s: "64 × 128 heads, FP4, top-512", n: true },
            { l: "Attention + sink, K = V", s: "partial RoPE, output rotated by −i", n: true },
            { l: "Grouped output projection", s: "8 groups × 1024 → 4096", n: true },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B, 4 streams", n: true },
        },
        {
          title: "DeepSeekMoE",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained, FP32", n: true },
            { l: "√softplus router (FP32)", s: "bias picks top-6 · L0–2: token-ID hash", n: true },
            { row: [
              { l: "6 of 256 experts", s: "SwiGLU 2048, clamp 10", n: true },
              { l: "1 shared expert", s: "SwiGLU 2048" },
            ] },
            { l: "Weighted sum × 1.5", s: "weights renormalized over 6" },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B, 4 streams", n: true },
        },
      ],
    },
    outputs: [
      { l: "Merge 4 streams → RMSNorm", s: "sigmoid weights", n: true },
      { row: [
        { l: "LM head", s: "untied, FP32 logits" },
        { l: "MTP + DSpark", s: "1 MTP layer · DSpark in -0731", n: true },
      ] },
    ],
  },


  minimaxm3: {
    s: "R+C",
    caption: "One MiniMax M3 layer, repeated 60 times. Attention is plain GQA with per-head QK-norm and partial RoPE; in MSA layers a small indexer first picks 16 blocks of 128 tokens per KV group, and attention reads only those. The FFN is a sigmoid-routed MoE with gpt-oss-style clamped SwiGLU experts.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "200,064 × 6144" },
        { l: "Vision encoder", s: "CLIP-style ViT, 32 layers, 3D RoPE", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 60",
      stream: "residual stream",
      note: "Layers 0–2: full attention + dense FFN (12,288) · layers 3–59: MSA + MoE",
      branches: [
        {
          title: "Attention (MSA)",
          steps: [
            { l: "RMSNorm", s: "Gemma-style (1 + w)" },
            { l: "Q, K, V projections", s: "64 Q / 4 KV, d = 128" },
            { l: "QK-norm + partial RoPE", s: "per head; RoPE on 64 of 128 dims", n: true },
            { l: "Block indexer", s: "4 × 128 index q, 1 shared k; top-16 blocks of 128", n: true },
            { l: "Block-sparse attention", s: "≤ 2,048 tokens per query, own block forced", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE (layers 3–59)",
          steps: [
            { l: "RMSNorm", s: "Gemma-style (1 + w)" },
            { l: "Sigmoid router + bias", s: "top-4 of 128, renormalized, × 2.0" },
            { row: [
              { l: "4 experts", s: "clamped SwiGLU 3072, up + 1", n: true },
              { l: "1 shared expert", s: "clamped SwiGLU 3072", n: true },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP module", n: true },
      ] },
    ],
  },


  minimaxm31f: {
    s: "R+C",
    caption: "One MiniMax M3.1-Flash layer, repeated 60 times. Attention is plain GQA with per-head QK-norm and partial RoPE; in MSA layers a small indexer first picks 16 blocks of 128 tokens per KV group, and attention reads only those. The FFN is a sigmoid-routed MoE with gpt-oss-style clamped SwiGLU experts.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "200,064 × 6144" },
        { l: "Vision encoder", s: "CLIP-style ViT, 32 layers, 3D RoPE", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 60",
      stream: "residual stream",
      note: "MSA in all 60 layers · layers 0–2 dense FFN (12,288) · NVFP4 experts by QAT",
      branches: [
        {
          title: "Attention (MSA)",
          steps: [
            { l: "RMSNorm", s: "Gemma-style (1 + w)" },
            { l: "Q, K, V projections", s: "64 Q / 4 KV, d = 128" },
            { l: "QK-norm + partial RoPE", s: "per head; RoPE on 64 of 128 dims", n: true },
            { l: "Block indexer", s: "4 × 128 index q, 1 shared k; top-16 blocks of 128", n: true },
            { l: "Block-sparse attention", s: "≤ 2,048 tokens per query, own block forced", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE (layers 3–59)",
          steps: [
            { l: "RMSNorm", s: "Gemma-style (1 + w)" },
            { l: "Sigmoid router + bias", s: "top-4 of 128, renormalized, × 2.0" },
            { row: [
              { l: "4 experts", s: "clamped SwiGLU 3072, up + 1", n: true },
              { l: "1 shared expert", s: "clamped SwiGLU 3072", n: true },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "DSpark drafter (5 layers)", n: true },
      ] },
    ],
  },


  glm53f: {
    s: "B+C",
    caption: "One GLM-5.3-Flash layer, repeated 45 times on four mHC residual streams. Three of every four layers use Kimi Delta Attention; the fourth uses NoPE MLA whose DSA indexer picks 2,048 tokens from pooled keys. The first three layers have a dense FFN instead of the MoE.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "154,880 × 4096" },
        { l: "GLM-OCR ViT", s: "24 layers, 2×2 merge → 4096", n: true },
      ] },
    ],
    block: {
      title: "Layer",
      repeat: "× 45",
      stream: "4 mHC residual streams",
      note: "Layers 0–2: dense SwiGLU FFN (12,288) instead of MoE",
      branches: [
        {
          title: "Token mixer (34 KDA + 11 MLA-DSA)",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained", n: true },
            { l: "KDA: q, k, v → conv4 + SiLU", s: "q, k L2-norm; 64 heads × 128", n: true },
            { l: "Gated delta rule", s: "decay −5σ(e^A g), β = σ(W x)", n: true },
            { l: "or NoPE MLA + DSA", s: "latent 512, 64 heads × 256, no RoPE", n: true },
            { l: "IndexPool top-2,048", s: "4 keys → 1 pool, top-512 pools + tail", n: true },
            { l: "Output (KDA: σ-gated RMSNorm)" },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B", n: true },
        },
        {
          title: "MoE",
          steps: [
            { l: "mHC input mix → RMSNorm", s: "Sinkhorn-constrained", n: true },
            { l: "Sigmoid router (FP32)", s: "+ bias → top-8 of 288, × 2.5" },
            { row: [
              { l: "8 experts", s: "SwiGLU 2048, clamp 10", n: true },
              { l: "1 shared expert", s: "SwiGLU, clamp 10" },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "X ← B·X + C·h", s: "doubly stochastic B", n: true },
        },
      ],
    },
    outputs: [
      { l: "Merge 4 streams → RMSNorm", n: true },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP layer", s: "1" },
      ] },
    ],
  },


  qwen38fn: {
    s: "R+C",
    caption: "One Qwen3.8-Flash-Next layer, repeated 48 times on a 4-branch Gated Residual. Each sublayer reads the branches through an elementwise sigmoid gate and writes its output back to every branch with a per-branch scalar. Three of four layers use Gated DeltaNet; the fourth uses Qwen Sparse Attention. A hashed bigram/trigram embedding is added at layer 2.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "248,320 × 2560, copied to 4 branches", n: true },
        { l: "N-gram embedding (layer 2)", s: "2- and 3-gram hashes, 51B, host memory", n: true },
      ] },
    ],
    block: {
      title: "Layer",
      repeat: "× 48",
      stream: "4 residual branches (GR)",
      note: "Layers 3, 7, … 47 use QSA; the rest Gated DeltaNet · every FFN is MoE",
      branches: [
        {
          title: "Token mixer (36 GDN + 12 QSA)",
          steps: [
            { l: "GR read", s: "per-branch RMSNorm, σ gate (rank 320), mean", n: true },
            { l: "GDN: q, k, v → conv4 + SiLU", s: "16 QK / 48 V heads × 128, L2-norm q, k", n: true },
            { l: "Gated delta rule → σ-gated RMSNorm", s: "FP32 state", n: true },
            { l: "or QSA: gated attention", s: "24 Q / 2 KV × 256, partial M-RoPE", n: true },
            { l: "QSA indexer", s: "4-token pooled keys, top-512 blocks + tail", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "GR write: Rᵢ += 2σ(sᵢ)·y", s: "to all 4 branches, no mixing", n: true },
        },
        {
          title: "MoE",
          steps: [
            { l: "GR read", s: "elementwise σ gate", n: true },
            { l: "Softmax router", s: "top-10 of 512" },
            { row: [
              { l: "10 experts", s: "SwiGLU 640" },
              { l: "1 shared expert", s: "SwiGLU 640" },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "GR write", s: "per-branch scalar", n: true },
        },
      ],
    },
    outputs: [
      { l: "Final GR read (replaces final norm)", n: true },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP (QSA)", s: "reuses top-k indices", n: true },
      ] },
    ],
  },


  qwen3827: {
    s: "C",
    caption: "One Qwen3.8-27B layer, repeated 64 times. Three of every four layers use Gated DeltaNet; the fourth uses gated softmax attention with partial M-RoPE. Every layer has the same dense SwiGLU FFN.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "248,320 × 5120" },
        { l: "Vision encoder", s: "27-layer ViT, 2×2 merge → 5120" },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 64",
      stream: "residual stream",
      note: "Layers 3, 7, … 63 use gated attention; the rest Gated DeltaNet",
      branches: [
        {
          title: "Token mixer (48 GDN + 16 attention)",
          steps: [
            { l: "RMSNorm", s: "zero-centered (1 + w)", n: true },
            { l: "GDN: q, k, v → conv4 + SiLU", s: "16 QK / 48 V heads × 128, L2-norm q, k", n: true },
            { l: "Gated delta rule → SiLU-gated RMSNorm", s: "FP32 state", n: true },
            { l: "or gated attention", s: "24 Q / 4 KV × 256, QK-norm, RoPE on 64 dims", n: true },
            { l: "× σ(gate) → output projection", s: "attention layers", n: true },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "Dense FFN",
          steps: [
            { l: "RMSNorm", s: "zero-centered (1 + w)", n: true },
            { l: "SwiGLU", s: "5120 → 17,408 → 5120" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP layer", s: "multi-step" },
      ] },
    ],
  },


  step5: {
    s: "C",
    caption: "One Step 5 Preview layer, repeated 92 times with an FP32 residual stream. Three of every four layers attend over the last 512 tokens; the fourth is global but sparse, attending to the 512 highest-scoring 8-token regions per KV group. Every attention output passes a per-head sigmoid gate.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "128,896 × 4096" },
        { l: "Perception Encoder", s: "47 layers, width 1536", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 92",
      stream: "residual stream, FP32",
      note: "Global sparse at layers 3, 7, … 91 · dense FFN (13,824) at layers 0–2 and 91",
      branches: [
        {
          title: "Attention (69 SWA + 23 sparse global)",
          steps: [
            { l: "RMSNorm", s: "zero-centered, FP32", n: true },
            { l: "Q, K, V + QK-norm", s: "64 Q / 4 KV, d = 192" },
            { l: "SWA 512, full RoPE θ 10k", s: "or global: RoPE on 64 dims, θ 10M", n: true },
            { l: "Region indexer (global layers)", s: "8-token regions, top-512 per KV group", n: true },
            { l: "× σ(g) per head → output projection", n: true },
          ],
          merge: { l: "+ residual (FP32)", n: true },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm", s: "zero-centered, FP32", n: true },
            { l: "Sigmoid router (FP32)", s: "+ bias → top-8 of 352, × 3.0" },
            { row: [
              { l: "8 experts", s: "SwiGLU 1536, clamp 7", n: true },
              { l: "1 shared expert", s: "SwiGLU 1536, clamp 7", n: true },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "+ residual (FP32)", n: true },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "3 MTP layers", s: "3 draft tokens", n: true },
      ] },
    ],
  },


  mimo26f: {
    s: "R+C",
    caption: "One MiMo-V2.6-Flash layer, repeated 48 times. 39 layers attend over a 128-token window with a learned sink logit per head; 9 are global with RoPE θ = 10M on a third of the head dims. Every layer after the first is a 256-expert MoE with no shared expert.",
    inputs: [
      { row: [
        { l: "Token embedding", s: "152,576 × 4096" },
        { l: "MiMo-ViT + audio encoders", s: "681M ViT, RVQ audio tokenizer", n: true },
      ] },
    ],
    block: {
      title: "Decoder layer",
      repeat: "× 48",
      stream: "residual stream",
      note: "Global at 0, 5, 11, … 47 · layer 0 dense FFN (16,384)",
      branches: [
        {
          title: "Attention (39 SWA + 9 global)",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V", s: "64 Q; 8 KV (SWA) or 4 KV (global); QK 192, V 128" },
            { l: "V × 0.707", n: true },
            { l: "Partial RoPE (64 of 192)", s: "θ 10k SWA · 10M global", n: true },
            { l: "SWA 128 + sink logit", s: "global layers: no sink", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router + bias", s: "top-8 of 256, frozen in RL", n: true },
            { l: "8 experts, no shared", s: "SwiGLU 2048", n: true },
            { l: "Weighted sum" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "DFlash drafter", s: "5 SWA layers, 7 tokens", n: true },
      ] },
    ],
  },


  hy4: {
    s: "C",
    caption: "One Hy4-preview layer, repeated 78 times on four iHC residual streams. Every layer is MLA with DeepSeek Sparse Attention over the top 2,048 tokens, a learned sink and an elementwise sigmoid output gate; 21 layers compute the indexer and the rest reuse it.",
    inputs: [{ l: "Token embedding", s: "120,832 × 6144, copied to 4 streams" }],
    block: {
      title: "Layer",
      repeat: "× 78",
      stream: "4 iHC residual streams",
      note: "Layer 0: dense FFN (18,432) · indexer in 21 layers, reused in 57",
      branches: [
        {
          title: "Gated MLA + DSA",
          steps: [
            { l: "iHC read → RMSNorm", s: "σ-weighted mix of 4 streams", n: true },
            { l: "MLA projections", s: "q LoRA 2048, KV latent 512 + 64 RoPE" },
            { l: "DSA indexer / IndexCache", s: "32 × 128, top-2048", n: true },
            { l: "Sparse attention + sink", s: "64 heads, QK 256, V 256", n: true },
            { l: "× σ(W_g x), elementwise", s: "per head and channel", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "X ← X + 2σ(·)·h", s: "identity, no Sinkhorn mixing", n: true },
        },
        {
          title: "MoE",
          steps: [
            { l: "iHC read → RMSNorm", n: true },
            { l: "Sigmoid router + bias", s: "top-8 of 256, × 2.827" },
            { row: [
              { l: "8 experts", s: "SwiGLU 2048, clamp 10", n: true },
              { l: "1 shared expert", s: "SwiGLU" },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "X ← X + 2σ(·)·h", n: true },
        },
      ],
    },
    outputs: [
      { l: "Merge 4 streams → RMSNorm", n: true },
      { row: [
        { l: "LM head", s: "FP32", n: true },
        { l: "MTP layer", s: "1" },
      ] },
    ],
  },


  motif3: {
    s: "R+C",
    caption: "One Motif 3 layer, repeated 53 times on four mHC residual streams. Every fourth layer attends globally and the rest use a 128-token window, both with GDLA: signal heads minus λ times shared noise heads, over one compressed KV latent, then an elementwise sigmoid gate. Experts use per-expert PolyNorm activations.",
    inputs: [{ l: "Token embedding", s: "220,160 × 4096 (SuperBPE)" }],
    block: {
      title: "Layer",
      repeat: "× 53",
      stream: "4 mHC residual streams",
      note: "Full attention at 0, 4, … 52 · layers 0–1 dense FFN (12,288)",
      branches: [
        {
          title: "GDLA (14 full + 39 SWA 128)",
          steps: [
            { l: "mHC read → RMSNorm", n: true },
            { row: [
              { l: "Query latent 1024", s: "→ 64 signal + 16 noise heads" },
              { l: "KV latent 512 + RoPE key", s: "→ 16 shared KV heads", n: true },
            ] },
            { l: "Signal − λ·noise", s: "λ = σ(xW_λ) per head", n: true },
            { l: "× σ(gate) elementwise", s: "from the query latent", n: true },
            { l: "Output projection", s: "64 × 128 → 4096" },
          ],
          merge: { l: "mHC write", s: "post-scale annealed 2 → 1", n: true },
        },
        {
          title: "MoE",
          steps: [
            { l: "mHC read → RMSNorm", n: true },
            { l: "Sigmoid router (FP32)", s: "+ bias → top-8 of 384, × 2.0" },
            { row: [
              { l: "8 experts", s: "PolyNorm GLU 1280, per-expert", n: true },
              { l: "1 shared expert", s: "PolyNorm GLU" },
            ] },
            { l: "Weighted sum" },
          ],
          merge: { l: "mHC write", n: true },
        },
      ],
    },
    outputs: [
      { l: "Merge streams → RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "MTP layer", s: "1, frozen in RL" },
      ] },
    ],
  },


  laguna: {
    s: "C",
    caption: "One Laguna S 2.1 layer, repeated 48 times. Every fourth layer attends globally with 48 query heads; the others use a 512-token window with 72 query heads. Each head's output is scaled by a softplus gate, and the FFN is a 256-expert MoE with one shared expert.",
    inputs: [{ l: "Token embedding", s: "100,352 × 3072" }],
    block: {
      title: "Decoder layer",
      repeat: "× 48",
      stream: "residual stream",
      note: "Global at 0, 4, … 44 · layer 0 dense FFN (12,288)",
      branches: [
        {
          title: "Attention (12 global + 36 SWA 512)",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V + QK-norm", s: "48 Q (global) or 72 Q (SWA) / 8 KV, d = 128", n: true },
            { l: "RoPE", s: "global: half dims, θ 500k, YaRN ×128 · SWA: θ 10k", n: true },
            { l: "Attention", s: "global or window 512" },
            { l: "× softplus(W_g x) per head", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router + bias", s: "top-10 of 256, renormalized" },
            { row: [
              { l: "10 experts × 2.5", s: "SwiGLU 1024", n: true },
              { l: "1 shared expert", s: "SwiGLU 1024" },
            ] },
            { l: "Sum" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head", s: "untied" },
        { l: "DFlash drafter", s: "separate model", n: true },
      ] },
    ],
  },


  lfm25: {
    s: "R+C",
    caption: "One LFM2.5-8B-A1B layer, repeated 24 times. Most layers mix tokens with a double-gated 3-tap convolution; six use grouped-query attention. Layers 0–1 have a dense SwiGLU FFN and the rest a 32-expert MoE.",
    inputs: [{ l: "Token embedding", s: "128,000 × 2048, tied to the head" }],
    block: {
      title: "Decoder layer",
      repeat: "× 24",
      stream: "residual stream",
      note: "Attention at 2, 6, 10, 14, 18, 21 · layers 0–1 dense FFN (7,168)",
      branches: [
        {
          title: "Token mixer (18 conv + 6 GQA)",
          steps: [
            { l: "RMSNorm" },
            { l: "Project to B, C, x", s: "3 × 2048", n: true },
            { l: "C ⊙ conv₃(B ⊙ x)", s: "depthwise causal, length 3", n: true },
            { l: "or GQA + QK-norm", s: "32 Q / 8 KV × 64, RoPE θ 5M" },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE",
          steps: [
            { l: "RMSNorm" },
            { l: "Sigmoid router + expert bias", s: "top-4 of 32, renormalized" },
            { l: "4 experts", s: "SwiGLU 1792" },
            { l: "Weighted sum" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "tied to the embedding" },
    ],
  },


  smollm3: {
    s: "B+C",
    caption: "One SmolLM3 layer, repeated 36 times: a Llama-style block with grouped-query attention and a SwiGLU FFN. Every fourth layer skips RoPE entirely.",
    inputs: [{ l: "Token embedding", s: "128,256 × 2048, tied" }],
    block: {
      title: "Decoder layer",
      repeat: "× 36",
      stream: "residual stream",
      note: "Layers 3, 7, … 35: no RoPE (NoPE)",
      branches: [
        {
          title: "Attention",
          steps: [
            { l: "RMSNorm" },
            { l: "Q, K, V projections", s: "16 Q / 4 KV, d = 128" },
            { l: "RoPE θ 5M, or none", s: "NoPE every 4th layer", n: true },
            { l: "Causal attention", s: "intra-document mask in training", n: true },
            { l: "Output projection" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "Dense FFN",
          steps: [
            { l: "RMSNorm" },
            { l: "SwiGLU", s: "2048 → 11,008 → 2048" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "tied to the embedding" },
    ],
  },


  olmo3: {
    s: "R+C",
    caption: "One Olmo 3 32B layer, repeated 64 times. Three of every four layers attend over a 4,096-token window and every fourth is global. Following OLMo 2, the RMSNorm sits on each sublayer's output rather than its input, and queries and keys are normalized.",
    inputs: [{ l: "Token embedding", s: "100,278 × 5120, untied" }],
    block: {
      title: "Decoder layer",
      repeat: "× 64",
      stream: "residual stream",
      note: "Full attention at 3, 7, … 63; sliding window 4,096 elsewhere",
      branches: [
        {
          title: "Attention (16 full + 48 SWA)",
          steps: [
            { l: "Q, K, V projections", s: "40 Q / 8 KV, d = 128" },
            { l: "QK-Norm", n: true },
            { l: "RoPE θ 500k", s: "YaRN ×8 on full layers only", n: true },
            { l: "Attention", s: "window 4,096 or full" },
            { l: "Output projection" },
            { l: "RMSNorm on the output", s: "reordered norm", n: true },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "Dense FFN",
          steps: [
            { l: "SwiGLU", s: "5120 → 27,648 → 5120" },
            { l: "RMSNorm on the output", s: "reordered norm", n: true },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "untied" },
    ],
  },


  lfm3: {
    s: "B+C",
    caption: "One LFM3-1.7B layer, repeated 24 times with sandwich norms. Over half the layers mix tokens with a gated 7-tap convolution; the rest use attention, alternating 256-token sliding windows and global layers whose heads rotate only half their dims. Every attention head's output passes a sigmoid gate.",
    inputs: [{ l: "Token embedding", s: "128,000 × 2048, tied" }],
    block: {
      title: "Decoder layer",
      repeat: "× 24",
      stream: "residual stream",
      note: "Global at 2, 6, … 22 · SWA 256 at 4, 8, … 20 · conv elsewhere",
      branches: [
        {
          title: "Token mixer (13 conv + 5 SWA + 6 global)",
          steps: [
            { l: "RMSNorm (pre)" },
            { l: "C ⊙ conv₇(B ⊙ x)", s: "gated short conv, length 7", n: true },
            { l: "or GQA + QK-norm", s: "16 Q / 4 KV × 128" },
            { l: "RoPE", s: "global: half dims, θ 1M · SWA 256: full, θ 10k", n: true },
            { l: "× σ(gate) per head", n: true },
            { l: "RMSNorm (post)", s: "sandwich norm", n: true },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "Dense FFN",
          steps: [
            { l: "RMSNorm (pre)" },
            { l: "SwiGLU", s: "2048 → 7,680 → 2048" },
            { l: "RMSNorm (post)", s: "sandwich norm", n: true },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { l: "LM head", s: "tied to the embedding" },
    ],
  },


  ml4: {
    s: "C",
    caption: "One Mistral Large 4 layer, repeated 72 times. Every layer is MLA with DeepSeek Sparse Attention and no query LoRA. The indexer reads the normed hidden state alongside Q and KV and picks the 2,048 tokens attention may use. Every fourth layer drops RoPE, 28 layers reuse the previous layer's picks, and 9 late NoPE layers read layer 35's cached latent but expand it with their own up-projection, so their keys and values are their own.",
    inputs: [{ row: [
      { l: "Token embedding", s: "204,800 × 6144" },
      { l: "Pixtral ViT + projector", s: "≈ 1.6B ViT → 2×2 merge → MLP", n: true },
    ] }],
    block: {
      title: "Decoder layer",
      repeat: "× 72",
      stream: "residual stream",
      note: "Layer 0: dense SwiGLU FFN (24,576) instead of MoE",
      branches: [
        {
          title: "MLA + DeepSeek Sparse Attention",
          steps: [
            { l: "RMSNorm" },
            { row: [
              { l: "Q: 6144 → 64 × 128", s: "full rank, no Q-LoRA", n: true },
              { l: "KV latent 512 + 64", s: "RMSNorm, cached", n: true },
              { l: "Indexer: top-2,048", s: "28 layers reuse", n: true },
            ] },
            { l: "LeRoPE: YaRN × learned α", s: "q and k, 64 dims; none on NoPE layers", n: true },
            { l: "SSMax query scale", s: "q · (s·log(pos+1) + b) per head", n: true },
            { l: "K, V up-projection (kv_b)", s: "own weights; L39…71 expand L35's latent", n: true },
            { l: "Sparse attention", s: "64 heads over the 2,048 picked tokens", n: true },
            { l: "Output projection", s: "64 × 128 → 6144" },
          ],
          merge: { l: "+ residual" },
        },
        {
          title: "MoE (layers 1–71)",
          steps: [
            { l: "RMSNorm" },
            { l: "Softmax router (FP32)", s: "top-4 of 128, renormalized" },
            { row: [
              { l: "4 SwiGLU experts", s: "6144 → 6144 → 6144" },
              { l: "1 shared expert", s: "SwiGLU 6144, unweighted" },
            ] },
            { l: "Routed sum × 1.0 + shared", s: "weights apply to routed experts only" },
          ],
          merge: { l: "+ residual" },
        },
      ],
    },
    outputs: [
      { l: "Final RMSNorm" },
      { row: [
        { l: "LM head, softcap 30", s: "30 · tanh(z / 30), untied", n: true },
        { l: "DSpark drafter, 3 layers", s: "reads L1, 18, 36, 54, 71", n: true },
      ] },
    ],
  },
};

/*
 * Whole-network stack diagrams, for models whose layers differ in role (not just
 * attention type). Each layer gets a mode; the renderer draws the columns, which
 * layers produce shared state, and the arrows between them. Built from config.json.
 */
window.STACKS = {
  dsv41: (function () {
    // From config.json: kv_source_layer_ids, index_source_layer_ids, compress_ratios, engram_layer_ids.
    const kvSrc = [2, 8, 14, 20];
    const idxSrc = [2, 8, 14, 20, 24, 28, 32, 36];
    const latest = (list, i) => list.filter((x) => x <= i).pop();
    const layers = Array.from({ length: 40 }, (_, i) => {
      if (i < 2) return { i, mode: "swa", t: "SWA only (window 128)" };
      const m = i < 20 ? 2 : 1;
      const kv = latest(kvSrc, i), idx = latest(idxSrc, i);
      if (kvSrc.includes(i))
        return { i, mode: "full", t: i === 20 ? "Full · m=1 · main KV from H19 · builds pool" : `Full · m=2 · makes main KV + top-512` };
      if (idxSrc.includes(i)) return { i, mode: "reindex", t: `Reindex · KV of L${kv} · own top-512 from pool` };
      return { i, mode: "reuse", t: `Reuse · KV of L${kv} · indices of L${idx}` };
    });
    return {
      s: "R+C",
      columns: [
        { title: "Causal encoder · L0–19", note: ["Prefill: every prompt token runs here", "8B active per token"], from: 0, to: 19 },
        { title: "Decoder · L20–39", note: ["Prefill: last 128 tokens only (bounded replay)", "Decode: every new token · 16B active"], from: 20, to: 39 },
      ],
      layers,
      kvSrc,
      reindex: [24, 28, 32, 36],
      pool: { from: 20, label: "candidate pool: 2,048 blocks × 8 = 16,384 positions" },
      engram: [1, 14],
      input: "Text + DeepSeek-ViT embeddings → 4 mHC residual streams",
      bridge: "H19 feeds L20: residual input + source of decoder main KV",
      output: ["Final RMSNorm → LM head", "DSpark drafter (reads L37–39)"],
      caption: "All 40 layers of DeepSeek-V4.1-Flash, bottom to top. Every layer computes its own query and 128-token SWA KV. Only 4 layers create the shared FP4 main KV, and 8 create top-512 indices; every other layer borrows them. The 20 decoder layers share one main KV, projected from the encoder's output, which is why prefill can stop after the encoder.",
    };
  })(),
  ml4: (function () {
    // From params.json / config.json: dsa.sharing (indexer_types), kv_sharing (kv_source_layers), nope pattern.
    const sharing = "full,full,full,full,full,full,full,full,full,full,full,full,full,full,full,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full,full,shared,shared,full".split(",");
    const kvSource = "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,35,40,41,42,35,44,45,46,35,48,49,50,35,52,53,54,35,56,57,58,35,60,61,62,35,64,65,66,35,68,69,70,35".split(",").map(Number);
    const nope = (i) => (i + 1) % 4 === 0; // no_rope_layer_interval = 4
    const lastFull = (i) => { let j = i; while (sharing[j] !== "full") j--; return j; };
    const isSource = (i) => kvSource.some((src, j) => j !== i && src === i);
    const layers = Array.from({ length: 72 }, (_, i) => {
      const pos = nope(i) ? "NoPE" : "RoPE";
      if (kvSource[i] !== i) return { i, mode: "reindex", t: `${pos} · KV of L${kvSource[i]} · own top-2048` };
      if (sharing[i] === "shared") return { i, mode: "reuse", t: `${pos} · own KV · top-k of L${lastFull(i)}` };
      if (isSource(i)) return { i, mode: nope(i) ? "nope" : "full", t: `${pos} · own KV, read by 9 more · own top-k` };
      return { i, mode: nope(i) ? "nope" : "full", t: `${pos} · own KV · own top-2048${i === 0 ? " · dense FFN" : ""}` };
    });
    return {
      s: "C",
      columns: [
        { title: "Layers 0–35", note: ["Every layer caches its own MLA latent", "L0 dense FFN; L1–71 MoE, 128 → 4 + 1 shared"], from: 0, to: 35 },
        { title: "Layers 36–71", note: ["NoPE layers 39, 43, …, 71 read L35's cache", "Two of every four layers reuse the indexer"], from: 36, to: 71 },
      ],
      layers,
      kvRails: false,
      legend: [["full", "RoPE: own KV, own indexer"], ["nope", "NoPE: own KV, own indexer"], ["reuse", "Own KV, reuses previous top-k"], ["reindex", "NoPE: KV of L35, own indexer"]],
      input: "Text + Pixtral image tokens",
      bridge: "L35 → L36",
      output: ["LM head, softcap 30", "DSpark drafter, 3 layers"],
      caption: "All 72 layers of Mistral Large 4, bottom to top. Each layer's role comes from three config fields: the NoPE pattern, indexer_types and kv_source_layers. Only 63 layers store KV; the 9 late NoPE layers attend over layer 35's latent but still pick their own top-2,048 tokens.",
    };
  })(),
};
