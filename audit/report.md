# Screener repository audit

## 1. Executive Summary

Reviewed on 2026-09-06. Five confirmed, open defects: one HIGH/P1 and four MEDIUM/P2. No confirmed critical security issue. The main risks are stalled capture jobs, incorrect nested-container/frame geometry, incomplete captures of growing pages, and cancellation after the last tile.

Both existing test suites passed. The additional audit harness reproduced all five findings at the relevant browser/helper or worker-function boundary. These are component-level reproductions, not a test of an installed extension from popup through `captureVisibleTab` to preview. Application code and configuration were not changed.

Source-level readiness assessment: **MAJOR WORK REQUIRED** for robust capture across the page types the implementation attempts to support. This does not attest to deployed behavior. Actual extension installation, worker termination, supported-browser compatibility, and assistive technology checks remain unverified.

## 2. Architecture Summary

| Subsystem | Implementation | Responsibility / boundary |
|---|---|---|
| Extension configuration | manifest.json | Manifest V3 module worker; minimum Chrome 109; activeTab, scripting, webNavigation and all-URL host access |
| Popup | popup.html, popup.js, styles.css, progress.css | Start/cancel/status messages; status polling every 800 ms |
| Capture orchestration | background.js, geometry.js | One in-memory job; frame discovery/injection/selection; visible-tab screenshots; tile stitching and size limits |
| Page helper | content.js | Measures and scrolls page or nested container; changes sticky/fixed CSS and image loading; restores changes |
| Persistence | database.js | IndexedDB v1 captures store; save and expiry cleanup in one transaction; preview lookup |
| Preview/export | preview.html, preview.js, export.js | Local blob display; PNG/JPEG/WebP/PDF downloads; clipboard and zoom |
| Verification | tests/*.cjs | Browser helper pixel comparison; HTTP-served preview/export checks; mocked worker completion |

Critical flow: popup start → sender validation → active tab → injected frame helpers → measure/select → prepare → move/capture/stitch → restore → PNG encode → IndexedDB commit → preview tab → user-triggered export. Cancellation and exceptions cross the worker/helper boundary; there is no shared abort signal or session token. Page content and layout are untrusted inputs. Captured pixels and the page title remain in local IndexedDB; no application upload or analytics endpoint was found.

## 3. Repository Scope

- Root: `C:\Users\Nihil\Desktop\projectGloria\screener`.
- Revision: unavailable. `git status --short` returned “not a git repository”; no Git metadata or commit history was available. Existing files were preserved. Reviewed file hashes are in `reviewed-files-sha256.json`.
- Inventory: 17 original files, with no helper-reported skips/errors. All 14 text files were read and analyzed. Three PNG assets were checked with Sharp for type and dimensions; artwork was not visually assessed.
- No AGENTS.md was found in the root, subtree, or inspected ancestor locations. The explicitly requested full-codebase-review skill governed the audit.
- No package manifest/lock, build scripts, CI, deployment workflow, README, backend server, vendored dependencies, generated application code, or infrastructure files are present. `audit/` contains new review artifacts and is excluded from the original application inventory.
- Eight logical paths were statically traced: start/status, frame selection, tile capture, cancellation/restoration, save/load/expiry, export/download, clipboard, and zoom. Five of these groups received focused runtime coverage; start/status, clipboard, and zoom remain static-only. File reading is not equated with runtime coverage.
- Environment: Windows/PowerShell; Node 24.19.0; externally supplied Playwright 1.62.1 and Sharp 0.35.4; headless Chrome 152.0.7977.76. No packages were installed or upgraded.

## 4. Coverage Ledger

The complete 37-phase ledger, subsystem coverage, file dispositions, methods, findings, and next checks are in [coverage.md](coverage.md). All original source was inspected, but browser integration, stress, accessibility, and dependency provenance checks remain PARTIAL or NEEDS VERIFICATION. No parent domain is labeled REVIEWED where its declared children remain incomplete.

Actual verification, from the repository root:

```powershell
$env:NODE_PATH='C:\Users\Nihil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:SCREENER_CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests\capture-sticky.cjs
node tests\exports.cjs
node audit\verify.cjs
```

All three exited 0. `capture-sticky` passed document and full-viewport nested-scroller pixel equality, shadow sticky content, normal headings, restoration and cancellation. `exports` passed four user-triggered formats, no automatic download, and conversion failure recovery. PDF validation in that suite checks the file header only; it does not render or parse the PDF. The audit harness passed five assertions reproducing the defects below. Seven application `.js` files passed `node --check`. PNG metadata matched 16×16, 48×48, and 128×128 manifest references. No project lint/typecheck/build command exists.

One initial environment query failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` when reading `sharp/package.json`; the supported `sharp.versions.sharp` API then returned 0.35.4. This was a tooling query failure, not an application failure. Export test files were written to the test's default temporary QA directory; browser state was disposable.

## 5. Critical Findings

No confirmed CRITICAL/P0 findings within inspected scope. This is not a security certification.

## 6. High-Priority Findings

### F-004 — Resource preparation can stall without a watchdog or effective cancellation

- **Severity / priority:** HIGH / P1 High priority
- **Category:** Reliability, cancellation, resource ownership
- **File / anchor:** `content.js:152` (`preloadBackgrounds`), `content.js:347` (`prepare`)
- **Confidence / status:** Confirmed / OPEN
- **Problem:** Background image preloads are awaited without a deadline. The session watchdog is installed only after that await. `cancel` restores the DOM but does not settle the pending preparation promise, so the worker remains waiting for its original message response.
- **Evidence:** In `audit/verify.cjs`, a synthetic `Image` that never calls load/error leaves `prepare` pending with the injected animation-disabling style active and no 15,000 ms timer registered. Calling `cancel` does not settle the original promise. Worker `captureFull` awaits that promise; `run` clears `job` only after completion/error. This is a deterministic simulation of a non-settling resource, not a measured live-network timeout.
- **Why it matters:** A page resource can prevent the sole capture job from finishing and block subsequent captures. Without cancellation, page styles can remain modified while the resource is pending. Browser worker shutdown is not reliable application cleanup.
- **Realistic failure scenario:** A page has a CSS background whose response stalls. Start capture; preparation changes styles and waits. Cancel restores styles but capture status can remain busy until the resource settles or the worker is restarted. If the worker disappears first, no preparation watchdog restores the remaining page mutations.
- **Root cause:** No bounded resource/IPC wait or abort ownership; the cleanup timer starts too late. Visible-image `decode()` waits have a related unbounded-wait pattern.
- **Recommended fix:** Create a session-owned cancellation signal and deadline before any await. Bound preload/decode and worker IPC waits; cancel should terminate pending waits and release the job. Keep a local session reference and reject stale continuations before applying changes after an await. Give outer-frame mutations their own cleanup guarantee.
- **Verification method:** Performed deterministic never-settling background and cancellation assertions. Proposed regression: stalled background and visible image, cancellation during prepare and move, and immediate subsequent capture; all must settle within a documented bound and restore styles/listeners without an old continuation affecting the new session.
- **Related locations:** `content.js:160`, `content.js:183`, `content.js:262`, `content.js:323`, `background.js:93`, `background.js:182`, `background.js:197`.

## 7. Medium-Priority Findings

### F-001 — Nested containers inherit outer-page dimensions they cannot scroll

- **Severity / priority:** MEDIUM / P2 Important
- **Category:** Capture correctness, geometry contract
- **File / anchor:** `content.js:52` (`targetInfo`); also `content.js:421`
- **Confidence / status:** Confirmed / OPEN
- **Problem:** Selecting a nested host replaces the viewport with the host's dimensions but retains the maximum of the outer document and host content dimensions. Tile positions can exceed the host's actual scroll range.
- **Evidence:** A 600×400 host with 1,600 px of content in a 1,000×600 browser reports `width=1000`, `viewportWidth=600`. A requested x=400 returns x=0. `background.js:116` then rejects the capture because the scroll position differs by more than two pixels. The existing test uses a full-width host and does not expose this mismatch.
- **Why it matters:** Ordinary centered or split-pane scrolling content cannot be captured even though the host is scrollable and within size limits.
- **Realistic failure scenario:** Capture a viewer with a 600 px content pane and a surrounding sidebar. The worker generates two horizontal columns, and aborts when the pane cannot scroll to the second one.
- **Root cause:** Mixing outer-document extents with host-local viewport and scroll coordinates.
- **Recommended fix:** For a selected nested host, derive both output extents and viewport from that host, consistently in prepare and move. Treat outer chrome inclusion as an explicit separate composition policy.
- **Verification method:** Browser reproduction performed, including actual scroll clamping. Proposed regression: pixel comparison for a narrower host, padded/bordered host, and a host shorter than the outer viewport; capture must finish without inaccessible tiles.
- **Related locations:** `content.js:45`, `content.js:329`, `background.js:96`, `background.js:116`, `tests/capture-sticky.cjs`.

### F-002 — Same-origin iframe offsets are applied twice after move

- **Severity / priority:** MEDIUM / P2 Important
- **Category:** IPC geometry contract, image correctness
- **File / anchor:** `content.js:426` (move response), `background.js:61` (`normalizeFrameInfo`)
- **Confidence / status:** Confirmed / OPEN
- **Problem:** Prepare/measure expose `frameKnown=true` when the rectangle is already in outer-page coordinates. Move returns the same rectangle but drops `frameKnown` and `frameUrl`; the normalizer interprets it as a local rectangle and adds the frame offset again when a frame-map entry is selected.
- **Evidence:** A real same-origin iframe at (100,80) produces a prepared rectangle at (100,80). Feeding its actual move response through the production normalizer with a single frame-map entry changes the rectangle to (200,160). Worker tile extraction uses that incorrect origin.
- **Why it matters:** Captures of offset embedded documents omit their left/top content and include unrelated pixels, or clip at the window boundary.
- **Realistic failure scenario:** A same-origin document viewer appears below an 80 px toolbar and 100 px from the left. The selected frame's first tile is cropped an additional 100/80 px into its content.
- **Root cause:** Inconsistent coordinate-space metadata across measure, prepare, and move IPC responses.
- **Recommended fix:** Define one coordinate-space contract. Preserve frame identity and whether offsets have already been applied in every response, or centralize all conversion in the worker. Avoid URL/fallback guessing where an explicit frame ID mapping can be used.
- **Verification method:** Actual frame-helper result plus production normalizer reproduction performed. Proposed regression: pixel comparisons for offset same-origin, cross-origin, and multiple-frame pages across all tiles; no double conversion.
- **Related locations:** `content.js:31`, `content.js:50`, `content.js:64`, `content.js:343`, `background.js:59`, `background.js:113`, `background.js:122`.

### F-003 — Growing pages are silently saved at their original height

- **Severity / priority:** MEDIUM / P2 Important
- **Category:** Data completeness, lazy-content handling
- **File / anchor:** `background.js:98` (fixed tile plan), `background.js:127` (fixed canvas dimensions)
- **Confidence / status:** Confirmed / OPEN
- **Problem:** The worker computes all tile positions and output dimensions from prepare. Move measures and returns updated document dimensions, but the worker checks only viewport dimensions and scroll coordinates. Page growth is ignored.
- **Evidence:** The browser harness prepares a 1,200 px page, then grows it to 2,400 px; move correctly returns 2,400. Static producer/consumer tracing shows that `ys`, `total`, and canvas height remain based on 1,200, followed by successful `finish`. The harness verifies the changing input contract; final truncated image dimensions follow from the fixed plan/allocation, not an installed-extension image comparison.
- **Why it matters:** A preview labeled “Full page” can omit later content with no warning.
- **Realistic failure scenario:** An image without reserved dimensions finishes loading or a scroll-triggered component expands after prepare. Content below the original bottom is never scheduled for capture.
- **Root cause:** A one-time layout snapshot is used despite explicitly activating asynchronous lazy content during each move.
- **Recommended fix:** Stabilize layout before planning, or safely extend/restart the capture when measured dimensions change. Reapply pixel/tile limits during growth and bound infinite-scroll behavior. If growth cannot be captured, show an explicit incomplete-capture error instead of success.
- **Verification method:** Browser dimension change and static full worker trace performed. Proposed regression: scroll-triggered height growth and delayed image layout; compare final pixels/dimensions to the stabilized page and enforce size limits on repeated growth.
- **Related locations:** `content.js:346`, `content.js:399`, `content.js:419`, `background.js:95`, `background.js:115`, `background.js:153`.

### F-005 — Cancellation during final encoding still saves and opens a preview

- **Severity / priority:** MEDIUM / P2 Important
- **Category:** Cancellation, user-visible state
- **File / anchor:** `background.js:31` (`finish`)
- **Confidence / status:** Confirmed / OPEN
- **Problem:** Cancellation is checked while taking tiles, but not after final encoding or before saving/opening the preview. The popup still presents Cancel while finish is busy.
- **Evidence:** The worker-function harness pauses `convertToBlob`, sets the current job's `cancelled` flag, then resolves conversion. `saveCapture` and `tabs.create` each execute once despite cancellation.
- **Why it matters:** Cancel can produce a persisted screenshot and open a new tab anyway, especially for large images with slower encoding/storage.
- **Realistic failure scenario:** After the last tile, click Cancel while the status says “Preparing your preview…”. The image is still stored and the preview takes focus.
- **Root cause:** The finalization path does not participate in job cancellation and has no explicit commit boundary.
- **Recommended fix:** Pass the specific job/signal to finish and check it after encoding and before persistence/preview creation. Define cancellation behavior during a database commit; disable or relabel cancellation once it can no longer be honored, or clean up the canceled record.
- **Verification method:** Deterministic paused-encoding interleaving performed. Proposed regression: cancel during encoding, during save, and immediately before preview creation; no post-cancel preview should appear, and retention behavior must match the chosen commit policy.
- **Related locations:** `background.js:16`, `background.js:153`, `background.js:197`, `popup.js:10`, `popup.js:27`.

## 8. Lower-Priority Improvements

No additional confirmed P3 defect is counted. Setup documentation, a pinned test dependency manifest, CI, and cleanup of obsolete selection-related messages are sensible follow-up work. `cropRect` and `scrollTarget` have no in-repository callers; selection IPC and the non-frameOnly branch remain registered but unused by the shipping popup/worker flow. Remove them only after deciding whether they are retained interfaces.

## 9. Security Assessment

No reachable exfiltration, dynamic script injection, or privileged external-message exploit was confirmed. The worker checks the extension sender ID and popup URL/origin; the page helper checks sender ID and message target. The HTML-string sink is a fixed selection template. Capture titles reach `textContent`, and download filenames remove unsafe characters. No remote executable scripts, credential handling, authentication server, shell execution, or public application server exists in the shipped files.

All-URL host permission is powerful and used for frame injection; reducing it requires explicit cross-origin-frame product decisions. Do not remove it blindly. Host permissions and activeTab have distinct capabilities, as described by the [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs). These controls were reviewed statically; installed-extension messaging isolation and permission-denial scenarios were not exercised.

F-004 is an availability issue on untrusted pages. Stored screenshot pixels can contain sensitive information. The UI accurately says cleanup occurs after 24 hours **when the next capture is made**; this is not automatic expiry. There is no delete/history UI or count/byte cap. No contrary retention promise was found, so this was not counted as a separate privacy defect. Full quota exhaustion and deletion behavior need testing.

## 10. Performance Assessment

The worker limits each side to 30,000 px, area to 80 million pixels, and the plan to 100 tiles. It spaces capture attempts by at least 600 ms, consistent with the documented two-calls-per-second limit in the [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs). Tile image bitmaps are closed in finally blocks.

Static cost concerns: `scrollHost` deduplicates an entire DOM list with repeated `indexOf`, giving quadratic worst-case comparisons. Multiple whole-document traversals, computed-style reads, and image activation run per tile. `rememberAttribute`/`rememberStyle` also linearly search growing arrays. Preloading all images/backgrounds increases page/network work beyond the visible tile. No large-DOM latency or memory benchmark was performed, so no measured slowdown is claimed.

An 80-million-pixel RGBA surface alone is approximately 320 MB; encoding/export can add another canvas, decoded bitmap and compressed blobs. That is arithmetic on declared limits, not measured resident memory. IndexedDB expiry performs a value cursor scan on every save. Profile dense pages, large photos, many retained captures, and near-limit exports before choosing new limits or indexes.

## 11. Architecture/Maintainability Assessment

The separation among geometry, storage and exports is clear and compact. The main coupling is an implicit geometry/state protocol spread between `content.js` and `background.js`; F-001/F-002/F-003 are concrete consequences. A documented response schema with coordinate-space invariants would be more useful than a broad rewrite. Session-local references and explicit abort ownership address F-004/F-005.

Plain JavaScript is appropriate here, but current runtime checks do not encode the full message contract. No TypeScript, React, Electron, ORM or backend framework is present. The worker is a browser service worker, not a Node server; Node-specific checks apply only to tests.

## 12. Testing Assessment

Strengths: the sticky test compares every pixel against an independent static-page rendering, includes open shadow DOM, and checks CSS/scroll restoration. The export suite checks image types/dimensions, user-triggered downloads, and error recovery.

Blind spots: the sticky test reimplements stitching rather than invoking `captureFull`; the worker test invokes only `finish` with mocks. Neither loads the extension, verifies popup sender identity, calls real `captureVisibleTab`, or exercises worker suspension. The nested fixture fills the viewport, and no iframe fixture existed. PDF verification is only a magic header. There are no quota/transaction-abort, age-boundary, clipboard, accessibility, zoom/DPR, navigation-race, or concurrent cancellation tests.

The audit harness is intentionally a **defect reproduction** harness: its passing assertions mean the bugs remain present. After fixes, convert those cases into expected-behavior regression tests rather than retaining assertions that require broken behavior.

## 13. Dependency Assessment

No third-party runtime imports, package manifest, lockfile, lifecycle scripts, registry overrides, or vendored runtime libraries are in the application. Tests depend on externally available Playwright and Sharp. Installed review versions were observed; repository-declared, locked, and deployed versions do not exist or are unknown. No project-owned resolved transitive graph or integrity record is available to audit.

Currency lookups on 2026-09-06 consulted [Playwright's release notes](https://playwright.dev/docs/release-notes), the [maintainer release listing](https://github.com/microsoft/playwright/releases), and the [Sharp maintainer changelog](https://github.com/lovell/sharp/tree/main/docs/src/content/docs/changelog). npm registry latest endpoints failed through the web tool; indexed results varied in freshness. Latest-version and exact advisory status are therefore **unverified**, and no obsolete/vulnerable-package claim is made. A release should declare/pin test dependencies and audit the resulting graph against primary advisories.

## 14. Production Readiness

**MAJOR WORK REQUIRED**, scoped to source and local component tests. Fix the stalled-resource path and geometry/completeness errors before relying on arbitrary-page captures. Packaging is simple, but no reproducible test setup, release gate, supported-site matrix, upgrade/rollback documentation, or installed-extension test evidence exists.

The manifest allows Chrome 109. Chrome documents changes to API-based service-worker lifetime extension starting in 110, and warns that worker globals disappear on shutdown. See the [official lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). Long captures on the declared minimum and forced worker termination need real extension tests. No compatibility failure is counted without that evidence. Job/status globals and page-restoration ownership deserve special attention in those checks.

## 15. Remediation Roadmap

| Order | IDs / priority | Suggested owner | Acceptance check |
|---|---|---|---|
| 1 | F-004 / P1 | Capture/extension engineer | Stalled resources and cancellation settle within a bound; page restored; new capture starts; stale async work cannot affect it |
| 2 | F-001, F-002 / P2 | Capture/geometry engineer | Actual worker pixel tests for narrow hosts and offset frames; consistent coordinate-space contract |
| 3 | F-003 / P2 | Capture engineer | Growing-page capture is complete or explicitly rejected; dynamic growth respects limits |
| 4 | F-005 / P2 | Extension/UI engineer | Cancellation across encode/save/open respects a documented commit boundary |
| 5 | Verification gaps | QA/release owner | Installed-extension tests, minimum/current browser matrix, permission errors, quota/abort, PDF rendering, keyboard/assistive checks |

F-001/F-002 should establish the geometry contract before growth handling is extended. F-005 can share the cancellation mechanism from F-004. No effort estimate or remediation completion is implied.

## 16. Positive Findings

- Transaction completion is awaited before opening the preview; database connections close in finally blocks.
- Ordinary capture failures enter restoration finally blocks, and existing tests demonstrate exact sticky-style restoration on supported fixtures.
- Capture-size and tile-count guards bound planned output; each bitmap has a finally-based close path.
- PNG is reused without re-encoding; JPEG/PDF receive a white background; unsupported conversion types fail explicitly.
- Export failures restore enabled controls, as verified in the existing browser suite.
- Native buttons/select, visible focus rules, image alt text, document language, and live status regions exist. This is positive static evidence, not an accessibility-conformance claim.
- No application telemetry/upload path or automatic download was found; the export test verifies no automatic download in its mocked/local scenario.

## 17. Unverified Areas

No additional provisional defect is counted. The following are explicit missing checks, not claims that failures occur:

1. Load the actual extension in a disposable profile and test popup → worker → captureVisibleTab → IndexedDB → preview; test restricted pages, denied hosts, file access, tab/window navigation and worker shutdown. Browser APIs are mocked in existing tests.
2. Exercise Chrome 109, current Chrome, and intended Brave versions; multiple/nested/cross-origin or clipped frames, transforms, borders, zoom/DPR changes, horizontal and RTL scrolling. Existing runtime fixtures cover only the named cases.
3. Run bounded large-DOM/image/pixel-limit and retained-capture workloads; record latency and memory. Inject storage quota failure and transaction abort; verify cleanup and recovery.
4. Parse and render generated PDFs with an independent reader. Test clipboard access, actual-size keyboard scrolling, popup error states, narrow viewport reflow, contrast and screen-reader announcements.
5. Establish pinned test dependencies and audit exact transitive versions/provenance/advisories. No repository-owned graph exists; public lookup results do not substitute for one.
6. Verify packaged/released artifact contents, extension update behavior and release ownership. No deployed artifacts or release system were supplied.

These checks form the continuation plan. They do not require application refactoring to begin, and should use disposable local data rather than live sensitive pages.

## 18. Final Risk Summary

All original text files were inspected, and five defects were validated through browser/worker-component reproductions and cross-file tracing. The existing green tests cover useful narrow fixtures but miss the failing contracts. F-004 is the first repair priority, followed by geometry and completeness. Installed-extension, accessibility, performance and supply-chain evidence remains incomplete. No source changes were made and no finding is marked fixed.
