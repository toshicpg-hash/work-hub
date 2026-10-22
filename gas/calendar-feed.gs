/**
 * CPG HUB 用 Googleカレンダー読み取りフィード（読み取り専用）
 *
 * ウェブアプリとして公開し、CPG HUB の予定画面から呼び出します。
 *   GET <公開URL>?from=YYYY-MM-DD&to=YYYY-MM-DD&key=<FEED_KEY>
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）に入れるもの:
 *   CAL_IDS   読むカレンダーのID。カンマ区切り（例: aaa@group.calendar.google.com,bbb@gmail.com）
 *   FEED_KEY  合言葉。HUB の設定にも同じものを入れる（20文字以上の推測されにくい文字列）
 *   CAL_NAMES （任意）HUB に出す短い名前。CAL_IDS と同じ順にカンマ区切り（例: CPG,黒木）
 *
 * 返すのは予定の id・calendar・title・start・end・allDay・location だけです。説明文や参加者は返しません。
 * カレンダーへの書き込みはしません。
 */

var TZ = 'Asia/Tokyo';
var MAX_DAYS = 93;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var props = PropertiesService.getScriptProperties();
  var feedKey = props.getProperty('FEED_KEY');
  if (!feedKey || String(p.key || '') !== feedKey) {
    return json_({ ok: false, status: 403, error: 'forbidden' });
  }

  var from = parseYmd_(p.from);
  var to = parseYmd_(p.to);
  if (!from || !to || to < from) {
    return json_({ ok: false, status: 400, error: 'bad_range' });
  }
  var days = Math.round((to.getTime() - from.getTime()) / 864e5) + 1;
  if (days > MAX_DAYS) {
    return json_({ ok: false, status: 400, error: 'range_too_long', maxDays: MAX_DAYS });
  }
  var end = new Date(to.getTime() + 864e5); // 「to」の日の終わりまで

  var ids = splitList_(props.getProperty('CAL_IDS'));
  var names = splitList_(props.getProperty('CAL_NAMES'));
  if (!ids.length) {
    return json_({ ok: false, status: 500, error: 'no_calendars' });
  }

  var events = [];
  var calendars = [];
  var missing = 0;
  ids.forEach(function (id, i) {
    var cal = CalendarApp.getCalendarById(id);
    if (!cal) { missing++; return; }
    var label = names[i] || cal.getName();
    calendars.push(label);
    cal.getEvents(from, end).forEach(function (ev) {
      var allDay = ev.isAllDayEvent();
      var s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      var t = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
      events.push({
        id: ev.getId() + '@' + s.getTime(),
        calendar: label,
        title: ev.getTitle(),
        start: allDay ? fmt_(s, 'yyyy-MM-dd') : fmt_(s, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        end: allDay ? fmt_(t, 'yyyy-MM-dd') : fmt_(t, "yyyy-MM-dd'T'HH:mm:ssXXX"), // 終日の end は最終日の翌日
        allDay: allDay,
        location: ev.getLocation() || ''
      });
    });
  });
  events.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });

  return json_({ ok: true, from: p.from, to: p.to, calendars: calendars, missing: missing, events: events });
}

/** エディタで実行して、CAL_IDS のカレンダーが読めるかを確かめるための関数（ログに名前が出ます） */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var ids = splitList_(props.getProperty('CAL_IDS'));
  Logger.log('FEED_KEY: ' + (props.getProperty('FEED_KEY') ? '設定済み' : '未設定'));
  if (!ids.length) Logger.log('CAL_IDS が未設定です');
  ids.forEach(function (id) {
    var cal = CalendarApp.getCalendarById(id);
    Logger.log(id + ' → ' + (cal ? '読めます: ' + cal.getName() : '読めません（IDの間違いか、共有されていません）'));
  });
}

function parseYmd_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
  var d = Utilities.parseDate(s, TZ, 'yyyy-MM-dd');
  return fmt_(d, 'yyyy-MM-dd') === s ? d : null; // 2026-02-30 のような日付は受け付けない
}

function splitList_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

function fmt_(d, pattern) {
  return Utilities.formatDate(d, TZ, pattern);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
