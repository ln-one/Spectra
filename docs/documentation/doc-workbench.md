# Documentation Workbench

> Status: `current`
> Purpose: internal writing control panel for future Spectra documentation work.
>
> This is not a polished external document. It records what we must remember,
> what we may safely disclose, what we should not disclose too deeply, and what
> sources we should trust while producing later architecture, competition, and
> product documents.

## 1. Role of This Document

This document exists to prevent drift during upcoming writing work.

Use it as the default pre-read before drafting:

- commercial proposal content
- repo architecture/system documentation
- product narrative documents
- service positioning and highlight summaries

This file should capture:

- user intent that must not be forgotten
- disclosure boundaries
- architecture truth
- reusable source materials
- teacher feedback converted into hard writing rules

Current local skill support worth using for this workflow:

- `doc`
  - for final `.docx` editing, structured formatting, and rendered page checks
- `pdf`
  - for final PDF inspection, layout verification, and visual QA
- `slides`
  - for presentation-style slide generation or editable `.pptx` delivery when proposal materials need deck outputs

These skills are not primary truth sources. They are production aids for final packaging and visual validation.

Important writing-process rule:

- outward-facing chapters must read as one coherent commercial document
- internal writing sources may and should be decomposed when a chapter becomes too large to maintain safely in one file
- long chapters must be treated as engineering work: capability groups, evidence policy, figure mapping, and truth-check notes should be split instead of forced into a single markdown file

External best-practice rule:

- borrow method, not template
- later writing should selectively absorb proven documentation practice from authoritative sources, then adapt it to Spectra's commercial-proposal needs
- the current preferred external references are:
  - Google technical writing guidance for audience-first writing
  - Microsoft architecture diagram guidance for layered, purposeful visuals
  - Diátaxis for separating explanation, reference, and complex hierarchy organization

Current reference links:

