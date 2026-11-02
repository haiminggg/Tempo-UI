# Tempo UI redesign: implementation guide

This document explains what we are changing in the Tempo web platform and how to bring the new UI into the existing project. It is written for whoever does the work, including an AI coding assistant. Read all of it before changing any file.

## 1. What we are doing

We are replacing the look and the page structure of the Tempo web UI. **Only the UI changes.** The gateway's routes, the product backends, the pipeline, dispatch, configuration and access checks stay as they are.

This repository is a **working reference**, not code to drop in as is:

- It is plain HTML, CSS and JavaScript. No frameworks, no libraries, no build step, nothing loaded from the internet.
- It runs on a fake backend in the browser (`js/data.js`), so every screen and state can be tried without the real services.
- Run it with `python serve.py` and open http://127.0.0.1:5176. Any login works. Login ID `dev` shows the developer view. Adding `?demo=user` or `?demo=dev` to the URL skips sign-in.

The job is to rebuild these screens inside the existing gateway (Jinja2 templates plus static CSS and JS), wired to the real endpoints, so the platform looks and behaves like the reference.

## 2. The existing project, in short

From our project notes. **Check each point against the actual code before relying on it**, because the notes can be out of date.

- **Browser** gets Jinja2 pages, CSS and JS from the **UI gateway** (`app/`). The gateway handles login, sessions, the product selector and permission checks, and proxies to product backends through its backend client.
- **ELI backend** returns JSON and files only (no HTML). It takes one batch at a time and runs the generation pipeline.
- **TPN** has only a placeholder page so far. Its backend is being built separately.
- **Access** comes from the internal access systems. Users have view and upload permissions per product, enforced in the gateway and in the API routes.
- Records are purged at 21:00 every day.

## 3. Rules for this work

1. **UI only.** Do not change backend code, pipeline code, dispatch, access logic, authentication, sessions or API contracts. If the UI needs data the gateway does not provide yet, stop and ask; do not add or change endpoints on your own.
2. **Never touch** credentials, the UAT or production config files, group or user CSV files, or anything holding real user identifiers.
3. **Do not weaken security.** Keep CSRF and session handling exactly as they are. Do not disable TLS verification. Hiding something in the UI is not access control: the server-side permission checks stay and stay authoritative.
4. **No new dependencies.** No npm packages, no CDN links, no web fonts from the internet. The fonts in `fonts/` are bundled with the reference and can be copied into the gateway's static folder.
5. **Build pages safely.** Insert data as text, never with `innerHTML` or `|safe` on user or file data. File names come from uploads and must be treated as untrusted.
6. **Small steps.** One page or component per change, tested before moving on. Keep the old templates until the new page works (copy, do not overwrite). Never delete files without asking.
7. **Do not guess business rules.** Product names, stage names, output names, warning texts and anything about financial products come from the backend or the product owners. TPN stage and output names in the reference are placeholders.

## 4. What changes for people using it

### 4.1 Look

Apple-style frosted glass panels over a soft OCBC red and white background. One blue accent for actions, green, orange and red for status only. Satoshi font, falling back to the system font. No neon, glows or animated blobs. All values are in `css/tempo.css` under `:root`; reuse those variables, do not invent new colours.

### 4.2 Navigation

- The top bar has three tabs, **Products, Report, Templates**, centred in the bar. Brand on the left, account menu on the right.
- **Products are no longer tabs.** More products are coming, so the tabs must not grow with them.
- The **Products page** lists every product the user can see, with search, the last opened product first, and today's counts on each card. Products the user cannot open show as locked.
- On each product's desk, the **page title is a product switcher** (a dropdown), so people can jump between products without going back.
- The product list must come from the gateway's existing product configuration, not be hard-coded in templates. Adding a product to the platform should make it appear with no template edits.

### 4.3 Two audiences: users and developers

The desk looks different depending on who is signed in. **Users never see processing stages.**

| | User | Developer |
| --- | --- | --- |
| Batch row while running | "Processing" with a moving bar | Current stage, e.g. "Parse (3 of 6)", one tick per stage |
| Batch details | Status message, files, results, downloads | Stages with timings, full output file names, event log |
| Failures | Plain message on each file | Stage where it failed, plus the log |
| Products page | Description and counts | Also each product's stage list |
| Top bar | | "Developer" badge |

Who counts as a developer is decided by **the internal access systems**. The gateway already knows the user's access; it should pass one value to the templates and scripts (for example `is_developer`). The UI only reads that value. The "View as" switch in the reference account menu is a demo tool and **must not be ported**.

