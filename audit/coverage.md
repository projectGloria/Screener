# Coverage ledger — 2026-09-06

Scope: 17 original files. All 14 text files read; three icons metadata-checked. Eight logical paths statically traced (listed in report section 3), five with focused runtime checks. Enumeration is not review. REVIEWED means the named planned scope was inspected with the stated methods; it does not certify defect absence. All finding IDs are OPEN. No original application file was edited.

Pass history: initial inventory and 37 pending rows → complete source/consumer tracing → existing tests and five adversarial reproductions → disconfirmation, source anchors, coverage limitations and roadmap. Scope hashes are in reviewed-files-sha256.json. The report is the single source of full finding records.

Methods: S = complete static read and cross-file tracing; T1 = node tests/capture-sticky.cjs (exit 0); T2 = node tests/exports.cjs (exit 0); T3 = node audit/verify.cjs (exit 0, asserts current defects); C = node --check on seven application JS files (all passed); I = skill inventory.py (17 files, no skips/errors); W = dated primary-source web lookups described in report. Commands/environment are in report section 4. No project build/lint/typecheck configuration exists.

| # | Phase / domain | Subsystems / inspected paths or symbols | Status | Methods and outcomes | Remaining scope / next verification | IDs |
|---|---|---|---|---|---|---|
| 1 | Repository reconnaissance | Root, manifest, ancestors, tests | REVIEWED | I, S; no Git or local AGENTS; tools identified | No source inspection remainder; preserve hash snapshot for later comparison | — |
| 2 | Repository inventory | All 17 original files including icons | REVIEWED | I and hidden-directory listing; 14 text reads, 3 PNG metadata checks | Visual icon design excluded as nonfunctional artwork; audit artifacts outside application | — |
| 3 | Architecture reconstruction | All 7 JS files, 2 HTML, manifest, CSS, tests | REVIEWED | S; 8 critical-path groups reconstructed in report | Runtime certification belongs to rows 4/20/30 | F-001–005 |
| 4 | Existing verification | tests/*.cjs and 7 application JS files | PARTIAL | T1/T2/C pass; scripts inspected before execution | Actual extension integration absent; add disposable installed-extension run; no build/lint/typecheck tasks to run | — |
| 5 | Correctness | targetInfo, normalizeFrameInfo, captureFull, exportCapture | REVIEWED | S, T1/T2/T3; geometry and growth contracts validated | Proposed regression cases accompany each finding; broader browser matrix row 30 | F-001–003 |
| 6 | State/data flow | session, job, status, captures, preview controls | REVIEWED | S, T2/T3; ownership, transformations, reads/writes traced | Implement job-owned cancellation and explicit coordinate metadata; failure stress rows 12/14 | F-001–005 |
| 7 | Async/concurrency | prepare/move/cancel/finish and all await points | NEEDS VERIFICATION | S, T3; stalled wait and encode-cancel interleavings reproduced | Forced worker termination and stale continuation/new-session stress need real extension test | F-004, F-005 |
| 8 | Security | manifest; worker/page sender guards; rendering/network sinks | NEEDS VERIFICATION | S, rg sink/caller search; no confirmed exploit; static sender boundary traced | Verify real sender metadata and permission denials in loaded extension | F-004 |
| 9 | Dependency/supply chain | Imports, tests require calls, absent manifests/locks | PARTIAL | S; no runtime third-party graph; installed test versions observed | Need project-owned pinned graph, transitive integrity/provenance and advisory checks | — |
| 10 | Performance | DOM traversals, scan/dedup loops, tile plan, storage cursor, export | NEEDS VERIFICATION | S; complexity and allocation arithmetic documented, no fabricated benchmarks | Profile large DOM/images, 80M-pixel boundary and many captures in disposable profile | — |
| 11 | Memory/resources | bitmaps, canvas/blob URLs, DB connections, listeners, timers, preloads | NEEDS VERIFICATION | S, T1/T2/T3; bitmap/DB finally paths, restoration and stall examined | Measure repeated-capture/export retention and worker-loss restoration | F-004 |
| 12 | Reliability/resilience | run finally, watchdog, prepare, restoreOuterFixed, get/save | NEEDS VERIFICATION | S, T3; unbounded preparation and cancellation proven | Inject worker loss, IPC disconnect, slow decode and storage failures | F-004, F-005 |
| 13 | API / IPC | All worker message types and page-helper actions | REVIEWED | S; producers, guards, consumers and result shapes reconciled; T3 frame mismatch | Fix shared response schema; real transport matrix tracked in row 8 | F-002, F-004 |
| 14 | Database/persistence | database.js and save/load callers | NEEDS VERIFICATION | S, T2; v1 schema, transaction completion, close and opportunistic expiry read | Quota/abort and exact 24h age-boundary tests; persistence across browser restart | — |
| 15 | Error handling | All catch/finally paths across 7 JS files | REVIEWED | S, T1/T2/T3; conversion recovery and incomplete cancellation traced | Fix pending-wait propagation; proposed storage failures row 14 | F-004, F-005 |
| 16 | Logging/observability | update/status, popup refresh, preview status | REVIEWED | S; user-facing errors, badge and in-memory status traced; no telemetry | No production log system applies; consider diagnostic context without page content | — |
| 17 | Configuration | manifest.json; test env vars; CSS/media rules | REVIEWED | S; permission and path references consistent; icons verified | Browser minimum behavior explicitly pending in row 30 | — |
| 18 | Build/toolchain | Raw ESM extension, CJS tests, no build config | REVIEWED | S, C, T1/T2; actual Node/browser versions recorded | No build stage; establish reproducible development dependencies | — |
| 19 | CI/CD | Entire root and hidden inventory | N/A | I/S; no CI/CD definitions, scripts or release automation supplied | Future release gate recommendation in report; deployed pipeline is outside supplied scope | — |
| 20 | Deployment/readiness | Manifest, worker lifecycle, preview/storage | NEEDS VERIFICATION | S; source-level MAJOR WORK REQUIRED; no installed extension run | Load disposable extension; verify upgrade, worker lifecycle and supported browsers | F-001–005 |
| 21 | Testing quality | Both test files and assertions | REVIEWED | S, T1/T2; pixel-reference strength and mocked integration gaps documented | Roadmap lists independent extension, PDF, storage, input and geometry tests | F-001–005 |
| 22 | Type safety | Plain JS, message/result fields and DOM lookups | REVIEWED | S, C, T3; no TS compiler/config applies; protocol mismatch confirmed | Encode runtime coordinate-space schema; avoid unsupported TypeScript requirements | F-002 |
| 23 | Maintainability | Cross-module geometry/state contracts; content helper responsibilities | REVIEWED | S; concrete change coupling and remediation scope documented | Address contracts instead of broad rewrite | F-001–005 |
| 24 | Dead/redundant code | cropRect, scrollTarget, select IPC, captureTarget | REVIEWED | S, reverse rg searches; registered handlers distinguished from absent callers | Decide retained interface intent before removal; no defect count for unused helpers | — |
| 25 | Frontend | popup/preview JS+HTML; both CSS files | PARTIAL | S, T2; preview downloads/errors exercised | Popup integration, clipboard, zoom and responsive rendering need browser interactions | F-005 |
| 26 | UX robustness | Busy/ready/error states, cancel, disabled controls, preview expiry | PARTIAL | S, T2/T3; export recovery tested, cancellation defect proven | Real popup reload/status, keyboard cancel and unavailable-capture states | F-004, F-005 |
| 27 | Accessibility | HTML native controls/status/alt/lang; CSS focus/reflow | PARTIAL | S; native semantics and focus rules present | Actual keyboard, assistive technology, computed contrast and zoom/reflow checks pending; no conformance assertion | — |
| 28 | Internationalization | lang=en; title/filename sanitization, dimensions/date formatting | PARTIAL | S; English UI; Unicode property filtering; local numbers/UTC filename | RTL page capture and Unicode edge filenames need runtime cases; no localization requirement supplied | — |
| 29 | Privacy/data handling | saveCapture/getCapture, blob download, clipboard, lazy loads | REVIEWED | S, T2; local storage/data path and accurate opportunistic retention text | No legal-compliance claim; quota/deletion tests row 14; user-triggered clipboard row 25 | — |
| 30 | Framework/runtime | MV3 worker + browser DOM; Node only in tests | NEEDS VERIFICATION | S, C, W, T1/T2/T3 on Chrome 152.0.7977.76 | Chrome 109/current/Brave installed-extension matrix and worker termination; React/Electron/TS N/A | — |
| 31 | Dependency currency | External Playwright 1.62.1, Sharp 0.35.4; browser minimum | PARTIAL | W; authoritative sources consulted, npm endpoint failures, stale/mixed indexed release results | Exact latest/advisory/transitive status unverified; establish locked graph then check primary advisories | — |
| 32 | Documentation | All comments, inline UI claims, manifest; README absent | REVIEWED | S; setup/retention/features compared; obsolete smaller-area guidance noted | Add setup/test/support docs; no standalone documentation was omitted | — |
| 33 | Developer experience | tests env vars, missing dependency manifest, run commands | REVIEWED | S, T1/T2; successful commands and environment recorded | Pin test tools and document browser path; no application dependency install performed | — |
| 34 | Cross-file analysis | All eight report paths and shared protocols | REVIEWED | S, T1/T2/T3; five validated failures, consumers and guards checked | Reconcile contracts again after remediation | F-001–005 |
| 35 | Adversarial second pass | Narrow host, iframe offset, growth, nonsettling image, encode cancellation | PARTIAL | T3 exit 0; all five broken contracts reproduced | Multiple/hidden/cross-origin frames, real navigation/worker races, storage failure remain | F-001–005 |
| 36 | Findings validation | F-001–005 anchors, callers, guards, test blind spots | REVIEWED | T3 + S; complete finding records; confirmed component evidence separated from inference | Proposed post-fix checks in report; no provisional issue added to defect count | F-001–005 |
| 37 | Remediation roadmap | Capture, geometry, UI, QA/release | REVIEWED | Ordered priorities, dependencies, owner roles, acceptance checks in report | Review-only complete; application remediation requires user request | F-001–005 |

## Subsystem disposition

| Subsystem | Status | Depth / methods | Exact outstanding scope |
|---|---|---|---|
| Capture orchestration and geometry | NEEDS VERIFICATION | Complete S; actual geometry response/worker function repros T3 | Real captureVisibleTab integration, browser lifecycle, broader frame/zoom matrix |
| Page helper and DOM mutation | NEEDS VERIFICATION | Complete S; sticky pixels/restoration T1; adversarial T3 | Network deadlines in actual extension, closed-shadow/complex nested/RTL pages, stress and worker loss |
| Storage | NEEDS VERIFICATION | Complete S; save/read via T2 | Expiry boundary, quota/transaction abort, browser restart |
| Export engine | PARTIAL | Complete S; PNG/JPG/WebP metadata and failure T2; PDF byte layout static | Independent PDF parse/render and near-limit resource test |
| Popup and preview UX | PARTIAL | Complete S; preview download T2 | Real popup messaging, clipboard, zoom, keyboard/assistive and reflow |
| Packaging/configuration | NEEDS VERIFICATION | Complete S, C, icon metadata | Installed package, supported minimum/current browser and release evidence |
| Test/development tooling | PARTIAL | Both tests fully read and run; commands reproducible in supplied runtime | No project-owned lock/provenance; latest/advisory check incomplete |

## File/path dispositions

| Original path | Disposition | Evidence / linked findings |
|---|---|---|
| background.js | inspected; traced | Complete read, C, T2 finish, T3 normalization/finalization; F-001–005 |
| content.js | inspected; traced | Complete read, C, T1, T3; F-001–004 |
| geometry.js | inspected; traced | Complete read, C, T1 positions, capture/export consumers; F-001/F-003 callers |
| database.js | inspected; traced | Complete read, C, T2 save/read; pending failure/expiry checks |
| export.js | inspected; traced | Complete read, C, T2 four formats; PDF rendering pending |
| popup.js | inspected; traced | Complete read, C; start/status/cancel and control states; F-005 |
| preview.js | inspected; traced | Complete read, C, T2; clipboard/zoom static only |
| popup.html | inspected; traced | Complete read; DOM IDs, scripts/styles, native semantics |
| preview.html | inspected; traced | Complete read, T2 serving; retention text and DOM consumers |
| styles.css | inspected; traced | Complete read, paired markup/classes/focus/media rules; no visual conformance test |
| progress.css | inspected; traced | Complete read; popup progress DOM/styles; reduced-motion check not run |
| manifest.json | inspected; traced | Complete read; permissions, worker/module and assets; minimum-version runtime pending |
| tests/capture-sticky.cjs | inspected; executed | Full code/assertion/hook read; T1 exit 0 |
| tests/exports.cjs | inspected; executed | Full local server/download/cleanup read; T2 exit 0 |
| icons/16.png | inspected metadata | Sharp PNG 16×16; artwork pixels excluded |
| icons/48.png | inspected metadata | Sharp PNG 48×48; artwork pixels excluded |
| icons/128.png | inspected metadata | Sharp PNG 128×128; artwork pixels excluded |
| audit/ | excluded from application scope | New review-only artifacts; not part of original 17-file inventory |

No file is pending a static text read. Operational/UI/runtime checks remain exactly as recorded above. Server authentication, SQL/ORM, containers, React, Electron and multi-tenant service lenses are N/A because the supplied application contains none of these systems. IndexedDB and worker/security lenses remain applicable and were reviewed.
