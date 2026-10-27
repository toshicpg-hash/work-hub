# Shared receipt viewing (v1.44 candidate)

The receipt screen in v1.43 reads only this device's `DB.receipts`. Its advances tab excludes corporate cards; its claims tab shows only locally created claims. The company overview does load employee receipt rows into `ui.corp.data[].rc`, but its advances summary explicitly excludes corporate cards. Consequently, two corporate-card receipts can be present in the shared snapshot while both local receipt tabs and the overview's advance totals are empty. This behavior is reproduced against the unchanged v1.43 HTML with synthetic fixtures. It does not demonstrate a deletion or establish which device/screen a user viewed on a previous day.

Shared snapshots are device-specific (`workhub_corp_last_v1`), separated by existing administrator/viewer configuration, and reused for up to 30 days. They are not the employee's live local database. A missing/stale/differently configured snapshot and a failed read must not be presented as proof of zero receipts. No client can infer additions not yet sent by an employee.

## Changes

- An explicit ownership selector separates own receipts from read-only shared receipts. Local registration, settlement, history, suggestions and exports continue using only `DB.receipts`.
- The shared view uses only already loaded employee sources admitted by the current administrator staff list or the existing all-company/GM viewer rules. Removed or unauthorized sources are not displayed. Source IDs and row IDs are kept separate; same IDs in different sources never collapse.
- The shared view shows employee/company/payment filters, separate advance/card counts and amounts, detailed recorded status and claim/close number, source synchronization time, device read time and source version. Unknown methods or amounts remain unconfirmed instead of becoming an advance or zero.
- A header check distinguishes a successful header-only receipt read from malformed/missing receipt data. Cached legacy empty results remain unconfirmed until reread. A failed source remains visible as an error, including for viewers; 403/404 hides its details/originals.
- A transient failure may display that source's last successful receipt snapshot with an explicit warning that it is previous data, not a fresh total. Only receipt data is retained for this fallback; failed cases and ToDos are not resurrected. Permission errors never use that fallback.
- Original links are validated as HTTPS Google Drive file links, preserving an existing resource key. They open in Drive's viewer with `noopener noreferrer`, under the existing Google account's permissions. Images and PDFs are not imported into the local owner's photo store or copied to another folder. A missing original link is labeled unconfirmed, not deleted. No new scopes, sharing changes, file enumeration or automatic sending were added.
- A link on the company overview points directly to the shared view and explains that its existing advances totals exclude cards.

## Data boundaries

The new `shared-receipts.js` module is a pure projection: no network, localStorage, IndexedDB or source writes. Neither it nor the view appends shared rows to local receipts or changes financial/settlement state. The existing shared-record read button is reused (Google GETs). Existing local settings/cache bookkeeping remains in that read path. Existing receipt original storage, verified body save, PDF/image selection, Drive original upload, accounting export, Google authorization and sharing helpers remain unchanged. No initialization, reinstall, new permissions or re-registration is required.

## Verification

- `node tests/shared-receipts.test.cjs`: projection, current access filters, duplicate IDs, payment totals, unknown/missing data, snapshot state, original URL validation/resource keys, immutability.
- `node tests/shared-receipts-browser.cjs`: v1.43 symptom reproduction; 320/390/822px touch layouts; cache/reload/filters; source read and error handling through mocked Google GETs; role/permission denial; same IDs; original links; no local receipt writes or inclusion in own suggestions/settlement; overview navigation.
- Existing receipt-file and receipt-input browser suites cover PDF/image registration, re-selection, readback failures, original bytes/MIME/names, reload, existing photos, same-ID edits, concurrency, export and mocked Drive upload.
- Existing calendar, case editing, ToDo editing and cancellation suites remain part of regression verification.

All tracked fixtures are synthetic. No company record, actual source ID, amount or original link is embedded in this change. Android hardware, account selection in the external Drive viewer, and the precise device/screen used before the reported disappearance require separate confirmation. The candidate must not be published before the user's approval.
