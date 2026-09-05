// Apps Script changes to bring `created_time` + the sheet Row Number into the
// CRM for the "New Zap Leads 26" tab (Advertising list). Reference copy — the
// live script lives in the Google Sheet's bound Apps Script project.
//
// PREREQUISITE: run db/add_advertising_extra_fields.sql first (creates the
// `created_time` DATE field and `Row Number` number field on the list) and
// deploy the updated create-lead-task Edge Function (adds the `update_fields`
// action and date normalization).
//
// NOTE: created_time is sent as the raw sheet value (e.g. an ISO datetime like
// 2026-06-19T12:14:49-05:00). The Edge Function slices date-typed fields down to
// the calendar day (2026-06-19), so no formatting is needed here on the Sheets
// side — keep sending the cell value as-is.
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

// ── EDIT 3: one-time backfill of existing tasks (BATCHED + RESUMABLE) ──
// Paste this whole function in, then run it from the Apps Script editor
// (Run ▸ backfillExtraFields). It pushes created_time + Row Number onto the
// matching existing task (matched by name). It NEVER creates tasks and is safe
// to re-run.
//
// It sends CHUNK rows per request (not one-at-a-time), so ~250 rows finish in a
// handful of calls instead of blowing the 6-minute limit. If it still runs out
// of time it SAVES ITS PLACE — just run it again and it resumes from where it
// stopped; it prints "PAUSED at row N — run again to continue." When it prints
// "COMPLETE" it's done. Read the Logs (View ▸ Logs) for any NO MATCH / AMBIGUOUS
// rows to fix by hand. To force a fresh start, run resetBackfillCursor() first.
function backfillExtraFields() {
  const TAB = 'New Zap Leads 26';                 // sheet tab to backfill
  const EXTRA_HEADERS = ['created_time'];         // sheet columns → same-named CRM fields
  const CHUNK = 75;                               // rows per request
  const TIME_BUDGET_MS = 4.5 * 60 * 1000;         // stop before the 6-min hard limit
  const CURSOR_KEY = 'BF_CURSOR_' + TAB;

  const started = Date.now();
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
  let start = Number(_p().getProperty(CURSOR_KEY) || 0);
  if (start >= data.length) start = 0;   // finished last time; start over
  let ok = 0, noMatch = 0, ambiguous = 0, other = 0;

  let i = start;
  for (; i < data.length; i += CHUNK) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      _p().setProperty(CURSOR_KEY, String(i));
      Logger.log('PAUSED at row ' + (i + 2) + ' — run backfillExtraFields again to continue. ' +
                 '(so far this pass: updated=' + ok + ' noMatch=' + noMatch + ' ambiguous=' + ambiguous + ' other=' + other + ')');
      return;
    }
    const items = [];
    for (let j = i; j < Math.min(i + CHUNK, data.length); j++) {
      const r = data[j], rowNum = j + 2;
      const title = String(r[tc] || '').trim();
      if (!title) continue;
      const fields = { 'Row Number': String(rowNum) };
      EXTRA_HEADERS.forEach((hdr) => {
        const c = _col(h, hdr);
        if (c !== -1) fields[hdr] = String(r[c] || '').trim();
      });
      items.push({ title: title, fields: fields });
    }
    if (!items.length) continue;

    const resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        secret, action: 'update_fields_batch', spaceName: SPACE_NAME,
        folderName: cfg.folderName || FOLDER_NAME, listName: cfg.listName, items: items,
      }),
    });
    if (resp.getResponseCode() !== 200) {
      _p().setProperty(CURSOR_KEY, String(i));
      Logger.log('HTTP ' + resp.getResponseCode() + ' at row ' + (i + 2) + ': ' + resp.getContentText() +
                 ' — fix and run again to resume.');
      return;
    }
    let body = {};
    try { body = JSON.parse(resp.getContentText()); } catch (e) {}
    const sum = body.summary || {};
    ok += sum.updated || 0; noMatch += sum.noMatch || 0; ambiguous += sum.ambiguous || 0; other += sum.other || 0;
    (body.results || []).forEach((r) => {
      if (r.reason === 'ambiguous') Logger.log('AMBIGUOUS (' + r.count + ' tasks named "' + r.title + '")');
      else if (r.reason === 'no matching task') Logger.log('NO MATCH for "' + r.title + '"');
    });
  }

  _p().deleteProperty(CURSOR_KEY);
  Logger.log('COMPLETE: updated=' + ok + ' noMatch=' + noMatch +
             ' ambiguous=' + ambiguous + ' other=' + other + ' of ' + data.length + ' rows.');
}

// Run this once to force backfillExtraFields to start again from the top.
function resetBackfillCursor() {
  _p().deleteProperty('BF_CURSOR_New Zap Leads 26');
  Logger.log('Backfill cursor reset.');
}
