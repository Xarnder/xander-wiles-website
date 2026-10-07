# Speech recognition models: candidates, verbatim accuracy and licensing

The transcript in Silence Cutter is primarily a **speech-presence signal**: a word's time span
means "someone was speaking here". A model that "cleans up" speech (drops _um_, _uh_, repetitions,
false starts) reports those moments as gaps, so they look like silence and could be cut. Verbatim
transcription is therefore a functional requirement, not a cosmetic one.

All engines sit behind `TranscriptionEngine` (`src/lib/asr/types.ts`); the editor never depends on
a specific model.

## Summary

| Model                                                                                                                  | Verbatim?                                                           | Word timing                                                | Licence (weights)                                           | Browser-ready ONNX                                                                                                  | Download                                    | Status in app                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **CrisperWhisper 2.0 Turbo**                                                                                           | ✅ fillers, repeats, stutters, false starts, cut-offs, vocal events | supervised alignment heads + Viterbi (~30 ms MAE upstream) | nyra health **Non-Commercial Research**, _outputs included_ | ✅ `Masterx/CrisperWhisper2.0-turbo-ONNX` (with cross-attention outputs)                                            | 906 MB (q4 enc / fp16 dec) · 1.75 GB (fp16) | **Default when `CRISPERWHISPER=enabled`**                                                                    |
| CrisperWhisper 2.0 Large                                                                                               | ✅ (best open CW quality)                                           | as above                                                   | Non-Commercial                                              | ✅ `Masterx/CrisperWhisper2.0-large-ONNX`                                                                           | 1.49 GB (q4)                                | Offered ("Best accuracy"); **not benchmarked here**; expect several times slower decoding (32-layer decoder) |
| CrisperWhisper 2.0 Small/Medium                                                                                        | ✅                                                                  | as above                                                   | Non-Commercial                                              | ❌ no conversion with cross-attention outputs published (`onnx-community/…small-ONNX-timestamped` is an empty repo) | ~250–500 MB expected                        | Not offered; see "Converting"                                                                                |
| CrisperWhisper 2.0 _Pro_                                                                                               | ✅ (best)                                                           | as above                                                   | **Commercial licence only**                                 | ❌                                                                                                                  | —                                           | Not available                                                                                                |
| CrisperWhisper 1.0                                                                                                     | ✅ (EN/DE only)                                                     | DTW-style                                                  | CC BY-NC 4.0                                                | ✅ `onnx-community/CrisperWhisper-ONNX` (large-v3 size)                                                             | 1.2–3.6 GB                                  | Not offered (superseded by 2.0)                                                                              |
| **Whisper Base/Small** (OpenAI)                                                                                        | ❌ "intended" text: often omits fillers, repeats, false starts      | unsupervised alignment heads                               | **MIT**, commercial use OK                                  | ✅ `onnx-community/whisper-*_timestamped`                                                                           | 142–485 MB                                  | Offered, labelled **"not verbatim"**                                                                         |
| Whisper large-v3-turbo verbatim fine-tune (`JacobLinCool/whisper-large-v3-turbo-verbatim-1`, trained on AMI disfluent) | partially (AMI-style disfluencies)                                  | alignment heads not re-supervised                          | MIT (data: AMI, CC BY 4.0)                                  | ❌ needs export                                                                                                     | ~900 MB                                     | Best permissive verbatim candidate; not validated                                                            |
| NVIDIA Parakeet TDT 0.6B v2/v3                                                                                         | ❌ trained on normalised text; fillers usually dropped              | token/word timestamps (80 ms frames)                       | CC BY 4.0, commercial OK                                    | ✅ community ONNX (`istupakov/…-onnx`)                                                                              | ~650 MB                                     | Not offered: not verbatim, separate runtime                                                                  |
| Pingala V1 Verbatim                                                                                                    | ✅ (EN)                                                             | yes                                                        | RAIL-M (commercial with use restrictions)                   | ❌ (faster-whisper/CT2)                                                                                             | ~3 GB                                       | Too large for the browser                                                                                    |
| Silero VAD                                                                                                             | n/a (speech/non-speech only)                                        | frame-level                                                | MIT                                                         | ✅                                                                                                                  | 2 MB                                        | Not needed: the audio detector covers this role                                                              |

## Why CrisperWhisper 2.0

- It is designed for verbatim output and controllable via mode tags. Its upstream benchmark reports
  the best disfluency F1 among open models and ~30 ms word-boundary error on read speech.
- Its timings come from **supervised** cross-attention alignment heads, which matter for cutting.
  Standard Whisper's heads are unsupervised and drift.
- The inference code is **MIT**, so its algorithms are ported to TypeScript here
  (`src/lib/asr/crisper/`), credited in each file.

