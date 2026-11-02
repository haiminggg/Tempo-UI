# Tempo, plain JS and CSS

The glass redesign with no libraries, no build step and nothing loaded from the network. It replaces the React demo in `../tempo-react` (which is kept for comparison). All data is faked in the browser.

## Run it

```bash
python serve.py
```

Open http://127.0.0.1:5176.

**In CML:** create an Application, set the script to `serve.py`, any Python 3 runtime, no packages to install. CML provides the port through `CDSW_APP_PORT`.

This is a UI reference only. Real access (who is a developer, who can upload) comes from the internal access systems. Any login ID and password works. Use the ID `dev` to sign in as a developer, or the password `wrong` to see a failed sign-in. To skip sign-in, add `?demo=user` (or `viewer`, `eli`, `dev`).

## Users and developers

The desk changes with the signed-in role's audience (`audience` in `T.config.roles`):

| | User | Developer |
| --- | --- | --- |
| Batch row while processing | "Processing" with a moving bar | Current stage, e.g. "Parse (3 of 6)", and one tick per stage |
| Detail panel | Status message, files, results, downloads | Stages with timings, files, full output file names, event log |
| Failures | Plain message per file | Stage it failed at, plus the log |
| Products page | Description and counts | Also the stage list per product |
| Top bar | | "Developer" badge |

How a real login maps to developer is not decided. In the demo it is a role you pick under **View as** in the account menu.

## Navigation

The top bar tabs are Products, Report and Templates, centred. Products are no longer tabs: they are listed on the Products page (searchable, last opened first) and each desk title is a switcher to jump between products. Adding a product means adding an entry to `T.config.products` in `js/data.js`; the list, switcher and report pick it up.

## Files

- `js/data.js` mock backend: config, roles, batches, templates, zip downloads, upload checks
- `js/motion.js` animation helpers: list reordering (FLIP), count up, magnetic button, line-by-line headline, shared transition from row to panel (View Transitions API), sliding tab highlight
- `js/ui.js` DOM builder, icons, toasts, segmented control, product picker, polling
- `js/pages.js` sign in, products, desk, report, templates
- `js/app.js` shell, router, account menu, simulated colleagues
- `css/tempo.css` all styles
- `fonts/` Satoshi (Fontshare, free licence), self-hosted

## Notes

- The row to panel animation uses the View Transitions API (current Chrome and Edge). Other browsers get a simple scale-in.
- Reduced motion settings turn the animations off.
- TPN stage names, outputs and warnings are placeholders until the TPN backend defines them.
- Downloads are placeholder `.demo.txt` files.
