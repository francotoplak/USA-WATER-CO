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

const STATUS_LABEL = { nothome: 'Not home', no: 'Not interested', int: 'Interested', booked: 'Booked' };

// One tab per kind of record. The last three columns are for the app and stay hidden.
const KINDS = {
  door: {
    sheet: 'Doors',
    headers: ['ID', 'Address', 'Status', 'Homeowner', 'Phone', 'Appointment', 'Length (min)', 'Follow up', 'Notes', 'Rep',
      'First knocked', 'Last updated', 'Latitude', 'Longitude', 'Calendar event', 'Deleted', 'Data', 'Server time'],
    fill: (d, row, h, prev, existing) => {
      row[h['Address']] = d.address || '';
      row[h['Status']] = STATUS_LABEL[d.status] || d.status || '';
      row[h['Homeowner']] = d.name || '';
      row[h['Phone']] = d.phone ? "'" + d.phone : '';
      row[h['Appointment']] = d.appt ? new Date(d.appt.start) : '';
      row[h['Length (min)']] = d.appt ? d.appt.dur : '';
      row[h['Follow up']] = d.followUp ? new Date(d.followUp) : '';
      row[h['Notes']] = d.notes || '';
      row[h['Rep']] = d.rep || '';
      row[h['First knocked']] = d.createdAt ? new Date(d.createdAt) : '';
      row[h['Latitude']] = d.lat;
      row[h['Longitude']] = d.lng;
      row[h['Calendar event']] = syncCalendar(d, existing ? String(existing[h['Calendar event']] || '') : '');
    },
    onDelete: (row, h, prev, existing) => {
      if (existing) syncCalendar({ deleted: true }, String(existing[h['Calendar event']] || ''));
      row[h['Address']] = (prev && prev.address) || '';
    }
  },
  member: {
    sheet: 'Team',
    headers: ['ID', 'Name', 'Role', 'Last updated', 'Deleted', 'Data', 'Server time'],
    fill: (d, row, h) => { row[h['Name']] = d.name || ''; row[h['Role']] = d.role === 'manager' ? 'Owner / manager' : 'Rep'; },
    onDelete: (row, h, prev) => { row[h['Name']] = (prev && prev.name) || ''; }
  },
  territory: {
    sheet: 'Territories',
    headers: ['ID', 'Name', 'Rep', 'Color', 'Last updated', 'Deleted', 'Data', 'Server time'],
    fill: (d, row, h) => { row[h['Name']] = d.name || ''; row[h['Rep']] = repName(d.repId); row[h['Color']] = d.color || ''; },
    onDelete: (row, h, prev) => { row[h['Name']] = (prev && prev.name) || ''; }
  }
};
const kindOf = id => String(id).indexOf('m_') === 0 ? 'member' : String(id).indexOf('t_') === 0 ? 'territory' : 'door';
const hmap = headers => Object.fromEntries(headers.map((x, i) => [x, i]));

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetFor(kind) {
  const k = KINDS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(k.sheet);
  if (!sh) {
    sh = ss.insertSheet(k.sheet);
    sh.getRange(1, 1, 1, k.headers.length).setValues([k.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideColumns(k.headers.length - 1, 2); // Data + Server time
  }
  return sh;
}

function readRows(sh, width) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues();
}

let _team = null;
function repName(id) {
  if (!id) return 'Unassigned';
  if (!_team) {
    const h = hmap(KINDS.member.headers);
    _team = {};
    readRows(sheetFor('member'), KINDS.member.headers.length).forEach(r => { _team[String(r[h['ID']])] = r[h['Name']]; });
  }
  return _team[id] || '';
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== TEAM_PIN) return out({ ok: false, error: 'pin' });
  const since = Number(p.since || 0);
  const records = [];
  Object.keys(KINDS).forEach(kind => {
    const k = KINDS[kind], h = hmap(k.headers);
    readRows(sheetFor(kind), k.headers.length).forEach(r => {
      if (Number(r[h['Server time']]) <= since) return;
      if (r[h['Deleted']] === true || r[h['Deleted']] === 'TRUE') records.push({ id: String(r[h['ID']]), deleted: true });
      else { try { records.push(JSON.parse(r[h['Data']])); } catch (err) {} }
    });
  });
  return out({ ok: true, now: Date.now(), calendar: ADD_TO_CALENDAR, doors: records });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad_request' }); }
  if (body.key !== TEAM_PIN) return out({ ok: false, error: 'pin' });
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    let applied = 0;
    // members first so territory rows can show rep names
    ['member', 'territory', 'door'].forEach(kind => {
      const mine = changes.filter(c => c && c.id && kindOf(c.id) === kind);
      if (!mine.length) return;
      if (kind !== 'member') _team = null;
      const k = KINDS[kind], h = hmap(k.headers), sh = sheetFor(kind);
      const rows = readRows(sh, k.headers.length);
      const index = {};
      rows.forEach((r, i) => { index[String(r[h['ID']])] = i; });
      const appended = [];
      mine.forEach(ch => {
        const id = String(ch.id);
        const i = index[id];
        const existing = i === undefined ? null : rows[i];
        let prev = null;
        if (existing && existing[h['Data']]) { try { prev = JSON.parse(existing[h['Data']]); } catch (err) {} }
        if (prev && ch.updatedAt && prev.updatedAt && prev.updatedAt > ch.updatedAt) return; // newest edit wins
        const row = new Array(k.headers.length).fill('');
        row[h['ID']] = id;
        row[h['Server time']] = Date.now();
        row[h['Last updated']] = ch.updatedAt ? new Date(ch.updatedAt) : new Date();
        if (ch.deleted) {
          row[h['Deleted']] = true;
          k.onDelete(row, h, prev, existing);
          if (h['Status'] !== undefined) row[h['Status']] = 'Deleted';
        } else {
          row[h['Deleted']] = false;
          k.fill(ch, row, h, prev, existing);
          row[h['Data']] = JSON.stringify(ch);
        }
        if (existing) { rows[i] = row; sh.getRange(i + 2, 1, 1, k.headers.length).setValues([row]); }
        else { index[id] = rows.length; rows.push(row); appended.push(row); }
        applied++;
      });
      if (appended.length) sh.getRange(sh.getLastRow() + 1, 1, appended.length, k.headers.length).setValues(appended);
    });
    return out({ ok: true, now: Date.now(), applied: applied });
  } finally {
    lock.releaseLock();
  }
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

/** Run once from the editor to approve permissions and create the tabs. */
function setup() {
  Object.keys(KINDS).forEach(sheetFor);
  if (ADD_TO_CALENDAR) CalendarApp.getDefaultCalendar();
}