If the backend does not report per-stage progress yet, the developer view shows what is available and the gap is raised with the team. Do not fake stage progress in the real platform.

### 4.4 Pages

| Page | Reference code | Notes |
| --- | --- | --- |
| Sign in | `T.pages.signin` in `js/pages.js` | Keep the existing login form fields, CSRF token and error handling; restyle only |
| Products | `T.pages.products` | New page replacing the current product selector |
| Desk (per product) | `T.pages.desk` | Upload panel, batch list with filters, detail panel |
| Report | `T.pages.report` | Product switcher instead of tabs |
| Templates | `T.pages.templates` | Only for products that have templates and users allowed to manage them |

Shared pieces: top bar and account menu in `js/app.js`; icons, toasts, segmented control, product picker and polling in `js/ui.js`; animation helpers in `js/motion.js`.

## 5. How to port it

### 5.1 Files

1. Copy `css/tempo.css`, `fonts/`, `js/motion.js` and `js/ui.js` into the gateway's static folder.
2. Do **not** copy `js/data.js` as the data source. It is the fake backend. Use it only to see which fields each screen needs (section 6).
3. Make a new Jinja2 base template with the top bar, the centred tabs and the account menu (sign out and session info only, no demo switches). The current user, their products and the developer flag come from the gateway context.
4. Rebuild each page in order: base layout, Products, Desk, Report, Templates, Sign in. Each page can render its first state on the server and use the JS for live updates, or render fully in JS from gateway JSON. Follow whatever the existing templates do.

### 5.2 Replace the fake API

Every call to `T.api` in the reference becomes a call to an existing gateway endpoint. **Find the real routes in the gateway code**; the names below describe what each call does, not real URLs.

| Reference call | What it needs from the gateway |
| --- | --- |
| `T.api.list(product)` | Today's batches for a product, newest first (the existing records polling) |
| `T.api.create(product, files, user)` | The existing upload route for a new batch |
| `T.downloads.generated / uploaded / single` | The existing download routes |
| `T.api.templates()` and `replaceTemplate()` | The existing template list and upload routes |
| `T.session`, `T.can`, `T.isDev` | Values the gateway puts in the page context from the real session and access checks |

Keep the existing polling interval and the existing behaviour when a backend is unreachable (the reference shows the last good list with a notice and keeps retrying).

### 5.3 Motion

All animation is plain CSS and JS in `js/motion.js`:

- list rows slide into new positions (FLIP technique)
- numbers count up
- the Generate button leans toward the pointer
- the sign-in headline rises line by line
- the batch details grow out of the clicked row, using the browser's View Transitions API (other browsers get a simple scale-in)
- the tab highlight slides

Everything switches off when the user's system asks for reduced motion. Keep that behaviour.

## 6. Data each screen needs

These field names are from the reference. Map them to whatever the real API returns; do not rename the real API to match.

- **Batch:** id, product, submitted by, submitted at, uploaded files (name, size, kind), overall state (queued, running, done, needs attention, failed).
- **Per file result:** file name, reference ID (e.g. RFQ ID), code (e.g. strategy code), status (done, warning, failed), messages, generated output files.
- **Developer view only:** current stage, stage list, stage start and end times, event log.
- **Product:** id, short code, display name, title, description, accepted file types, whether a mapping workbook is required, whether it has templates, stage list (developers only).

## 7. Done when

- [ ] Tabs are Products, Report and Templates, centred, and no product appears as a tab.
- [ ] A product added to the gateway config appears on the Products page and in the switcher with no template edits.
- [ ] A user never sees stage names, stage ticks, timings or the event log, on any page.
- [ ] A developer sees all of them.
- [ ] View-only users cannot upload, and template management only shows for permitted users, in the UI **and** in the server checks (which stay unchanged).
- [ ] Upload, live progress, details and downloads work end to end against the real backend.
- [ ] When the backend is unreachable, the last list stays on screen with a clear notice.
- [ ] No new dependencies or external URLs; fonts and icons are served locally.
- [ ] Works at desktop and phone widths, with keyboard focus visible and reduced motion respected.
- [ ] Existing tests pass. Add tests for the developer flag and the product list.

## 8. Open questions for the team

1. Which access value marks someone as a developer, and how does the gateway expose it to templates?
2. Does the backend report per-stage progress and timings today? If not, what can the developer view show for now?
3. Where does the product registry live (gateway config or backend), so new products show up automatically?
4. Should the blue action colour change to OCBC red?
5. TPN stage names, outputs and warning texts, once the TPN backend defines them.