- Google Technical Writing: [Use audience and purpose to plan your document](https://developers.google.com/tech-writing/one/audience)
- Microsoft Learn: [Create architecture diagrams by using Visio](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/diagram-create)
- Diátaxis: [Diátaxis framework](https://diataxis.fr/)

## 2. Canonical Truth Sources

Important global rule:

- documentation is not the only truth source
- when there is any meaningful risk of drift, writing must return to live code,
  passing tests, current service contracts, and current runtime behavior
- elegant stale wording is worse than plain accurate wording

### 2.1 Philosophy and product truth

These are the primary semantic sources:

- [docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md](/Users/ln1/Projects/Spectra/docs/project/SYSTEM_PHILOSOPHY_2026-03-19.md)
- [docs/project/README.md](/Users/ln1/Projects/Spectra/docs/project/README.md)
- [docs/project/requirements.md](/Users/ln1/Projects/Spectra/docs/project/requirements.md)

These define:

- the recursive knowledge-system worldview
- the ontology of `Project / Session / Reference / Version / Artifact / CandidateChange / Member`
- the intended product loop and aesthetic standard
- the slogan hierarchy that later external writing should remain faithful to:
  - `生产即沉淀，沉淀即交付。`
  - `系统本体不是导出文件，而是库与引用关系。`
  - `PPT、教案、导图、动画与互动内容，都只是知识空间的按需外化结果。`
  - `以库为核心单元，以课程数据库为底座，以引用关系形成知识网络，以多模态内容按需外化。`

### 2.2 Formal ontology and knowledge-state truth

These remain essential references even though they live under `archived`:

- `docs/archived/project-space/*`

Important rule:

- these files are archived by location, not by semantic irrelevance
- for `Ourograph`, library semantics, and formal knowledge-state writing, they remain core references
- do not treat them as runtime implementation docs
- do treat them as high-value semantic and ontology material
- absorb their core judgments into later external writing:
  - `库 = 一个可生成、可引用、可协作、可演化的课程知识单元`
  - the system ontology is `库 + 引用关系`, not a single export file
  - the course database is the long-lived sedimentation object
  - `Artifact` is an on-demand externalized result, not the ontology itself
  - `Reference` forms the knowledge network between spaces
  - `Version` and `CandidateChange` are the formal language of controlled evolution

### 2.3 Current architecture and runtime truth

Use these to confirm what the system is now:

- [AGENTS.md](/Users/ln1/Projects/Spectra/AGENTS.md)
- [docs/architecture/service-boundaries.md](/Users/ln1/Projects/Spectra/docs/architecture/service-boundaries.md)
- [docs/architecture/system/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/system/overview.md)
- [docs/architecture/system/kernel-note.md](/Users/ln1/Projects/Spectra/docs/architecture/system/kernel-note.md)
- [docs/architecture/backend/overview.md](/Users/ln1/Projects/Spectra/docs/architecture/backend/overview.md)
- [docs/architecture/api-contract.md](/Users/ln1/Projects/Spectra/docs/architecture/api-contract.md)
- [backend/README.md](/Users/ln1/Projects/Spectra/backend/README.md)
- [docs/agent-memory.md](/Users/ln1/Projects/Spectra/docs/agent-memory.md)

Reality-check rule:

- if a claim affects architecture, authority boundaries, primary pipelines, or
  “what the system has actually built,” verify it against current code and
  current service behavior before promoting it into formal competition writing

### 2.4 Microservice source materials

The six microservice repositories are all important writing material:

- `diego`
- `pagevra`
- `ourograph`
- `dualweave`
- `stratumind`
- `limora`

Their READMEs, AGENTS guides, architecture notes, benchmark/report material, and
docs are valid evidence sources for later writing.

### 2.5 Code and test reality

When later writing depends on implementation truth, use:

- live backend code
- focused passing tests
- current compose topology / service wiring
- current microservice code and docs

Do not let a polished old paragraph override current system reality.

### 2.6 Evidence whitelist and blacklist for outward-facing claims

For business-facing, showcase-facing, or commercial-proposal writing, use this
additional evidence rule:

- main conclusions about performance, quality, and reliability must come from:
  - latest formal benchmark/report files
  - live code reality
  - focused passing tests
  - current service README/docs
  - current compose/runtime reality

Do not use the following as primary outward-facing evidence:

- old `docs/project/*` quality conclusions
- phase summaries and stage reports
- internal draft conclusions that are not explicitly the latest formal set
- any evidence source the user has explicitly marked as untrustworthy

Special rule for `Stratumind` / RAG writing:

- primary showcase numbers must come from the latest formal sets such as
  `promoted60_*` and `promoted105_*`
- older experimental reports may be used only as downgraded supporting material
  for technical depth, not as headline performance claims

Additional writing rule for the external main document:

- assume the reader can see only the final document
- do not rely on repo paths, markdown links, file jumps, or “see code/test/README”
- all important claims must be self-contained through prose, figures, and tables

### 2.6.1 Legacy DOCX boundary

The legacy `docs_output/Spectra.docx` and the derived study pack under
`docs/documentation/legacy-docx-study/` are allowed to influence only:

- title style
- chapter pacing
- completeness signals
- formal proposal tone

They are not allowed to influence:

- current architecture truth
- service-boundary truth
- deployment truth
- database/state/contract truth
- benchmark or business truth

Working rule:

- if a legacy passage helps the manuscript feel more like a mature formal submission, it may be studied
- if it pulls the manuscript toward stale system understanding, drop it immediately

Default reviewer-adaptation rule:

- for conservative reviewers, legacy material may still be used as a reference for title naming, chapter pacing, completeness signals, and steadier submission tone
- those gains must stay at the expression layer only; they must never override current system truth

### 2.6.2 Conservative reviewer completeness signals

When using the legacy study pack to make the outward-facing manuscript feel more
complete to conservative reviewers, prefer borrowing only these signal classes:

- visible system design coverage
- visible implementation grouping
- visible data/state/runtime/contract coverage
- visible testing/evidence coverage
- visible governance/risk/completion coverage

Do not borrow legacy material merely because it contains more sections.

The threshold question is:

- does this addition improve completeness perception for an external reviewer while preserving current architecture truth?

If yes, it may be used.

If the addition mainly reintroduces stale deployment detail, flat backend
thinking, fake single-database neatness, or contest-template tone, reject it.

### 2.7 Long-chapter control for the commercial proposal

For large technical chapters, especially `05-key-technologies`, use a dual-layer structure:

- one outward-facing chapter that keeps the final reading experience intact
- one internal source set that decomposes the chapter by capability group

Default decomposition triggers:

- more than four major capability groups
- heavy figure + evidence + product-surface coupling
- likely context overflow in one-pass editing
- repeated drift or uneven detail when edited as one file

Current default internal split for chapter 5:

- knowledge-state / `Ourograph`
- `Studio` + `Diego` generation chain
- `Pagevra` preview / render / export
- `Dualweave` + `Stratumind` ingest / RAG
- `Limora` identity / organization boundary
- system-level results and synthesis

### 2.8 Best-practice synthesis for Spectra writing

When turning truth into outward-facing proposal prose, follow this synthesis:

- audience-first:
  - start from what the reader needs to decide
  - answer "what is it, what does it solve, what has been built, why does it matter" before lower-level implementation detail
- progressive disclosure:
  - main chapter explains system meaning and capability groups
  - internal source docs carry deeper evidence, code anchors, and section-level implementation truth
  - figures move from whole-system view to workflow view to section-specific mechanism
- content separation:
  - external main prose is explanation-oriented
  - evidence tables and source packs are closer to reference material
  - internal control docs act like how-to/process guidance for maintainers
- complex hierarchy control:
  - when one chapter mixes product surface, architecture, proof, figures, and multiple services, split it before quality drops

### 2.9 AI-assisted writing workflow

For AI-era documentation work, use a grounded generation loop instead of freeform drafting:

1. build a source pack first
   - code anchors
   - test anchors
   - benchmark/evidence anchors
   - canonical philosophy and architecture anchors
2. decide the chapter frame before writing
   - audience
   - core question the reader must answer
   - section groups
   - figure slots
3. draft by capability group, not by random paragraph accumulation
4. force a verification pass after every meaningful chunk
   - check against code
   - check against tests
   - check against product surface
   - check against disclosure boundaries
5. only then merge back into the outward-facing chapter

This workflow exists to counter the default failure mode of LLM-assisted writing:

- smooth but stale prose
- over-compressed long chapters
- invented linkage between systems
- old evidence leaking into new claims
- product reality being overwritten by elegant wording

In practice, this means:

- long chapters should be decomposed
- each source pack should stay small enough to review
- facts should be promoted upward only after verification
- the polished outward-facing chapter is the last layer, not the first

### 2.10 Commercial ecosystem flywheel memory

This subsection records the current business-strategy memory for future proposal
work. It is an internal control note, not finished outward-facing prose.

Core judgment:

- `Spectra` is not merely an AI courseware generator or a single-teacher
  subscription tool.
- The deeper business object is a `课程知识资产网络`.
- A high-quality `Project / 课程库` is an asset node that can be referenced,
  authorized, externalized, evolved, and traded.
- `Reference / Version / CandidateChange / Member` are not only technical
  ontology terms. They are also business terms for citation, authorization,
  revenue, permission, and controlled evolution.
- 角色不是本体，权限组合和关系才是本体. Teachers, students, creators,
  learners, institution admins, and reviewers should be described as permission
  bundles around course libraries rather than fixed product identities.

Business flywheel:

1. Creators build high-quality course libraries through a low-friction
   production path.
2. Learners, other creators, teams, and institutions use, reference, follow,
   fork, license, or externalize those course libraries.
3. The platform monetizes through subscriptions, value-added generation,
   transaction take-rate, institutional delivery, private deployment, and
   service fees.
4. More usage creates more course libraries, reference relations, learning
   behavior, and multimodal artifacts.
5. The growing knowledge network improves retrieval, recommendation,
   generation, personalization, and future AI education services.
6. Better AI services attract more creators, learners, and institutions, which
   strengthens the next round of the flywheel.

Revenue layers to remember:

- Tool subscription layer: individual teachers, knowledge creators, trainers,
  and enterprise lecturers can buy subscriptions, quotas, advanced models,
  export capacity, and private workspaces.
- Course asset layer: high-quality course libraries can be referenced,
  followed, forked, subscribed to, licensed, or purchased. Creators earn
  revenue and the platform takes a share.
- Learner value-added layer: learners can pay for advanced services around a
  course library, such as personal mind maps, review handouts, interactive
  exercises, mistake reinforcement, AI tutoring, and personalized learning
  paths.
- Organization platform layer: schools, training institutions, and enterprise
  universities can buy private deployment, internal resource integration,
  permission governance, branding, and customization.
- Long-term intelligent network layer: accumulated course libraries, reference
  graphs, externalized results, and learning behavior form an AI-native
  education infrastructure.

External expression boundary:

- Internally, it is acceptable to recognize the long-term strategic possibility
  that the platform can restructure a large amount of repetitive teaching work.
- In outward-facing commercial documents, avoid aggressive replacement language
  or ethically risky phrasing.
- Preferred external framing:
  `从教师效率工具，演进为课程知识资产平台，再演进为 AI 原生个性化学习基础设施。`
- Emphasize empowering high-quality creators, amplifying course assets,
  improving personalized learning, and helping institutions govern and deliver
  knowledge more effectively.

Implication for chapter 8:

- `08-business-plan.md` should not stop at teacher subscription and
  institutional delivery.
- Those two paths are entry layers of the business model, not the full business
  imagination.
- The chapter should evolve toward a platform ecology: course asset trading and
  authorization, creator revenue, learner value-added payments, platform
  take-rate, private institutional delivery, data/network effects, and the
  long-term AI education infrastructure strategy.

## 3. Architecture Truth We Must Keep Stable

### 3.1 Spectra

Spectra is:

- the product shell of the recursive knowledge system
- a `workflow shell`
- an `orchestration kernel`
- a `contract surface`
- the working surface where production, sedimentation, delivery, return, and evolution are organized into one chain

Spectra is not:

- a traditional monolith that owns all product truth
- the formal knowledge-state owner
- the place where the six authorities should be re-described as local modules

### 3.2 Ourograph

`Ourograph` is:

- the formal knowledge-state core
- the knowledge-base semantics core
- the authority for `Project / Reference / Version / Artifact / CandidateChange / Member`

`Spectra` uses `Ourograph`; it does not own formal knowledge-state truth itself.

Later commercial writing should therefore present:

- `Spectra` as the working shell, workspace, and orchestration surface
- `Ourograph` as the formal knowledge-state core
- the library/space model as the ontology
- exported results as on-demand externalizations of the space rather than the space itself

Do not write:

- that Spectra is the knowledge-base core
- that Ourograph is just an internal Spectra service
- that the knowledge-state ontology lives mainly in Spectra backend

### 3.3 Six-service positioning

Keep these roles stable in later writing:

- `Diego`: AI PPT/courseware generation core
- `Pagevra`: render / preview / export core
- `Ourograph`: formal knowledge-state core
- `Dualweave`: ingest / delivery technical foundation
- `Stratumind`: retrieval / RAG technical core
- `Limora`: identity / session / organization membership authority

## 4. Disclosure Boundaries

### 4.1 Dualweave

`Dualweave` is a core innovation and should be treated with low disclosure.

Allowed emphasis:

- why it matters
- what system problem it solves
- its system position
- its engineering strength
- the value of its ingest/delivery abstraction
- observable results and reliability language

Do not disclose deeply:

- patent-sensitive core mechanisms
- key implementation tricks
- critical parameters and strategy details
- writeups that make direct imitation too easy

### 4.2 Ourograph

`Ourograph` should also use a controlled disclosure strategy.

Allowed emphasis:

- why formal knowledge-state matters
- why library semantics are the real core
- why `Project / Reference / Version / Artifact / CandidateChange / Member` form a powerful ontology
- why this architecture is elegant and extensible
- why Spectra is stronger because formal state is externalized

Do not disclose too deeply:

- the full formal kernel design in a way that can be trivially copied
- highly operational internal design tricks
- unnecessarily explicit replication guidance

### 4.3 Other services

These can be described more openly, while still avoiding needless leakage:

- `Stratumind`
  - can use benchmark / report / recommendation material as evidence of strength
- `Diego`
  - can highlight its generation flow, event model, quality gate, and artifact flow
- `Pagevra`
  - can highlight render / preview / export and service boundary clarity
- `Limora`
  - can highlight identity authority, session authority, organization/membership semantics

General rule:

- make readers impressed
- make the architecture legible
- do not turn the document into a blueprint for copying everything directly

Evidence discipline rule:

- “strong claim” requires current formal evidence
- “interesting experiment” must be labeled as supplementary
- never mix old experimental numbers with current formal benchmark numbers inside
  the same headline conclusion

## 5. Teacher Feedback Turned Into Hard Constraints

Teacher feedback must be treated as writing constraints, not optional suggestions.

### 5.1 Must show concrete results

The document must clearly show:

- what was built
- what it looks like
- what workflow it enables
- what effect it achieves

Do not write only abstract architecture or conceptual claims.

### 5.2 Must add much more visual expression

The document should include many more diagrams and figure-supported explanations.

At minimum, later formal drafts should include:

- overall architecture diagram
- six-service boundary diagram
- key object / ontology relation diagram
- main pipeline flow diagrams
- selected real system screenshots or artifact/result views

### 5.3 Technology must be tied to function

Do not stack technologies as a raw list.

Preferred pattern:

- to achieve `xx` function, we used `yy` technology

Every technical subsection should tie software function to software technology.

### 5.4 Key technology chapter must be grouped

The key-technology section must not be overly fragmented.

Preferred structure:

- what key problem needed to be solved
- what technical idea addressed it
- what core mechanism or algorithm made it work
- what result or effect it produced

### 5.5 Formatting matters

Future drafts must pay attention to:

- heading hierarchy
- indentation
- spacing
- figure captions
- table captions
- numbering

## 6. How To Use Existing Materials

### 6.1 `docs_output/Spectra.docx`

Treat [docs_output/Spectra.docx](/Users/ln1/Projects/Spectra/docs_output/Spectra.docx) as:

- a legacy competition-document skeleton
- a source of reusable business and narrative material

Do not treat it as a technical source of truth.

### 6.2 What can be reused

Potentially reusable:

- directory / chapter skeleton
- project background
- project goals
- creative description
- business value sections
- market / business / risk sections

### 6.3 What must be rewritten

Rewrite by default:

- system design technical body
- key technology technical body
- any section that may embed old architecture or old chains
- any section that makes Spectra look like a single all-owning backend

## 7. Competition Writing Workflow

### 7.1 Markdown-first, DOCX-second

The competition document should be produced in two stages:

1. Markdown drafting in `docs/competition/*`
2. final DOCX packaging after structure and content stabilize

Rules:

- do not do heavy structural rewriting directly in Word
- treat `docs_output/Spectra.docx` as a skeleton/material source only
- use Markdown as the real production surface

### 7.2 Chapter truth-check before drafting

Before drafting each core chapter, perform a small truth-check using:

1. canonical Spectra docs
2. live code and focused tests
3. current service README/docs
4. philosophy and ontology sources where relevant

Every core chapter should answer:

- what are the 5 to 10 facts this chapter depends on?
- are those facts still true in current code and runtime reality?
- which old descriptions are polished but stale?
- which conclusions need code/test evidence rather than inherited wording?

### 7.3 Recommended chapter production order

Write in this order:

1. `01-overview`
2. `04-architecture`
3. `05-key-technologies`
4. `06-testing-evaluation`
5. `03-requirements-analysis`
6. `02-feasibility`
7. `07-organization-business`
8. `08-requirements-coverage`
9. `09-submission-manuscript`
10. `10-submission-master`
11. `11-final-submission-draft`
12. `99-self-review`

Reason:

- architecture-sensitive chapters must become true before packaging chapters
- business and submission polish should not harden stale system stories

### 7.4 Diagram-first expectation

The final competition draft should be figure-heavy.

At minimum, plan for:

- overall system architecture diagram
- six-service boundary diagram
- Spectra control-plane / orchestration-kernel diagram
- `Project / Session / Artifact / Version / Reference / CandidateChange` relation diagram
- upload / parse / index / retrieval flow diagram
- Session -> Diego -> Pagevra -> Ourograph generation-closure diagram
- knowledge return / version evolution diagram

Each diagram must match current system truth rather than historical structure.

## 8. Writing Style Rules For Later Drafts

Use this order whenever possible:

1. problem
2. system
3. function
4. technology
5. effect

And at system level:

1. ontology and object relationships
2. system layering
3. microservice partitioning
4. core workflow
5. technical realization
6. outcome and value

Important style rules:

- all six microservices should be presented as strong highlights
- the writing should stay aligned with Spectra philosophy, not become a generic software brochure
- `Ourograph` and `Dualweave` should use “interesting but controlled” disclosure
- every major technical claim should ideally be supported by a diagram, flow, object graph, architecture map, or evidence artifact
- use `problem -> system -> function -> technology -> effect`
- tie each technology choice to a concrete software function
- prefer current architecture truth over inherited competition phrasing

## 9. Immediate Working Reminders

Before writing major formal drafts:

- read this file first
- read [docs/competition/00-writing-guide.md](/Users/ln1/Projects/Spectra/docs/competition/00-writing-guide.md)
- read [docs/competition/00-truth-check-checklist.md](/Users/ln1/Projects/Spectra/docs/competition/00-truth-check-checklist.md)
- verify later claims against canonical docs and live architecture reality
- keep `Spectra` and `Ourograph` roles sharply separated
- do not over-disclose `Dualweave`
- do not over-disclose `Ourograph`
- use `Stratumind` benchmarks/reports as proof material when useful
- prefer rewriting technical sections from scratch over patching old garbage paragraphs
