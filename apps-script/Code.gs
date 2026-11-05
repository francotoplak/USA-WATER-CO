/**
 * Door Log sync server for USA Water Co.
 *
 * Paste this into Extensions → Apps Script of a Google Sheet owned by the business owner,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Full steps: SETUP.md in the repo.
 */

// ---- Settings: change these ----
const TEAM_PIN = '2468';          // every tablet enters this PIN in Door Log → Settings → Team sync
const ADD_TO_CALENDAR = true;     // put Booked doors straight on this Google account's calendar
// --------------------------------

const SHEET_NAME = 'Doors';
const HEADERS = ['ID', 'Address', 'Status', 'Homeowner', 'Phone', 'Appointment', 'Length (min)', 'Notes', 'Rep',
  'First knocked', 'Last updated', 'Latitude', 'Longitude', 'Calendar event', 'Deleted', 'Data', 'Server time'];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
const STATUS_LABEL = { nothome: 'Not home', no: 'Not interested', int: 'Interested', booked: 'Booked' };

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(COL['Data'] + 1, 2); // raw data + server time are for the app, not people
  }
  return sh;
}

function readRows(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== TEAM_PIN) return out({ ok: false, error: 'pin' });
  const since = Number(p.since || 0);
  const rows = readRows(sheet());
  const doors = [];
  rows.forEach(r => {
    if (Number(r[COL['Server time']]) <= since) return;
    if (r[COL['Deleted']] === true || r[COL['Deleted']] === 'TRUE') {
      doors.push({ id: String(r[COL['ID']]), deleted: true });
    } else {
      try { doors.push(JSON.parse(r[COL['Data']])); } catch (err) {}
    }
  });
  return out({ ok: true, now: Date.now(), calendar: ADD_TO_CALENDAR, doors: doors });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad_request' }); }
  if (body.key !== TEAM_PIN) return out({ ok: false, error: 'pin' });
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet();
    const rows = readRows(sh);
    const index = {};
    rows.forEach((r, i) => { index[String(r[COL['ID']])] = i; });
    let applied = 0;
    const appended = [];
    changes.forEach(ch => {
      if (!ch || !ch.id) return;
      const id = String(ch.id);
      const i = index[id];
      const existing = i === undefined ? null : rows[i];
      let prev = null;
      if (existing && existing[COL['Data']]) { try { prev = JSON.parse(existing[COL['Data']]); } catch (err) {} }
      // newest edit wins
      if (prev && ch.updatedAt && prev.updatedAt && prev.updatedAt > ch.updatedAt) return;
      const eventId = syncCalendar(ch, existing ? String(existing[COL['Calendar event']] || '') : '');
      const row = toRow(ch, eventId, prev);
      if (existing) { rows[i] = row; sh.getRange(i + 2, 1, 1, HEADERS.length).setValues([row]); }
      else { index[id] = rows.length; rows.push(row); appended.push(row); }
      applied++;
    });
    if (appended.length) sh.getRange(sh.getLastRow() + 1, 1, appended.length, HEADERS.length).setValues(appended);
    return out({ ok: true, now: Date.now(), applied: applied });
  } finally {
    lock.releaseLock();
  }
}

function toRow(d, eventId, prev) {
  const row = new Array(HEADERS.length).fill('');
  row[COL['ID']] = d.id;
  row[COL['Server time']] = Date.now();
  if (d.deleted) {
    const base = prev || {};
    row[COL['Address']] = base.address || '';
    row[COL['Status']] = 'Deleted';
    row[COL['Deleted']] = true;
    row[COL['Last updated']] = new Date();
    return row;
  }
  row[COL['Address']] = d.address || '';
  row[COL['Status']] = STATUS_LABEL[d.status] || d.status || '';
  row[COL['Homeowner']] = d.name || '';
  row[COL['Phone']] = d.phone ? "'" + d.phone : '';
  row[COL['Appointment']] = d.appt ? new Date(d.appt.start) : '';
  row[COL['Length (min)']] = d.appt ? d.appt.dur : '';
  row[COL['Notes']] = d.notes || '';
  row[COL['Rep']] = d.rep || '';
  row[COL['First knocked']] = d.createdAt ? new Date(d.createdAt) : '';
  row[COL['Last updated']] = d.updatedAt ? new Date(d.updatedAt) : new Date();
  row[COL['Latitude']] = d.lat;
  row[COL['Longitude']] = d.lng;
  row[COL['Calendar event']] = eventId || '';
  row[COL['Deleted']] = false;
  row[COL['Data']] = JSON.stringify(d);
  return row;
}

function syncCalendar(d, eventId) {
  if (!ADD_TO_CALENDAR) return eventId;
  const cal = CalendarApp.getDefaultCalendar();
  let ev = null;
  if (eventId) { try { ev = cal.getEventById(eventId); } catch (err) { ev = null; } }
  const wantEvent = !d.deleted && d.status === 'booked' && d.appt && d.appt.start;
  if (!wantEvent) {
    if (ev) { try { ev.deleteEvent(); } catch (err) {} }
    return '';
  }
  const start = new Date(d.appt.start);
  const end = new Date(start.getTime() + (Number(d.appt.dur) || 90) * 60000);
  const who = d.name || (d.address ? String(d.address).split(',')[0] : 'New customer');
  const title = 'Water system appt: ' + who;
  const description = [
    d.name && 'Homeowner: ' + d.name,
    d.phone && 'Phone: ' + d.phone,
    d.address && 'Address: ' + d.address,
    d.notes && 'Notes: ' + d.notes,
    d.rep && 'Booked by: ' + d.rep,
    'Map: https://maps.google.com/?q=' + d.lat + ',' + d.lng
  ].filter(Boolean).join('\n');
  const location = d.address || (d.lat + ',' + d.lng);
  if (ev) {
    ev.setTime(start, end); ev.setTitle(title); ev.setDescription(description); ev.setLocation(location);
  } else {
    ev = cal.createEvent(title, start, end, { description: description, location: location });
    try { ev.addPopupReminder(60); } catch (err) {}
  }
  return ev.getId();
}

/** Run once from the editor to approve permissions and create the Doors tab. */
function setup() {
  sheet();
  if (ADD_TO_CALENDAR) CalendarApp.getDefaultCalendar();
}