**Licensing constraint:** the weights _and the transcripts they produce_ are licensed for
non-commercial research only; any commercial use needs a licence from nyra health
(<https://www.nyra-labs.com/crisperwhisper>). Therefore:

1. The weights are **never bundled or hosted** by this site. Browsers download them from Hugging Face.
2. CrisperWhisper is **only offered when the build sets `CRISPERWHISPER=enabled`** (on by default in
   `npm run dev`, off in `npm run build`).
3. Users must tick a licence acknowledgement before the first download.
4. Without the flag the app offers MIT-licensed Whisper, labelled "not verbatim" in the model picker,
   transcript header and model panel. It is **not** presented as meeting the verbatim requirement.

## Verification of `Masterx/CrisperWhisper2.0-turbo-ONNX` (the conversion used)

| Check                    | Result                                                                                                                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Licence                  | Derivative of `nyralabs/CrisperWhisper2.0_turbo`; same Non-Commercial Research licence (share-alike).                                                                                                                                                                                                          |
| Files / sizes            | encoder q4 425 MB, fp16 1.27 GB, fp32 2.55 GB; merged decoder fp16 477 MB, q4 600 MB (embeddings left unquantised), fp32 954 MB.                                                                                                                                                                               |
| Quantisation             | 4-bit `MatMulNBits` (block 32, symmetric); fp16 via onnxconverter with fp32 I/O.                                                                                                                                                                                                                               |
| Prompt / verbatim tokens | Mode tags `[verbatim_1..5]` precede `<                                                                                                                                                                                                                                                                         | startoftranscript | >`. Added tokens include `[UM] [UH] [laughter] [breath] [cough] [sigh] [noise] [lipsmack] …`plus`<ctx>/<ectx>`. Reproduced exactly; verified in output (`[UH]`, `[UM]`, `w- which`, `sta-`, `loner- lunar`, `[laughter]`, `[breath]`). |
| Cross-attention outputs  | Present (`cross_attentions.0–3`); alignment heads in `generation_config.json` (layers 1–3).                                                                                                                                                                                                                    |
| WebGPU                   | ✅ Apple M4 (metal-3), fp16 and q4. fp16 encoder is **1.8× faster** than q4 (1.25 s vs 2.2 s per 30 s window).                                                                                                                                                                                                 |
| WASM / CPU               | ✅ q4 encoder + q4 decoder (1.02 GB), 8 threads: **1.27× real time** on an Apple M4 CPU, same transcript as WebGPU (338 vs 339 words). Older or low-core CPUs will be slower than real time. See PERF.md.                                                                                                      |
| Word timestamps          | Same algorithm as upstream (mel-blank Viterbi, sharpen 5, γ=3, penalty 3, 100 ms gap split). Seams verified: no duplicated 4-grams across 84 window boundaries of a 37-min recording. No reference timings exist for the test audio, so upstream's ~30 ms MAE is **not re-measured** for the quantised export. |
| Long recordings          | 37 min and 60 min transcribed end to end. Required two additions beyond upstream: skipped-speech recovery (context reset + gap filling) and a shifted-window retry. Details below.                                                                                                                             |
| Memory                   | JS heap ≈ 300 MB for a 37-min project; model weights live in GPU memory (≈1.6 GB estimated for the 906 MB variant; browsers do not expose GPU memory use).                                                                                                                                                     |

### Long-form behaviour and fixes

Upstream's conditional continuation (`<ctx> last 12 words <ectx>` in each 30 s window, 26 s stride,
overlap-aware trailing-word drop) is reproduced. On the NASA press-conference recording, the model
sometimes **skipped real speech**: it stopped confidently after `[laughter]`, or resumed later in the
window, and a few windows missed a quieter reporter's question even without context. Since the
transcript detector treats missing words as silence, this would endanger speech in Transcript or
Aggressive mode. The port adds:

1. **Skipped-speech detection anywhere in a window:** speech-active mel frames not covered by any
   word (gaps ≥ 1.5 s).
2. **Context reset with gap filling:** re-decode without `<ctx>` and insert those words _only into
   gaps_ of the continuation decode.
3. **Shifted-window retry:** re-decode a 30 s window starting just before the first uncovered gap
   (the model is most reliable at window starts) and gap-fill again.
4. Encoder output reuse across re-decodes of the same window.

In Conservative mode, any speech the transcript still misses is protected by the audio detector.

## Recommendation for commercial deployments

1. **Best:** license CrisperWhisper 2.0 (or Pro) from nyra health and enable the flag.
2. **Commercially safe today:** Whisper (MIT) in **Conservative** mode. Cuts then require the audio
   detector to agree, so fillers or repeats that Whisper omits are still kept if they are audible.
   The transcript is not verbatim.
3. **To evaluate:** `JacobLinCool/whisper-large-v3-turbo-verbatim-1` (MIT weights, AMI data CC BY 4.0).
   It needs an ONNX export with cross-attention outputs (below) and a disfluency/timing evaluation.
   Its alignment heads were not re-supervised, so expect Whisper-like timing.

## Converting a model for the browser

The app accepts any Whisper-architecture ONNX export with a merged decoder that outputs
`cross_attentions.*`, and `alignment_heads` in `generation_config.json`. This is how the Masterx
conversion was produced and how a CrisperWhisper 2.0 Small/Medium export could be made (respect the
licence; derivatives inherit the non-commercial terms):

```bash
pip install "optimum[onnxruntime]" onnxconverter-common
python - <<'PY'
from optimum.exporters.onnx import main_export
main_export("nyralabs/CrisperWhisper2.0_small", output="cw2-small-onnx",
            task="automatic-speech-recognition-with-past", model_kwargs={"output_attentions": True})
PY
# then quantise MatMuls to 4-bit (onnxruntime MatMulNBitsQuantizer, block_size=32) and/or convert
# to fp16 (onnxconverter_common.float16, keep_io_types=True), place files under onnx/ with the
# Transformers.js suffixes (_q4, _fp16), host the repo, and add an entry to src/lib/asr/models.ts.
```
