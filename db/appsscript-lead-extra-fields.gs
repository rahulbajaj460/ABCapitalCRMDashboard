// Apps Script changes to bring `created_time` + the sheet Row Number into the
// CRM for the "New Zap Leads 26" tab (Advertising list). Reference copy — the
// live script lives in the Google Sheet's bound Apps Script project.
//
// PREREQUISITE: run db/add_advertising_extra_fields.sql first (creates the
// `created_time` and `Row Number` custom fields on the list) and deploy the
// updated create-lead-task Edge Function (adds the `update_fields` action).
//
// ── EDIT 1: add created_time to the "New Zap Leads 26" fieldMap ──
// In the SHEETS config, the New Zap Leads 26 entry's fieldMap becomes:
//     fieldMap: {
//       'work_email': 'Email',
//       'work_phone_number': 'Phone Number',
//       'city': 'City',
//       'lead_status': 'Lead Status',
//       'Remark': 'Remarks',
//       'Comments': 'Comments',
//       'Remark1': 'Remark1',
//       'Remark2': 'Remark2',
//       'created_time': 'created_time'   // ← ADD THIS LINE
//     },
//
// ── EDIT 2: inject the Row Number into every payload ──
// In BOTH processNewLeads() and backfillAll(), right AFTER the block that builds
// `fields` (the `Object.keys(cfg.fieldMap).forEach(...)` loop) and BEFORE the
// `UrlFetchApp.fetch(...)` call, add this one line:
//
//     fields['Row Number'] = String(rowNum);
//
// (`rowNum` already exists in both loops.) Harmless for other tabs — lists with
// no "Row Number" field simply ignore it, and it's excluded from the dedupe hash.

// ── EDIT 3: one-time backfill of existing tasks ──
// Paste this whole function into the script project, then run it ONCE from the
// Apps Script editor (Run ▸ backfillExtraFields). It walks every New Zap Leads 26
// row and pushes created_time + Row Number onto the matching existing task
// (matched by name). It NEVER creates tasks. Safe to re-run. Read the Logs
// (View ▸ Logs) afterwards — any 'no matching task' or 'ambiguous' rows are
// listed so you can fix those by hand.
function backfillExtraFields() {
  const TAB = 'New Zap Leads 26';                 // sheet tab to backfill
  const EXTRA_HEADERS = ['created_time'];         // sheet columns → same-named CRM fields
  const ss = SpreadsheetApp.getActive();
  const url = _p().getProperty('SUPABASE_FUNCTION_URL');
  const secret = _p().getProperty('WEBHOOK_SECRET');
  const cfg = SHEETS.find((c) => c.sheetName === TAB);
  if (!cfg) { Logger.log('No SHEETS config for tab ' + TAB); return; }

  const s = ss.getSheetByName(TAB);
  if (!s) { Logger.log('Tab not found: ' + TAB); return; }
  const lastRow = s.getLastRow(); if (lastRow < 2) return;
  const lastCol = s.getLastColumn();
  const h = s.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const tc = _col(h, cfg.titleHeader);
  if (tc === -1) { Logger.log('Title header not found: ' + cfg.titleHeader); return; }

  const data = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let ok = 0, noMatch = 0, ambiguous = 0, other = 0;
  for (let i = 0; i < data.length; i++) {
    const r = data[i], rowNum = i + 2;
    const title = String(r[tc] || '').trim();
    if (!title) continue;

    const fields = { 'Row Number': String(rowNum) };
    EXTRA_HEADERS.forEach((hdr) => {
      const c = _col(h, hdr);
      if (c !== -1) fields[hdr] = String(r[c] || '').trim();
    });

    const resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        secret, action: 'update_fields', spaceName: SPACE_NAME,
        folderName: cfg.folderName || FOLDER_NAME, listName: cfg.listName, title, fields,
      }),
    });
    let body = {};
    try { body = JSON.parse(resp.getContentText()); } catch (e) {}
    if (resp.getResponseCode() !== 200) {
      other++; Logger.log('row ' + rowNum + ' HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
    } else if (body.updated === 1) {
      ok++;
    } else if (body.reason === 'ambiguous') {
      ambiguous++; Logger.log('row ' + rowNum + ' AMBIGUOUS (' + body.count + ' tasks named "' + title + '")');
    } else if (body.reason === 'no matching task') {
      noMatch++; Logger.log('row ' + rowNum + ' NO MATCH for "' + title + '"');
    } else {
      other++; Logger.log('row ' + rowNum + ' ' + resp.getContentText());
    }
    Utilities.sleep(60);   // gentle pacing so we don't hammer the function
  }
  Logger.log('backfillExtraFields done: updated=' + ok + ' noMatch=' + noMatch +
             ' ambiguous=' + ambiguous + ' other=' + other + ' of ' + data.length + ' rows.');
}
