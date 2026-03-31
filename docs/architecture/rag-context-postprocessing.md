# RAG Context Postprocessing

## Scope

This change only optimizes runtime retrieval post-processing and prompt context construction.

It does **not** change:

- eval metrics
- eval logic
- dataset schema
- gold annotations
- `relevant_chunk_ids` / `usable_chunk_ids` resolution
- raw `rag_service.search()` behavior

## Insertion Points

The post-processing layer is applied in two runtime paths:

1. `backend/services/ai/rag_context.py`
   - used by outline generation
   - used by courseware generation
   - used by studio tool artifact generation

2. `backend/routers/chat/message_flow.py`
   - used by chat response context loading

This keeps `backend/eval/run_eval.py` untouched, because eval still reads raw retrieval results directly from `rag_service.search()`.

## Dedup Strategy

After the existing retrieval `top_k`, a candidate dedup layer runs with these checks:

1. Exact `chunk_id` dedup
2. Normalized text exact dedup
3. High-overlap dedup
   - token Jaccard
   - token containment
   - normalized string similarity
4. Same-document structural dedup
   - same filename / upload
   - same title-like first line
   - adjacent chunk index with strong sentence overlap

When two candidates are considered duplicates, the layer keeps the chunk with higher combined quality:

- stronger query overlap
- higher original retrieval score
- higher information density

This is designed to remove repeated slices from the same source document without collapsing genuinely different evidence.

## Compression Strategy

Each kept chunk is compressed into an evidence snippet.

Default mode is `rule`.

Rule compression uses:

- minimal Chinese/English sentence splitting
- query-aware sentence scoring
- keyword / term overlap
- sentence information density
- template sentence penalty
- within-chunk sentence dedup

Typical removals:

- cover / preface sentences
- repeated headings
- boilerplate sentences
- low-signal background text

Typical retained content:

- fact-bearing sentences
- query-matching sentences
- high-density evidence sentences

`llm` and `hybrid` are supported through config:

- `llm`: try LLM sentence selection first, fall back to rule compression
- `hybrid`: rule compression first, then optional LLM refinement, fall back to rule result

If no LLM compressor is available, both modes degrade safely to rule compression.

## Why This Helps

The runtime issue was not pure retrieval miss. The main failure mode was noisy context:

- duplicate chunks consume budget
- adjacent but weakly relevant chunks dilute the prompt
- long raw chunks force the model to read more text than needed

The new layer reduces context pollution by:

1. removing repeated evidence from the same source
2. keeping fewer but denser chunks
3. shortening each chunk to query-relevant evidence sentences
4. preserving original `chunk_id` traceability

This should help downstream generation focus on the highest-value evidence while keeping fact coverage stable.

## Config

Runtime keys live under `system_settings.feature_flags.feature_flags` and also support env overrides.

Keys:

- `enable_context_dedup`
- `enable_context_compression`
- `compression_mode`
- `max_evidence_chunks`
- `max_sentences_per_chunk`
- `similarity_threshold`

Env mapping:

- `ENABLE_CONTEXT_DEDUP`
- `ENABLE_CONTEXT_COMPRESSION`
- `RAG_CONTEXT_COMPRESSION_MODE`
- `RAG_CONTEXT_MAX_EVIDENCE_CHUNKS`
- `RAG_CONTEXT_MAX_SENTENCES_PER_CHUNK`
- `RAG_CONTEXT_SIMILARITY_THRESHOLD`

Default values:

- `enable_context_dedup = true`
- `enable_context_compression = true`
- `compression_mode = rule`
- `max_evidence_chunks = 5`
- `max_sentences_per_chunk = 3`
- `similarity_threshold = 0.82`

## Diagnostics

Each runtime request now logs:

- raw retrieved chunk ids
- deduped chunk ids
- removed duplicate chunk ids and reasons
- per-chunk original/compressed length
- final evidence snippets
- retrieval latency
- dedup latency
- compression latency

## Risks

1. Over-compression
   - A strict sentence budget can remove secondary facts.
   - Mitigation: increase `max_sentences_per_chunk`.

2. Over-dedup
   - Adjacent chunks from the same file may share vocabulary but still contain distinct facts.
   - Mitigation: tune `similarity_threshold` upward.

3. LLM compression drift
   - LLM mode may over-summarize if enabled carelessly.
   - Mitigation: default to `rule`, and keep `llm/hybrid` behind explicit config.

4. Context budget tradeoff
   - Lower `max_evidence_chunks` reduces noise but may cut tail evidence.
   - Mitigation: keep defaults conservative and tune by workload.

## Local Validation

```bash
cd backend
venv\Scripts\python.exe -m pytest tests\services\test_rag_context_postprocess.py tests\ai\test_rag_context.py tests\services\test_prompt_service.py tests\api\test_system_settings_api.py
venv\Scripts\python.exe -m py_compile services\rag_service\context_postprocess.py services\ai\rag_context.py routers\chat\message_flow.py services\system_settings_service\service.py
```
