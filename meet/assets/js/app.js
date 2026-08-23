(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Prefer unambiguous abbreviations only — many letter codes collide worldwide (CST, IST, …).
  const TZ_ALIASES = {
    UTC: 'UTC', GMT: 'UTC',
    BST: 'Europe/London',
    JST: 'Asia/Tokyo',
    AEST: 'Australia/Sydney',
    NZST: 'Pacific/Auckland',
    SAST: 'Africa/Johannesburg',
  };
  /** World shortlist shown first in Meeting options (not US-centric). */
  const WORLD_SHORTLIST = [
    'UTC',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens',
    'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney', 'Pacific/Auckland',
    'America/Sao_Paulo', 'America/Mexico_City', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  ];
  const TZ_REGION_ORDER = ['Shortlist', 'UTC', 'Africa', 'America', 'Antarctica', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific', 'Other'];
  const INTRO_PLACEHOLDER = 'Add a short description for attendees — shown in the status bar and Overview.';
  const isTouchUi = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  function isNarrowScreen() { return window.innerWidth < 700; }
  function autoDetailsOpen(defaultOpen = true) { return !isNarrowScreen() && defaultOpen; }
  const page = document.body.dataset.page;

  function sanitizePasscode(raw) {
    return String(raw || '').toLowerCase().trim()
      .replace(/[|\r\n\t]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/ {2,}/g, ' ');
  }
  function normalizePasscode(raw) {
    const p = sanitizePasscode(raw);
    return (p.length >= 2 && p.length <= 20) ? p : '';
  }
  const PASSCODE_TIP = '0–9 a–z and safe specials (not |). Leading spaces removed. Needed to find lost meeting links.';
  const FIND_IDENTITY_KEY = 'meet_find_identity';

  document.getElementById('footer-tz')?.replaceChildren(document.createTextNode(tz));

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  // ─── Home page ───────────────────────────────────────────────────────────────

  function initHome() {
    const localTimeEl = document.getElementById('home-local-time');
    if (localTimeEl) {
      const now = new Date();
      const localStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const utcStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      localTimeEl.textContent = `Your local time zone is ${tz} — ${localStr} and ${utcStr} UTC`;
    }

    document.getElementById('create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      try {
        const res = await apiPost({ action: 'create', title: String(data.get('title') || '').trim(), timezone: tz });
        window.location.href = meetingUrl(res.slug);
      } catch (err) {
        alert(err.message);
      }
    });

    const pinInput = document.getElementById('find-pin-input');
    document.getElementById('find-pin-toggle')?.addEventListener('click', () => {
      if (!pinInput) return;
      const show = pinInput.type === 'password';
      pinInput.type = show ? 'text' : 'password';
      const btn = document.getElementById('find-pin-toggle');
      if (btn) {
        btn.title = show ? 'Hide passcode' : 'Show passcode';
        btn.setAttribute('aria-label', show ? 'Hide passcode' : 'Show passcode');
      }
    });

    document.getElementById('list-meetings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const box = document.getElementById('list-meetings-result');
      try {
        const passcode = normalizePasscode(data.get('pin'));
        if (!passcode && String(data.get('pin') || '').trim()) {
          throw new Error('Enter a passcode of 2 to 20 characters.');
        }
        const res = await apiPost({
          action: 'list_meetings',
          display_name: data.get('display_name'),
          pin: passcode,
        });
        if (!box) return;
        box.hidden = false;
        if (!res.meetings?.length) {
          box.innerHTML = '<p class="meta">No meetings found for that name and passcode. Check spelling and that you set a passcode when you registered.</p>';
          return;
        }
        const countLabel = res.meetings.length === 1 ? '1 meeting found' : `${res.meetings.length} meetings found`;
        sessionStorage.setItem(FIND_IDENTITY_KEY, JSON.stringify({
          display_name: String(data.get('display_name') || '').trim(),
          pin: passcode,
        }));
        box.innerHTML = `<p class="meta">${countLabel}</p>
          <table class="meetings-found-table">
            <tbody>${res.meetings.map((m) => {
              const when = String(m.range_start || '').trim() || String(m.created || '').slice(0, 10) || '—';
              const href = meetingUrl(m.slug);
              return `<tr>
                <td class="meetings-found-date">${escapeHtml(when)}</td>
                <td class="meetings-found-title"><a href="${escapeHtml(href)}" data-meeting-slug="${escapeHtml(m.slug)}"${m.attendee_id ? ` data-attendee-id="${escapeHtml(m.attendee_id)}"` : ''}>${escapeHtml(m.title)}</a></td>
              </tr>`;
            }).join('')}</tbody>
          </table>`;
        box.querySelectorAll('a[data-meeting-slug]').forEach((link) => {
          link.addEventListener('click', () => {
            const slug = link.dataset.meetingSlug;
            const attendeeId = link.dataset.attendeeId || '';
            const raw = sessionStorage.getItem(FIND_IDENTITY_KEY);
            if (raw && slug) {
              try {
                const id = JSON.parse(raw);
                sessionStorage.setItem(`meet_auto_claim_${slug}`, JSON.stringify({
                  ...id,
                  attendee_id: attendeeId,
                }));
              } catch (_) { /* ignore */ }
            }
          });
        });
      } catch (err) {
        if (box) {
          box.hidden = false;
          box.innerHTML = `<p class="meta">${escapeHtml(err.message)}</p>`;
        }
      }
    });
  }

  // ─── Scheduler init ──────────────────────────────────────────────────────────

  async function initScheduler(slug) {
    const root = document.getElementById('app');
    const state = {
      slug,
      meet: null,
      attendeeId: localStorage.getItem(attendeeKey(slug)) || '',
      selectedSlots: new Set(),
      selectedLocations: new Set(),
      viewStart: startOfDay(new Date()),
      activeTab: 'overview',
      sortOrder: 'date',
      dragging: false,
      dragSelect: true,
      editingIntro: null,
      headerExpanded: false,
      claimingId: null,
      editingAttendeeId: null,
      editingAttachmentId: null,
      changingPin: false,
      pendingConfirmLocation: null,
      pendingConfirmLocationPhysical: null,
      pendingConfirmLocationOnline: null,
      pendingConfirmedLocationIds: null,
      editingLocationId: null,
      showAllGroupHours: localStorage.getItem(groupHoursKey(slug)) === 'all',
      openNotesEditor: false,
      overviewHelpOpen: localStorage.getItem(overviewHelpKey(slug)) !== 'closed',
      attendeePanelOpen: undefined,
      lastDayCount: visibleDayCount(),
      helpOpen: false,
      locType: 'online',
      lastNarrow: isNarrowScreen(),
      expandedLocFields: new Set(),
      expandedAttachFields: new Set(),
    };

    try {
      state.meet = await fetchMeet(slug);
      if (state.attendeeId && !state.meet.attendees.some((a) => a.id === state.attendeeId)) {
        state.attendeeId = '';
        localStorage.removeItem(attendeeKey(slug));
      }
      const explicit = tabFromUrl();
      const signedIn = state.meet.attendees.find((a) => a.id === state.attendeeId);
      let activeTab = explicit || localStorage.getItem(tabKey(slug)) || 'getting-started';
      const validTabs = allValidTabs(state.meet, signedIn);
      if (!validTabs.includes(activeTab)) activeTab = validTabs[0] || 'getting-started';
      state.activeTab = activeTab;
      if (activeTab === 'calendar') state.scrollCalendarOnRender = true;
      restoreAttendeeSelections(state);
      state.viewStart = calendarMinStart(state.meet);
      await repairMeetingTimezone(state);
      await tryAutoLoginFromFind(state);
      wireOperationsLink(slug);
      render(root, state);
    } catch (err) {
      root.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }

    root.addEventListener('click', (e) => handleClick(e, root, state));
    root.addEventListener('toggle', (e) => {
      const pane = e.target.closest('[data-pane-id]');
      if (pane) savePaneOpenState(state, pane);
    }, true);
    root.addEventListener('focusout', (e) => {
      handleLocationRowBlur(e, root, state);
      handleAttachmentRowBlur(e, root, state);
    });
    root.addEventListener('focusin', (e) => {
      if (e.target.matches('.loc-cell')) {
        const row = e.target.closest('[data-location-row]');
        if (row) row.dataset.locSnapshot = locationRowSnapshot(row);
      }
      if (e.target.matches('.attach-cell')) {
        const row = e.target.closest('[data-attachment-row]');
        if (row) row.dataset.attachSnapshot = attachmentRowSnapshot(row);
      }
    });
    root.addEventListener('change', (e) => handleChange(e, root, state));
    root.addEventListener('submit', (e) => handleSubmit(e, root, state));
    root.addEventListener('pointerdown', (e) => handlePointerDown(e, root, state));
    root.addEventListener('pointerover', (e) => handlePointerOver(e, root, state));
    window.addEventListener('pointerup', () => { state.dragging = false; });
    window.addEventListener('resize', () => {
      if (!state.meet) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
      const narrow = isNarrowScreen();
      if (narrow !== state.lastNarrow) {
        state.lastNarrow = narrow;
        render(root, state);
        return;
      }
      const dc = visibleDayCount();
      if (dc === state.lastDayCount) return;
      state.lastDayCount = dc;
      render(root, state);
    });
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** When viewer TZ ≠ meeting TZ, show organiser wall time in parentheses (set false to revert). */
  const SHOW_ORGANISER_TIME_IN_GUTTER = true;

  function visibleDayCount() {
    if (window.innerWidth >= 1200) return 7;
    if (window.innerWidth >= 900) return 5;
    if (window.innerWidth >= 640) return 4;
    return 3;
  }

  /** Parse meeting length field: minutes, 1.5h, 2,5h, or AM / PM (sets default bookable hours). */
  function parseDurationField(raw, m) {
    const s = String(raw || '').trim();
    if (/^am$/i.test(s)) {
      const b = durationModeBounds('am', m);
      return { duration: b.duration, day_start: b.day_start, day_end: b.day_end };
    }
    if (/^pm$/i.test(s)) {
      const b = durationModeBounds('pm', m);
      return { duration: b.duration, day_start: b.day_start, day_end: b.day_end };
    }
    const duration = parseDurationInput(s);
    return { duration, day_start: null, day_end: null };
  }

  function formatDurationFieldValue(m) {
    const mode = inferDurationMode(m);
    if (mode === 'am') return 'AM';
    if (mode === 'pm') return 'PM';
    return formatDurationForInput(m.duration_minutes);
  }

  function formatWallHourDisplay(hm, m, refDateStr) {
    const wall = formatWallHour(hm);
    const mtz = meetingTz(m);
    if (!SHOW_ORGANISER_TIME_IN_GUTTER || mtz === tz) return wall;
    const dateStr = refDateStr || meetingTodayStr(m);
    const iso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    const local = new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    return `${local} (${wall})`;
  }

  /** Parse slot size or custom duration: plain minutes, 90m, 1.5h, 2,5h (comma decimal). */
  function parseDurationInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const normalized = s.replace(/,/g, '.');
    let m = normalized.match(/^(\d+(?:\.\d+)?)\s*h(?:r|ours?)?$/i);
    if (m) {
      const mins = Math.round(parseFloat(m[1]) * 60);
      return mins > 0 ? mins : null;
    }
    m = normalized.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?$/i);
    if (m) {
      const mins = Math.round(parseFloat(m[1]));
      return mins > 0 ? mins : null;
    }
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const mins = Math.round(parseFloat(normalized));
      return mins > 0 ? mins : null;
    }
    return null;
  }

  function formatDurationLabel(minutes) {
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if (m <= 0) return '0 min';
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h} h ${r} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  function formatDurationForInput(minutes) {
    return String(Math.max(1, Math.round(Number(minutes) || 60)));
  }

  function meetingSlotSteps(m) {
    const duration = Math.max(1, Number(m.duration_minutes) || 60);
    const gran = Math.max(1, Number(m.slot_granularity_minutes) || 30);
    const valid = duration % gran === 0;
    const steps = valid ? duration / gran : Math.max(1, Math.ceil(duration / gran));
    return { duration, gran, steps, valid };
  }

  function validateDurationSlotPair(duration, slot) {
    if (!duration || duration < 1) {
      return 'Enter a meeting length (plain minutes, or e.g. 60, 1.5h, 2,5h).';
    }
    if (!slot || slot < 1) {
      return 'Enter a calendar slot size (plain minutes, or e.g. 30, 15m).';
    }
    if (duration % slot !== 0) {
      return `Calendar slot (${formatDurationLabel(slot)}) must divide meeting length (${formatDurationLabel(duration)}) evenly.`;
    }
    return null;
  }

  function calendarNavHint(m) {
    const { duration, gran, steps, valid } = meetingSlotSteps(m);
    const slotPart = valid && steps > 1
      ? ` Select ${steps} consecutive ${formatDurationLabel(gran)} slot(s) to cover the full ${formatDurationLabel(duration)} meeting.`
      : valid
        ? ` Each slot is ${formatDurationLabel(gran)} — one slot covers the full meeting.`
        : '';
    return slotPart;
  }

  function minutesBetweenTimes(startStr, endStr) {
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    let mins = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
    if (mins <= 0) mins += 24 * 60;
    return mins;
  }

  function slotCellTip(m, baseTip) {
    const { steps, valid, gran } = meetingSlotSteps(m);
    if (valid && steps > 1) {
      return `${baseTip} · ${steps} consecutive ${formatDurationLabel(gran)} slots = full meeting`;
    }
    if (valid) return `${baseTip} · one slot = full meeting`;
    return baseTip;
  }

  function tabFromUrl() {
    const t = new URLSearchParams(window.location.search).get('view');
    if (t === 'notes' || t === 'records') return 'agenda';
    const valid = ['getting-started', 'overview', 'attendees', 'calendar', 'group', 'locations', 'agenda', 'options'];
    return valid.includes(t) ? t : null;
  }

  function isValidIanaTimezone(id) {
    if (!id) return false;
    try { Intl.DateTimeFormat(undefined, { timeZone: id }); return true; } catch (_) { return false; }
  }

  function normalizeTimezone(raw, fallback = tz) {
    const s = String(raw || '').trim();
    if (!s) return isValidIanaTimezone(fallback) ? fallback : 'UTC';
    const alias = TZ_ALIASES[s.toUpperCase()];
    if (alias) return alias;
    if (isValidIanaTimezone(s)) return s;
    return isValidIanaTimezone(fallback) ? fallback : 'UTC';
  }

  function timezoneLabel(id) {
    try {
      const short = new Intl.DateTimeFormat('en', { timeZone: id, timeZoneName: 'short' })
        .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value;
      return short ? `${id} (${short})` : id;
    } catch (_) { return id; }
  }

  function timezoneRegion(id) {
    if (id === 'UTC' || id.startsWith('Etc/')) return 'UTC';
    const i = id.indexOf('/');
    if (i < 0) return 'Other';
    const prefix = id.slice(0, i);
    if (TZ_REGION_ORDER.includes(prefix)) return prefix;
    return 'Other';
  }

  function timezoneOptions(selected) {
    const current = normalizeTimezone(selected);
    const all = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : WORLD_SHORTLIST;
    const ids = [...new Set([current, tz, ...WORLD_SHORTLIST, ...all])];
    const shortSet = new Set(WORLD_SHORTLIST);
    const groups = new Map();
    for (const id of ids) {
      const region = shortSet.has(id) ? 'Shortlist' : timezoneRegion(id);
      if (!groups.has(region)) groups.set(region, []);
      groups.get(region).push(id);
    }
    const order = TZ_REGION_ORDER.filter((r) => groups.has(r));
    for (const r of groups.keys()) {
      if (!order.includes(r)) order.push(r);
    }
    return order.map((region) => {
      const list = groups.get(region).slice().sort((a, b) => a.localeCompare(b));
      const label = region === 'Shortlist'
        ? 'World shortlist (common cities)'
        : region === 'UTC' ? 'UTC' : region;
      return `<optgroup label="${escapeHtml(label)}">${list.map((id) => {
        const mine = id === tz ? ' — your timezone' : '';
        return `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(timezoneLabel(id))}${mine}</option>`;
      }).join('')}</optgroup>`;
    }).join('');
  }

  async function repairMeetingTimezone(state) {
    if (!state.meet.timezone_needs_save) return;
    const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
    if (!me?.is_organizer) return;
    try {
      const data = await apiPost({
        action: 'update_meta', slug: state.slug,
        acting_attendee_id: state.attendeeId,
        timezone: normalizeTimezone(state.meet.timezone),
      });
      state.meet = data.meet;
    } catch (_) {}
  }

  function meetingTz(m) { return normalizeTimezone(m.timezone); }

  function wallTimeToUtcIso(y, mo, d, h, mi, timeZone) {
    let t = Date.UTC(y, mo - 1, d, h, mi);
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date(t)).map((x) => [x.type, x.value])
      );
      t += Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return new Date(t).toISOString();
  }

  function slotIsoFromMeetingDate(dateStr, hm, timeZone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return wallTimeToUtcIso(y, mo, d, hm.hour, hm.minute, timeZone);
  }

  function formatSlotInTz(iso, timeZone) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
    });
  }

  function formatDayHeadDateStr(dateStr, timeZone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(wallTimeToUtcIso(y, mo, d, 12, 0, timeZone)).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone,
    });
  }

  function formatWallHour(hm) {
    return `${String(hm.hour).padStart(2, '0')}:${String(hm.minute).padStart(2, '0')}`;
  }

  function setTab(state, tab) {
    state.activeTab = tab;
    if (tab === 'calendar') state.scrollCalendarOnRender = true;
    localStorage.setItem(tabKey(state.slug), tab);
    history.replaceState(null, '', meetingUrl(state.slug, tab));
    wireOperationsLink(state.slug);
  }

  function meetingUrl(slug, view) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const v = view ? `&view=${encodeURIComponent(view)}` : '';
    return `${base}?=${encodeURIComponent(slug)}${v}`;
  }

  function gotoTab(root, state, tab) {
    setTab(state, tab);
    render(root, state);
  }

  function attendeeKey(slug) { return `meet_attendee_${slug}`; }
  function slotsKey(slug, id) { return `meet_slots_${slug}_${id}`; }
  function tabKey(slug) { return `meet_tab_${slug}`; }
  function overviewHelpKey(slug) { return `meet_overview_help_${slug}`; }
  function groupHoursKey(slug) { return `meet_group_hours_${slug}`; }
  function setupOptionsSavedKey(slug) { return `meet_setup_options_saved_${slug}`; }
  function setupLinkCopiedKey(slug) { return `meet_setup_link_copied_${slug}`; }
  function paneStorageKey(slug, paneId) { return `meet_pane_${slug}_${paneId}`; }

  function paneIsOpen(state, paneId, { secondary = false } = {}) {
    const stored = localStorage.getItem(paneStorageKey(state.slug, paneId));
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
    return !secondary;
  }

  function paneOpenAttr(state, paneId, { secondary = false } = {}) {
    return paneIsOpen(state, paneId, { secondary }) ? ' open' : '';
  }

  function paneDetailsAttrs(state, paneId, { secondary = false, extraClass = '' } = {}) {
    const cls = ['pane-details', 'pane-region', extraClass].filter(Boolean).join(' ');
    return `class="${cls}" data-pane-id="${escapeHtml(paneId)}"${secondary ? ' data-pane-secondary' : ''}${paneOpenAttr(state, paneId, { secondary })}`;
  }

  function savePaneOpenState(state, el) {
    const id = el?.dataset?.paneId;
    if (!id) return;
    localStorage.setItem(paneStorageKey(state.slug, id), el.open ? 'open' : 'closed');
  }

  function wireOperationsLink(slug) {
    const link = document.querySelector('.site-footer a[href="operations.php"]');
    if (!link) return;
    const back = meetingUrl(slug, tabFromUrl() || undefined);
    link.href = `operations.php?back=${encodeURIComponent(back)}`;
  }

  function setupChecklistState(m, state, attendee) {
    const isOrg = !!attendee?.is_organizer;
    const stepSelf = !!attendee;
    const stepOptions = localStorage.getItem(setupOptionsSavedKey(state.slug)) === 'yes'
      || !!(m.title?.trim());
    const stepResources = !!(m.organizer_intro?.trim() || m.agenda?.length || m.decisions?.length
      || (m.notes || '').trim() || m.attachments?.length);
    const stepOthers = (m.attendees?.length || 0) > 1;
    const stepAvail = !!attendee && countSlotsFor(m, attendee.id) > 0;
    const stepLocations = (m.locations?.length || 0) > 0;
    const stepConfirm = !!m.confirmed_slot;
    const stepShare = localStorage.getItem(setupLinkCopiedKey(state.slug)) === 'yes'
      || (m.attendees?.length || 0) > 1;
    const allDone = stepSelf && stepOptions && stepAvail && stepShare;
    return {
      isOrg, stepSelf, stepOptions, stepResources, stepOthers, stepAvail, stepLocations,
      stepConfirm, stepShare, allDone,
    };
  }

  function restoreAttendeeSelections(state) {
    if (!state.attendeeId) return;
    state.selectedSlots.clear();
    for (const [iso, ids] of Object.entries(state.meet.availability || {})) {
      if ((ids || []).includes(state.attendeeId)) state.selectedSlots.add(iso);
    }
    const saved = localStorage.getItem(slotsKey(state.slug, state.attendeeId));
    if (saved) {
      try { JSON.parse(saved).forEach((s) => state.selectedSlots.add(s)); } catch (_) {}
    }
    (state.meet.location_preferences[state.attendeeId] || []).forEach((id) => state.selectedLocations.add(id));
  }

  async function tryAutoLoginFromFind(state) {
    if (state.attendeeId) return;
    const raw = sessionStorage.getItem(`meet_auto_claim_${state.slug}`);
    if (!raw) return;
    sessionStorage.removeItem(`meet_auto_claim_${state.slug}`);
    let identity;
    try { identity = JSON.parse(raw); } catch (_) { return; }
    let attendeeId = String(identity.attendee_id || '').trim();
    if (!attendeeId) {
      const nameKey = String(identity.display_name || '').trim().toLowerCase();
      const match = state.meet.attendees.find((a) => a.display_name.trim().toLowerCase() === nameKey);
      if (match) attendeeId = match.id;
    }
    if (!attendeeId) return;
    const target = state.meet.attendees.find((a) => a.id === attendeeId);
    if (!target) return;
    try {
      const data = await apiPost({
        action: 'claim',
        slug: state.slug,
        attendee_id: attendeeId,
        pin: identity.pin || undefined,
      });
      state.attendeeId = data.attendee_id;
      localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
      restoreAttendeeSelections(state);
    } catch (_) { /* user can sign in manually on Attendees */ }
  }

  async function fetchMeet(slug) {
    const res = await fetch(`api.php?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load meeting');
    return data.meet;
  }

  async function apiPost(body) {
    const res = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ─── Tab definitions ─────────────────────────────────────────────────────────

  const TAB_DEFS = [
    { id: 'getting-started', label: 'Getting started', tip: 'Step-by-step checklist for setting up this meeting.' },
    { id: 'overview',   label: 'Overview',          tip: 'Summary of the meeting — status, attendees, and best overlap times.' },
    { id: 'attendees',  label: 'Attendees',          tip: 'Register yourself, add others, and manage the attendee list.' },
    { id: 'locations',  label: 'Locations',          tip: 'Propose meeting locations and mark your preferences.' },
    { id: 'calendar',   label: 'My availability',   tip: 'Mark when you are free. Each cell is one calendar slot; select consecutive slots for the full meeting length. Use ◀ ▶ beside dates to move by weekday.' },
    { id: 'agenda',     label: 'Meeting Resources', tip: 'Description, agenda, decisions, notes, and attachments (pre- and post-meeting assets).' },
    { id: 'options',    label: 'Calendar Options',    tip: 'Meeting length (minutes, hours, or AM/PM), calendar slot size (partial availability), bookable dates and hours. Organiser only.' },
    { id: 'group',      label: 'Set confirmed meeting details', tip: 'Group calendar: everyone’s availability on one grid. Organiser picks start time (partial overlap OK) and location(s). Use ◀ ▶ beside dates to move by weekday.' },
  ];

  function allValidTabs(m, attendee) {
    return TAB_DEFS.map((t) => t.id);
  }

  function canEditOptions(m, attendee) {
    return !m.attendees.length || !!attendee?.is_organizer;
  }

  function canShowOptions(m, attendee) {
    return true;
  }

  function meetingEstablished(m) {
    return (m.attendees?.length || 0) > 0;
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  function render(root, state) {
    const m = state.meet;
    const attendee = m.attendees.find((a) => a.id === state.attendeeId);
    const scrollY = window.scrollY;
    const scrollTarget = state.scrollAfterRender || null;
    state.scrollAfterRender = null;
    const narrow = isNarrowScreen();
    const compactHeader = narrow && !state.headerExpanded;

    root.innerHTML = `
      <div class="meet-shell">
        <div class="sticky-top${compactHeader ? ' sticky-top-compact' : ''}">
          <div class="sticky-top-inner">
            <div class="sticky-head row">
              <h1 class="meet-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h1>
              <div class="row sticky-head-actions">
                ${narrow ? `<button type="button" class="compact-btn header-toggle-btn" data-action="toggle-header" title="Collapse/Expand for narrow screens">${compactHeader ? 'More ▾' : 'Less ▴'}</button>` : ''}
                <button type="button" class="compact-btn header-help-btn" data-action="toggle-help" title="How to use this meeting scheduler">How to use this</button>
                <button type="button" class="compact-btn" data-action="copy-link" title="Copy meeting link">Copy meeting link</button>
              </div>
            </div>
            ${attendee ? renderSignedInBanner(attendee) : ''}
            ${compactHeader ? renderMeetingStatusCompact(m, state) : ''}
            ${!compactHeader ? renderMeetingStatus(m, state) : ''}
            <nav class="dashboard-nav" aria-label="Meeting sections">
              ${renderDashboardNav(m, state, attendee)}
            </nav>
          </div>
        </div>
        ${state.helpOpen ? `<div class="help-panel-outer">${renderHelpPanel(m, attendee)}</div>` : ''}
        <div class="meet-content">
          ${state.activeTab === 'getting-started' ? renderGettingStartedTab(m, state, attendee) : ''}
          ${state.activeTab === 'overview'  ? renderOverviewTab(m, state, attendee) : ''}
          ${state.activeTab === 'attendees' ? renderAttendeesTab(m, state, attendee) : ''}
          ${state.activeTab === 'calendar'  ? renderCalendarTab(m, state, attendee) : ''}
          ${state.activeTab === 'group'     ? renderGroupAvailabilityTab(m, state, attendee) : ''}
          ${state.activeTab === 'locations' ? renderLocationsTab(m, state, attendee) : ''}
          ${state.activeTab === 'agenda'    ? renderAgendaTab(m, state, attendee) : ''}
          ${state.activeTab === 'options'   ? renderOptionsTab(m, state, attendee) : ''}
        </div>
      </div>
      <div class="toast" id="toast"></div>
    `;

    if (scrollTarget) {
      requestAnimationFrame(() => {
        root.querySelector(`.${scrollTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      window.scrollTo(0, scrollY);
    }
    afterRenderScroll(root, state);
    syncClearPinFields(root.querySelector('.edit-attendee-form'));
  }

  function syncClearPinFields(form) {
    if (!form) return;
    const clearing = form.querySelector('[name="clear_pin"]')?.checked;
    const newPinField = form.querySelector('[data-clear-pin-target]');
    const newPinInput = form.querySelector('[name="new_pin"]');
    if (newPinField) newPinField.hidden = !!clearing;
    if (newPinInput) {
      newPinInput.disabled = !!clearing;
      if (clearing) newPinInput.value = '';
    }
  }

  function afterRenderScroll(root, state) {
    const sticky = root.querySelector('.sticky-top');
    if (sticky) {
      document.documentElement.style.setProperty('--sticky-h', `${Math.ceil(sticky.getBoundingClientRect().height)}px`);
    }
  }

  // ─── Dashboard nav ───────────────────────────────────────────────────────────

  function renderSignedInBanner(attendee) {
    const role = attendee.is_organizer ? 'Organiser' : 'Attendee';
    return `<p class="meta signed-in-banner" title="Manage attendee identities on the Attendees tab">Currently signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong> (${role})</p>`;
  }

  function renderDashboardNav(m, state, attendee) {
    return TAB_DEFS
      .map((t) => {
        const active = state.activeTab === t.id;
        return `<button type="button" class="dash-btn${active ? ' active' : ''}" data-action="tab" data-tab="${t.id}" title="${escapeHtml(t.tip)}">${escapeHtml(t.label)}</button>`;
      }).join('');
  }

  // ─── Meeting status strip ────────────────────────────────────────────────────

  function rescheduledKey(slug) { return `meet_rescheduled_${slug}`; }

  const STATUS_LABELS = {
    organiser: 'Entering organiser details',
    attendee: 'Entering attendee details',
    scheduled: 'Scheduled',
    rescheduled: 'Rescheduled',
    past: 'Past',
    summarised: 'Summarised',
  };

  const STATUS_TIP = 'Status progresses as the meeting is set up: entering details → Scheduled (organiser accepted a start) → Rescheduled if changed → Past / Summarised after the start. Organisers set and can change the accepted time and location.';

  function meetingStatusKind(m, state) {
    if (!m.attendees.length) return 'organiser';
    if (!m.confirmed_slot) return 'attendee';
    const start = new Date(m.confirmed_slot).getTime();
    if (Date.now() > start) {
      return (m.attachments || []).length > 0 ? 'summarised' : 'past';
    }
    const wasRescheduled = state.wasRescheduled || localStorage.getItem(rescheduledKey(state.slug)) === 'yes';
    return wasRescheduled ? 'rescheduled' : 'scheduled';
  }

  function renderMeetingStatusCompact(m, state) {
    const label = STATUS_LABELS[meetingStatusKind(m, state)];
    return `<div class="status-strip status-strip-compact" title="${escapeHtml(STATUS_TIP)}">
      <span class="status-label">Status:</span>
      <span class="status-value">${escapeHtml(label)}</span>
    </div>`;
  }

  function renderMeetingStatus(m, state) {
    const kind = meetingStatusKind(m, state);
    const label = STATUS_LABELS[kind];
    const scheduled = kind === 'scheduled' || kind === 'rescheduled' || kind === 'past' || kind === 'summarised';
    const recurrenceLabel = escapeHtml(m.recurrence_label || 'One-off');
    let timeHtml;
    if (scheduled) {
      timeHtml = `<span class="meta">Time: ${formatTimePair(m.confirmed_slot)}</span>`;
    } else {
      const pendingSlot = effectiveConfirmSlot(state, m);
      timeHtml = pendingSlot
        ? `<span class="meta">Time (proposed): ${formatTimePair(pendingSlot)}</span>`
        : '<span class="meta">No date and time selected</span>';
    }
    const recurrenceHtml = `<span class="meta">Recurrence: ${recurrenceLabel}</span>`;
    const locIds = confirmedLocationIdsForDisplay(m, state);
    const hasConfirmedLocs = effectiveConfirmedLocationIds(state, m).length > 0;
    const locLabel = scheduled || hasConfirmedLocs ? 'Locations' : 'Locations (proposed)';
    const locHtml = locIds.length
      ? `<span class="meta">${locLabel}: ${locIds.map((id) => locationInlineHtml(m, id)).join('; ')}</span>`
      : '<span class="meta">No locations confirmed</span>';
    return `<div class="status-strip" title="${escapeHtml(STATUS_TIP)}">
      <span class="status-label">Status:</span>
      <span class="status-value">${escapeHtml(label)}</span>
      ${timeHtml}
      ${recurrenceHtml}
      ${locHtml}
      ${renderStatusDescription(m)}
    </div>`;
  }

  function renderStatusDescription(m) {
    const desc = (m.organizer_intro || '').trim();
    const plain = desc ? desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const preview = plain ? plain.slice(0, 72) + (plain.length > 72 ? '…' : '') : 'Set in meeting resources.';
    const body = desc
      ? `<div class="meet-intro-body status-desc-body">${sanitizeHtml(desc)}</div>`
      : '<p class="meta">No description yet — set one in <strong>Meeting Resources</strong>.</p>';
    return `<details class="status-desc"${autoDetailsOpen(false) ? ' open' : ''}>
      <summary class="meta status-desc-summary">Description: ${escapeHtml(preview)}</summary>
      ${body}
    </details>`;
  }

  // ─── Help panel ──────────────────────────────────────────────────────────────

  function renderHelpPanel(m, attendee) {
    const established = meetingEstablished(m);
    return `
      <div class="help-panel" id="help-panel">
        <div class="help-panel-inner">
          <div class="help-panel-header row">
            <strong>How to use this meeting scheduler</strong>
            <button type="button" class="btn-cancel compact-btn" data-action="toggle-help" title="Close help panel">Close</button>
          </div>
          <p class="meta help-tooltip-note">Most fields have tooltips on hover (may not show on mobile). Coloured panes group related topics — dates &amp; times (lavender), free text (blue), people (pink), places (green), attachments (amber).</p>
          <div class="help-columns">
            <div class="help-col">
              <h3 class="help-heading">Setting up a meeting (organiser)</h3>
              <ol class="help-steps">
                <li><strong>Attendees</strong> — add yourself first. You become the organiser. Optionally set a passcode so you can find this meeting from the home page later.</li>
                <li><strong>Calendar Options</strong> — meeting length (whole meeting), calendar slot size (partial availability — must divide meeting length evenly), AM/PM half-day presets, bookable dates and daily hours, timezone. Save when done.</li>
                <li><strong>Meeting Resources</strong> — optional description, agenda, decisions, notes, attachments (pre- and post-meeting).</li>
                <li><strong>My availability</strong> — mark when you are free. Select enough consecutive slots for the full meeting length if you can. Press <em>Save</em>.</li>
                <li><strong>Locations</strong> — propose online and/or physical places; attendees vote which work for them.</li>
                <li><strong>Share the link</strong> — <em>Copy meeting link</em> and send it to attendees.</li>
                <li><strong>Set confirmed meeting details</strong> — <em>Group calendar</em>: everyone’s marks on one grid. Organiser picks start and location(s), then accepts. Partial overlap is OK.</li>
              </ol>
            </div>
            <div class="help-col">
              <h3 class="help-heading">Joining a meeting (attendee)</h3>
              <ol class="help-steps">
                <li>Open the meeting link you were sent. You will see the meeting title and current status.</li>
                <li>Go to <strong>Attendees</strong>. If you are already listed, tick <em>Me</em> on your row and enter your passcode if prompted. If you are not listed, fill in the <em>Add new attendee</em> form with your name.</li>
                <li>Open <strong>My availability</strong> and mark every slot when you are free. Select enough consecutive slots to cover the full meeting if you can — finer slots mean you can also mark partial availability. Press <em>Save</em>. You can come back and update this any time — clicking a previously selected slot deselects it, so remember to save again.</li>
                <li>Open <strong>Locations</strong> to see any proposed venues. Click locations that work for you (blue means saved). Click again to remove. You can also propose a new location.</li>
                <li>Open <strong>Set confirmed meeting details</strong> to see the <em>Group calendar</em> — how times overlap and what is proposed or scheduled.</li>
                <li>Check the top status line for the current scheduled time and location.</li>
                <li>Repeat any of these steps as the meeting evolves — there is no fixed order.</li>
              </ol>
            </div>
          </div>
          <div class="help-footer">
            <p class="meta">The <strong>Copy meeting link</strong> button copies the meeting link. Save the link — it is the only way back to this meeting unless you set a passcode. The <em>Find my meetings</em> option on the home page lets you look up a meeting but requires a registered name and matching passcode.</p>
          </div>
          <div class="help-panel-footer-close row">
            <button type="button" class="btn-cancel compact-btn" data-action="toggle-help" title="Close help panel">Close / Collapse</button>
          </div>
        </div>
      </div>`;
  }

  // ─── Overview tab ────────────────────────────────────────────────────────────

  // ─── Getting started tab ─────────────────────────────────────────────────────

  function goTabLink(tab, linkText) {
    return `<button type="button" class="setup-tab-link" data-action="tab" data-tab="${tab}">${escapeHtml(linkText)}</button>`;
  }

  function formSaveHeader(buttonHtml) {
    if (!buttonHtml) return '';
    return `<div class="form-save-header row">${buttonHtml}</div>`;
  }

  function renderGettingStartedTab(m, state, attendee) {
    const setup = setupChecklistState(m, state, attendee);
    const go = (tab, label) => goTabLink(tab, label);
    return `
      <section class="panel stack overview-panel">
        <h2 class="section-title">Getting started</h2>
        <details class="getting-started-intro"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title">Instructions for organisers and attendees</summary>
          <p class="meta">Steps below are aimed at the meeting organiser. Attendees can skip organiser-only steps — full details in <strong>How to use this</strong> above. Essential steps: sign in on <strong>Attendees</strong>, mark <strong>My availability</strong>, vote on <strong>Locations</strong>. Optionally review everything!</p>
          <p class="meta">For fuller guidance, open <strong>How to use this</strong> at the top of the page, or the <a href="operations.php">operations manual</a>.</p>
        </details>
        <ol class="setup-steps">
          <li>
            <strong>${setup.stepSelf ? '✓ ' : ''}</strong>
            ${go('attendees', 'Go to Attendees')} and <strong>Add yourself as an attendee</strong> —
            First attendee becomes Meeting Organiser by default and can give others Organiser privilege.
          </li>
          <li>
            <strong>${setup.stepOptions ? '✓ ' : ''}Set Calendar Options</strong> —
            Organiser status required. Set <strong>meeting length</strong> (full meeting) and <strong>calendar slot size</strong> (partial availability — must divide meeting length evenly). Use <strong>AM/PM presets</strong> for half-day meetings if helpful. Also set earliest/latest dates, daily hours, weekends, and recurrence if needed.
            ${go('options', 'Go to Calendar Options')}
          </li>
          <li>
            <strong>${setup.stepResources ? '✓ ' : ''}(Optional)</strong>
            ${go('agenda', 'Go to Meeting Resources')} — Set/edit title, description, agenda, attachments, etc.
          </li>
          <li>
            <strong>${setup.stepOthers ? '✓ ' : ''}(Optional)</strong>
            ${go('attendees', 'Go to Attendees')} — Add others as proposed attendees.
            Anyone with the link can add themselves and others. Organisers can grant Organiser to registered attendees.
          </li>
          <li>
            <strong>${setup.stepAvail ? '✓ ' : ''}</strong>
            ${go('calendar', 'Go to My availability')} and select slots when you are free — use the green navigation buttons (◀ ▶ beside dates) to move by day or screen. Select enough consecutive slots to cover the full meeting if you can.
          </li>
          <li>
            <strong>${setup.stepLocations ? '✓ ' : ''}</strong>
            ${go('locations', 'Go to Locations')} — Propose locations (Online and/or Physical) for attendees to vote on.
            Any attendee can propose locations. Organisers can (re-)select a confirmed location at any time.
          </li>
          <li>
            <strong>${setup.stepConfirm ? '✓ ' : ''}Set Confirmed Meeting Details</strong> —
            Organiser status required. Pick an agreed meeting date, time and location(s). (Can be amended.)
            ${go('group', 'Go to Set confirmed meeting details')}
          </li>
          <li>
            <strong>${setup.stepShare ? '✓ ' : ''}Share the link</strong> —
            Copy meeting link and send it to all attendees so they can open this meeting and enter their availability.
            <span class="row setup-share-row">
              <button type="button" data-action="copy-link" title="Copy meeting link">Copy meeting link</button>
            </span>
          </li>
        </ol>
        ${setup.allDone ? '<p class="meta"><strong>Setup complete.</strong> You can keep using this checklist any time, or move on to Overview and the other tabs.</p>' : '<p class="meta">This checklist stays visible at all times.</p>'}
        <p class="meta">${go('overview', 'Go to Overview')}</p>
      </section>`;
  }

  // ─── Overview tab ────────────────────────────────────────────────────────────

  function renderOverviewTab(m, state, attendee) {
    const allSuggestions = overviewTimeSuggestions(m);
    const suggestionTotal = allSuggestions.length;
    const sorted = allSuggestions.slice(0, 10);
    const locationRanked = overviewLocationRankings(m);
    const locationTotal = locationRanked.length;
    const topLocations = locationRanked.slice(0, 3);
    const kind = meetingStatusKind(m, state);
    const agendaOpen = kind !== 'past' && kind !== 'summarised';
    const recordsOpen = kind === 'past' || kind === 'summarised';
    const availabilityCount = m.attendees.filter((a) => countSlotsFor(m, a.id) > 0).length;
    const scheduled = kind === 'scheduled' || kind === 'rescheduled' || kind === 'past' || kind === 'summarised';
    const pendingSlot = effectiveConfirmSlot(state, m);
    const timeSummary = scheduled && m.confirmed_slot
      ? formatTimePair(m.confirmed_slot)
      : (pendingSlot ? `${formatTimePair(pendingSlot)} (proposed)` : 'None selected yet');

    return `
      <section class="panel stack overview-panel">
        <h2 class="section-title overview-title">Overview <span class="label-hint">— tap ▸ headings to expand</span></h2>
        <p class="meta">Coloured sections group topics — lavender dates/times, blue text, pink people, green places, amber attachments.</p>
        <details class="overview-block tint-dates"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title" title="Tap or click the triangle to expand/collapse">Time · Recurrence · Locations</summary>
          <p class="meta"><strong>${scheduled ? 'Scheduled' : 'Proposed'} time:</strong> ${timeSummary}</p>
          <p class="meta"><strong>Meeting length:</strong> ${formatDurationLabel(m.duration_minutes)} · <strong>Calendar slot:</strong> ${formatDurationLabel(m.slot_granularity_minutes)}</p>
          <p class="meta"><strong>Recurrence:</strong> ${escapeHtml(m.recurrence_label || 'One-off')}</p>
          ${renderConfirmedLocationsSummary(m, state, scheduled)}
        </details>
        <details class="overview-block tint-text"${agendaOpen ? ' open' : ''}><summary class="section-title" title="Tap or click the triangle to expand/collapse">Agenda and decisions <span class="label-hint">(Set in Meeting Resources)</span></summary>
          ${m.agenda.length ? `<p class="meta"><strong>Agenda:</strong></p><ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet — go to <strong>Meeting Resources</strong> to set it.</p>'}
          ${m.decisions.length ? `<p class="meta"><strong>Decisions required:</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No decisions listed yet — go to <strong>Meeting Resources</strong> to set them.</p>'}
          ${(m.notes || '').trim() ? `<div class="meet-intro-body">${sanitizeHtml(m.notes)}</div>` : ''}
        </details>
        <details class="overview-block tint-people"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Attendees registered (${m.attendees.length}) · Availability entered (${availabilityCount})</summary>
          ${renderOverviewAttendeeTable(m)}
        </details>
        <details class="overview-block tint-dates"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Top start times (${Math.min(10, suggestionTotal)} of ${suggestionTotal}) — best attendance</summary>
          ${sorted.length
            ? `<ul class="list-plain">${sorted.map((s) => `<li>${formatOverviewTimeSuggestion(m, s)}</li>`).join('')}</ul>
               <p class="meta">Confirm one with <strong>Set confirmed meeting details</strong>. Includes times where everyone is free for the full meeting, and times with partial overlap.</p>`
            : '<p class="meta">No overlap times yet — attendees need to mark availability on <strong>My availability</strong>, then check <strong>Set confirmed meeting details</strong>.</p>'}
        </details>
        <details class="overview-block tint-places"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Top locations (${Math.min(3, locationTotal)} of ${locationTotal}) — by popularity</summary>
          ${topLocations.length
            ? `<ul class="list-plain">${topLocations.map((item) => `<li>${escapeHtml(locationChipLabel(item.loc))} — ${item.votes} preference${item.votes === 1 ? '' : 's'}</li>`).join('')}</ul>`
            : '<p class="meta">No locations proposed yet.</p>'}
        </details>
        ${recordsOpen && m.attachments.length ? `<details class="overview-block tint-assets" open><summary class="section-title" title="Tap or click the triangle to expand/collapse">Attachments (${m.attachments.length})</summary>
          ${m.attachments.map((a) => renderAttachment(a, attendee)).join('')}
        </details>` : ''}
      </section>`;
  }

  function renderLocationPopularitySummary(m) {
    if (!m.locations.length) return '<p class="meta">No locations proposed yet.</p>';
    const ranked = overviewLocationRankings(m).slice(0, 3);
    return `<ul class="list-plain">${ranked.map((item) => `<li>${escapeHtml(locationChipLabel(item.loc))} — ${item.votes} preference${item.votes === 1 ? '' : 's'}</li>`).join('')}</ul>`;
  }

  function overviewLocationRankings(m) {
    if (!m.locations.length) return [];
    const prefs = m.location_preferences || {};
    const counts = new Map(m.locations.map((loc) => [loc.id, 0]));
    Object.values(prefs).forEach((ids) => {
      (ids || []).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    return m.locations
      .map((loc) => ({ loc, votes: counts.get(loc.id) || 0 }))
      .sort((a, b) => b.votes - a.votes || a.loc.label.localeCompare(b.loc.label));
  }

  /** Merge full and partial overlap starts for Overview (partial-only was omitted before). */
  function overviewTimeSuggestions(m) {
    const total = m.attendees.length;
    const bySlot = new Map();
    for (const s of m.suggestions?.slots || []) {
      bySlot.set(s.slot, { slot: s.slot, fullCount: s.count, partialCount: 0, kind: 'full' });
    }
    for (const s of m.suggestions?.partial_slots || []) {
      if (bySlot.has(s.slot)) continue;
      bySlot.set(s.slot, {
        slot: s.slot,
        fullCount: (s.attendees_full || []).length,
        partialCount: (s.attendees_partial || []).length,
        kind: 'partial',
      });
    }
    return [...bySlot.values()].sort((a, b) => {
      if (b.fullCount !== a.fullCount) return b.fullCount - a.fullCount;
      if (b.partialCount !== a.partialCount) return b.partialCount - a.partialCount;
      return a.slot.localeCompare(b.slot);
    });
  }

  function formatOverviewTimeSuggestion(m, s) {
    const total = m.attendees.length;
    const durLabel = formatDurationLabel(m.duration_minutes);
    if (s.kind === 'full' || s.fullCount === total) {
      return `${formatTimePair(s.slot)} — ${s.fullCount} of ${total} free for full meeting (${durLabel})`;
    }
    if (s.fullCount > 0) {
      const partialNote = s.partialCount ? `; ${s.partialCount} partial` : '';
      return `${formatTimePair(s.slot)} — ${s.fullCount} of ${total} for full ${durLabel}${partialNote}`;
    }
    const marked = s.fullCount + s.partialCount;
    return `${formatTimePair(s.slot)} — ${marked} of ${total} marked (partial overlap)`;
  }

  function renderConfirmedLocationsSummary(m, state, scheduled) {
    const ids = scheduled && (m.confirmed_location_ids || []).length
      ? m.confirmed_location_ids
      : effectiveConfirmedLocationIds(state, m);
    const label = scheduled ? 'Confirmed locations' : 'Proposed locations';
    if (!ids.length) {
      return `<p class="meta"><strong>${label}:</strong> None yet</p>`;
    }
    return `<p class="meta"><strong>${label}:</strong> ${ids.map((id) => locationInlineHtml(m, id)).join('; ')}</p>`;
  }

  function renderOverviewAttendeeTable(m) {
    if (!m.attendees.length) return '<p class="meta">No attendees registered yet.</p>';
    return `<table class="data-table overview-attendee-table">
      <thead><tr><th>Name</th><th title="Count of locations marked OK with me">Time slots/locations</th><th>Role</th></tr></thead>
      <tbody>${m.attendees.map((a) => `<tr>
        <td>${escapeHtml(a.display_name)}</td>
        <td>${countLocationPrefsFor(m, a.id)}</td>
        <td>${a.is_organizer ? 'Organiser' : 'Attendee'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ─── Attendees tab ───────────────────────────────────────────────────────────

  function renderAttendeesTab(m, state, attendee) {
    return `<section class="panel stack">${renderAttendeesSection(m, state, attendee, { standalone: true })}</section>`;
  }

  // ─── Calendar tab ────────────────────────────────────────────────────────────

  function renderCalendarTab(m, state, attendee) {
    const dayCount = visibleDayCount();
    const days = getVisibleDays(calendarViewStart(state, m), dayCount, m.show_weekends);
    const mtz = meetingTz(m);
    const hours = buildHours(m.day_start, m.day_end, m.slot_granularity_minutes);
    const recurringSet = new Set(m.recurrence_dates || []);
    const todayStr = meetingTodayStr(m);
    const canGoBack = calendarViewStart(state, m) > parseDateIsoLocal(todayStr);
    const canGoForward = true;
    const slotHint = calendarNavHint(m);

    return `
      <section class="panel stack calendar-panel">
        <div class="availability-mark-band">
        <details class="calendar-instructions"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title" title="How to mark your availability on the calendar">Mark when you are free</summary>
          <p class="meta">Each cell is one <strong>calendar slot</strong> (${formatDurationLabel(m.slot_granularity_minutes)}). Drag or tap to select. Use <strong>Save</strong> in the band below the grid. Tap a selected slot again to deselect — save again after changes.</p>
          <p class="meta"><strong>Meeting length</strong> is ${formatDurationLabel(m.duration_minutes)}.${slotHint} Finer slots let you show partial availability if you cannot make the whole meeting.</p>
          <p class="meta slot-legend-note"><strong>Initials</strong> show who else chose that slot. A <strong>+</strong> means more people than fit in the cell.</p>
          <p class="meta">Use the date navigation (left of the grid) to move by day, screen, or jump to first/last bookable dates.</p>
          <p class="meta">Meeting hours ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} in <strong>${escapeHtml(mtz)}</strong>${SHOW_ORGANISER_TIME_IN_GUTTER && mtz !== tz ? ` · your timezone: <strong>${escapeHtml(tz)}</strong> (times at left show yours, organiser wall time in parentheses)` : ` (and UTC). Your browser timezone: <strong>${escapeHtml(tz)}</strong>.`}</p>
        </details>
        </div>
        ${!meetingEstablished(m) ? renderAttendeesSection(m, state, attendee) : ''}
        <div class="pane-region tint-dates calendar-grid-pane">
        <div class="calendar" style="--cal-cols:${days.length || dayCount}">
          ${renderCalendarHeader(days, { canGoBack, canGoForward, todayStr, m, recurringSet, mtz })}
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label" title="Time${SHOW_ORGANISER_TIME_IN_GUTTER && mtz !== tz ? ' — yours (organiser wall time in parentheses)' : ''}">${escapeHtml(formatWallHourDisplay(hm, m, days[0] ? toDateIso(days[0]) : todayStr))}</div>
              ${days.map((day, i) => renderSlotCell(m, state, toDateIso(day), hm, attendee, mtz, dayHasGapBefore(days, i))).join('')}
            `).join('')}
          </div>
        </div>
        </div>
        <div class="availability-save-band">
        ${renderSaveRow(state, m, { showTopDuplicate: false })}
        </div>
      </section>`;
  }

  function renderCalendarHeader(days, { canGoBack, canGoForward, canGoBackScreen, canGoForwardScreen, todayStr, m, recurringSet, mtz }) {
    const screenBack = canGoBackScreen !== false && canGoBack;
    const screenFwd = canGoForwardScreen !== false && canGoForward;
    return `
      <div class="cal-header cal-header-nav">
        <div class="time-gutter cal-nav-gutter" title="Day ◀▶ · screen «» · first/last ⇤⇥">
          <div class="cal-nav">
            <div class="cal-nav-row cal-nav-row-day">
              <button type="button" class="btn-nav cal-nav-btn" data-action="prev-days" title="Previous weekday" ${canGoBack ? '' : 'disabled'} aria-label="Previous day">◀</button>
              <button type="button" class="btn-nav cal-nav-btn" data-action="next-days" title="Next weekday" ${canGoForward ? '' : 'disabled'} aria-label="Next day">▶</button>
            </div>
            <div class="cal-nav-row cal-nav-row-screen">
              <button type="button" class="btn-nav cal-nav-btn cal-nav-screen" data-action="prev-screen" title="Back one screen of dates" ${screenBack ? '' : 'disabled'} aria-label="Previous screen">«</button>
              <button type="button" class="btn-nav cal-nav-btn cal-nav-screen" data-action="next-screen" title="Forward one screen of dates" ${screenFwd ? '' : 'disabled'} aria-label="Next screen">»</button>
            </div>
            <div class="cal-nav-row cal-nav-row-jump">
              <button type="button" class="btn-nav cal-nav-btn cal-nav-jump" data-action="go-range-start" title="Jump to earliest bookable date" ${canGoBack ? '' : 'disabled'} aria-label="First date">⇤</button>
              <button type="button" class="btn-nav cal-nav-btn cal-nav-jump" data-action="go-range-end" title="Jump to latest bookable date" ${canGoForward ? '' : 'disabled'} aria-label="Last date">⇥</button>
            </div>
          </div>
        </div>
        ${days.map((d, i) => {
          const dateStr = toDateIso(d);
          const gap = dayHasGapBefore(days, i);
          const isToday = dateStr === todayStr;
          const recur = recurringSet && recurringSet.has(dateStr);
          return `<div class="day-head${gap ? ' day-gap-before' : ''}${recur ? ' recurring' : ''}${isToday ? ' is-today' : ''}" title="${escapeHtml(formatDayHeadDateStr(dateStr, mtz))}${isToday ? ' — today' : ''}">${formatDayHeadDateStr(dateStr, mtz)}${isToday ? '<br><small>today</small>' : ''}${recur ? '<br><small>recurring</small>' : ''}</div>`;
        }).join('')}
      </div>`;
  }

  function renderSaveRow(state, m, { showTopDuplicate = true, showBottomButton = true } = {}) {
    if (!state.attendeeId) return '';
    const hint = isTouchUi ? 'tap slots to select' : 'drag or tap slots to select a range';
    const saveBtn = `<button type="button" data-action="save-availability" title="Save your currently selected availability slots to the meeting">Save</button>`;
    const count = state.selectedSlots.size;
    const slotMeta = m ? calendarNavHint(m).trim() : '';
    let html = '';
    if (showTopDuplicate) html += formSaveHeader(saveBtn);
    if (showBottomButton) {
      html += `<div class="row save-row calendar-save-row">${saveBtn}<span class="meta">${count} slot(s) selected · ${hint}${slotMeta ? ` · ${slotMeta}` : ''}</span></div>`;
    } else if (showTopDuplicate) {
      html += `<p class="meta">${count} slot(s) selected · ${hint}${slotMeta ? ` · ${slotMeta}` : ''}</p>`;
    }
    return html;
  }

  function renderSlotCell(m, state, dateStr, hm, attendee, mtz, gapBefore = false) {
    const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    const ids = availabilityIdsAt(m, slotIso);
    const initials = ids.map((id) => attendeeInitials(m, id)).filter(Boolean);
    const label = initials.length ? initials.slice(0, 3).join(' ') + (initials.length > 3 ? '+' : '') : '';
    const names = ids.map((id) => attendeeName(m, id)).join(', ');
    const tip = names
      ? `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)} · ${names}`
      : `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)}`;
    const cellTip = slotCellTip(m, tip);
    return `<button type="button" class="slot${slotSelectedByUser(state, m, slotIso, attendee?.id) ? ' selected' : ''}${ids.length ? ' suggested' : ''}${gapBefore ? ' day-gap-before' : ''}"
      data-action="toggle-slot" data-slot="${escapeHtml(slotIso)}" title="${escapeHtml(cellTip)}" ${attendee ? '' : 'disabled'}>
      ${label ? `<span class="slot-initials">${escapeHtml(label)}</span>` : ''}
      ${ids.length && !label ? `<span class="count">${ids.length}</span>` : ''}
    </button>`;
  }

  // ─── Group availability tab ──────────────────────────────────────────────────

  function renderGroupAvailabilityTab(m, state, attendee) {
    const mtz = meetingTz(m);
    const dayCount = visibleDayCount();
    const days = getVisibleDays(calendarViewStart(state, m), dayCount, m.show_weekends);
    const allHours = buildHours('00:00', '24:00', m.slot_granularity_minutes);
    const selected = effectiveConfirmSlot(state, m);
    const isOrg = !!attendee?.is_organizer;
    const todayStr = meetingTodayStr(m);
    const canGoBack = calendarViewStart(state, m) > parseDateIsoLocal(todayStr);
    const fullMap = new Map((m.suggestions?.slots || []).map((s) => [s.slot, s]));
    const partialMap = new Map((m.suggestions?.partial_slots || []).map((s) => [s.slot, s]));
    const hours = state.showAllGroupHours
      ? allHours
      : allHours.filter((hm) => groupHourHasSignal(m, days, hm, mtz, selected, fullMap, partialMap));
    // Keep a fixed number of day columns so the grid does not shrink to 2 or 1 days.
    const lastAvail = lastAvailabilityDay(m);
    const canGoForward = !lastAvail || startOfDay(days[days.length - 1]) < startOfDay(lastAvail);

    return `
      <section class="panel stack" id="meeting-availability-pane">
        <p class="meta pane-lead"><strong>Group calendar</strong> — everyone’s availability on one grid. Meeting length ${formatDurationLabel(m.duration_minutes)}; slots ${formatDurationLabel(m.slot_granularity_minutes)} each.${calendarNavHint(m)}</p>
        <details ${paneDetailsAttrs(state, 'group-link', { extraClass: 'tint-text confirm-section confirm-section-link' })}>
          <summary title="Share this link so others can open the meeting">Meeting link</summary>
          <div class="confirm-section-inner share-row row">
            <input class="share-input" type="text" readonly value="${escapeHtml(shareUrl(state.slug))}" id="share-url-input">
            <button type="button" class="compact-btn" data-action="copy-link" title="Copy meeting link to clipboard">Copy meeting link</button>
          </div>
        </details>
        <details ${paneDetailsAttrs(state, 'group-time', { extraClass: 'confirm-section confirm-section-time tint-dates' })}>
          <summary title="Pick a meeting start from the Group calendar">Proposed meeting time</summary>
          <div class="confirm-section-inner stack">
            ${renderAcceptTimeButton(isOrg, state, m)}
            <p class="meta">Click a slot to set the proposed start. Click again to clear. Times shown in your timezone and UTC.</p>
            <div class="row">
              <p class="meta"><strong>Currently selected meeting start:</strong> ${selected ? formatTimePair(selected) : 'none selected yet — tap a slot below to set it'}</p>
              <button type="button" class="btn-cancel compact-btn" data-action="toggle-group-hours" title="Show or hide hours with no availability marked">${state.showAllGroupHours ? 'Hide empty hours' : 'Show all hours'}</button>
            </div>
            ${!state.showAllGroupHours ? '<p class="meta">Empty time rows are hidden. Use "Show all hours" to display midnight-to-midnight.</p>' : ''}
            <div class="calendar group-calendar" style="--cal-cols:${days.length || dayCount}">
              ${renderCalendarHeader(days, { canGoBack, canGoForward, todayStr, m, recurringSet: null, mtz })}
              <div class="cal-body">
                ${hours.map((hm) => `
                  <div class="time-label" title="Time${SHOW_ORGANISER_TIME_IN_GUTTER && mtz !== tz ? ' — yours (organiser wall time in parentheses)' : ''}">${escapeHtml(formatWallHourDisplay(hm, m, days[0] ? toDateIso(days[0]) : todayStr))}</div>
                  ${days.map((day, i) => renderGroupSlotCell(m, toDateIso(day), hm, mtz, selected, fullMap, partialMap, dayHasGapBefore(days, i))).join('')}
                `).join('')}
              </div>
            </div>
            ${renderAcceptTimeButton(isOrg, state, m)}
          </div>
        </details>
        <p class="meta slot-legend-note"><strong>Initials</strong> in cells show who marked that slot on My availability.</p>
        <div class="row group-legend">
          <span class="legend-chip full" title="Every attendee marked enough consecutive slots for the full meeting length">Light green = all attendees, full meeting</span>
          <span class="legend-chip partial-full" title="Everyone marked something at this start, but not all for the full meeting length">Amber = all attendees, partial meeting</span>
          <span class="legend-chip partial" title="Some but not all attendees marked this start">Purple = some attendees available</span>
          <span class="legend-chip selected" title="Your current proposed start before Accept">Dark green border = selected start</span>
        </div>
        <details ${paneDetailsAttrs(state, 'group-locations', { extraClass: 'confirm-section confirm-section-locations tint-places' })}>
          <summary>Proposed locations</summary>
          <div class="confirm-section-inner">
            <p class="meta pane-lead">Organiser: toggle <strong>Confirmed</strong> (multiple allowed, e.g. one Online and one Meeting Room — saves immediately). Attendees propose and mark <strong>OK with me</strong> using the Locations tab.</p>
            ${renderLocationsTable(m, state, attendee, { showConfirm: true, isOrg, readOnly: true })}
          </div>
        </details>
      </section>`;
  }

  function renderAcceptTimeButton(isOrg, state, m) {
    const slot = effectiveConfirmSlot(state, m);
    const label = slot
      ? `Accept date: ${formatSlotLocal(slot)}`
      : 'Accept date: None proposed';
    if (!isOrg) {
      return `<button type="button" class="confirm-action-btn" data-action="confirm-time" disabled title="Organiser status required">${escapeHtml(label)}</button>`;
    }
    return `<button type="button" class="confirm-action-btn" data-action="confirm-time"${slot ? '' : ' disabled'} title="${slot ? 'Accept this start as the scheduled time' : 'Select a start slot below first'}">${escapeHtml(label)}</button>`;
  }

  function effectiveConfirmSlot(state, m) {
    if (state.pendingConfirmSlot === '') return '';
    if (state.pendingConfirmSlot) return state.pendingConfirmSlot;
    return m.confirmed_slot || '';
  }

  function effectiveConfirmLocationPhysical(state, m) {
    if (state.pendingConfirmLocationPhysical === '') return '';
    if (state.pendingConfirmLocationPhysical) return state.pendingConfirmLocationPhysical;
    return m.confirmed_location_physical || '';
  }

  function effectiveConfirmLocationOnline(state, m) {
    if (state.pendingConfirmLocationOnline === '') return '';
    if (state.pendingConfirmLocationOnline) return state.pendingConfirmLocationOnline;
    return m.confirmed_location_online || '';
  }

  function effectiveConfirmLocations(state, m) {
    return {
      physical: effectiveConfirmLocationPhysical(state, m),
      online: effectiveConfirmLocationOnline(state, m),
    };
  }

  /** Legacy helper: prefer online, else physical. */
  function effectiveConfirmLocation(state, m) {
    const locs = effectiveConfirmLocations(state, m);
    return locs.online || locs.physical || '';
  }

  function legacyConfirmedLocationIds(m) {
    const ids = [];
    const add = (id) => {
      const v = String(id || '').trim();
      if (v && !ids.includes(v)) ids.push(v);
    };
    (m.confirmed_location_ids || []).forEach(add);
    add(m.confirmed_location_online);
    add(m.confirmed_location_physical);
    add(m.confirmed_location);
    return ids;
  }

  function effectiveConfirmedLocationIds(state, m) {
    if (state.pendingConfirmedLocationIds !== null) {
      return [...state.pendingConfirmedLocationIds];
    }
    return legacyConfirmedLocationIds(m);
  }

  function confirmedLocationIdsForDisplay(m, state) {
    const scheduled = !!m.confirmed_slot && meetingStatusKind(m, state) !== 'attendee';
    if (scheduled && (m.confirmed_location_ids || []).length) {
      return m.confirmed_location_ids;
    }
    return effectiveConfirmedLocationIds(state, m);
  }

  function groupHourHasSignal(m, days, hm, mtz, selected, fullMap, partialMap) {
    return days.some((day) => {
      const slotIso = slotIsoFromMeetingDate(toDateIso(day), hm, mtz);
      if (slotIso === selected) return true;
      if (fullMap.has(slotIso) || partialMap.has(slotIso)) return true;
      return availabilityIdsAt(m, slotIso).length > 0;
    });
  }

  function groupDayHasSignal(m, day, hours, mtz, selected, fullMap, partialMap) {
    const dateStr = toDateIso(day);
    return hours.some((hm) => {
      const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
      if (slotIso === selected) return true;
      if (fullMap.has(slotIso) || partialMap.has(slotIso)) return true;
      return availabilityIdsAt(m, slotIso).length > 0;
    });
  }

  function renderConfirmLocationChoices(m, state, isOrg, selectedLocations) {
    if (!m.locations.length) return '<p class="meta">No proposed locations yet. Use the Locations tab to add one.</p>';
    return `<div class="chip-list">${m.locations.map((loc) => {
      const voters = attendeesForLocation(m, loc.id);
      const initials = voters.map((a) => a.initials || deriveInitials(a.display_name)).filter(Boolean).join(' ');
      const allPreferred = m.attendees.length > 0 && voters.length === m.attendees.length;
      const channel = locationConfirmChannel(loc);
      const isSelected = channel === 'both'
        ? selectedLocations.online === loc.id && selectedLocations.physical === loc.id
        : channel === 'online'
          ? selectedLocations.online === loc.id
          : selectedLocations.physical === loc.id;
      const title = voters.length
        ? `Preferred by: ${voters.map((a) => attendeeLabel(a)).join(', ')}`
        : 'No attendee preferences saved yet';
      return `<button type="button" class="chip confirm-loc-chip${allPreferred ? ' loc-all' : ''}${isSelected ? ' active selected-start' : ''}" data-action="pick-confirm-location" data-location-id="${escapeHtml(loc.id)}" ${isOrg ? '' : 'disabled'} title="${escapeHtml(title)}">${escapeHtml(locationChipLabel(loc))}${initials ? ` (${escapeHtml(initials)})` : ' (no preferences yet)'}</button>`;
    }).join('')}</div>`;
  }

  function attendeesForLocation(m, locationId) {
    const prefs = m.location_preferences || {};
    return m.attendees.filter((a) => (prefs[a.id] || []).includes(locationId));
  }

  function attendeesUnavailableForSlot(m, slotIso) {
    const ids = new Set(availabilityIdsAt(m, slotIso));
    return m.attendees.filter((a) => !ids.has(a.id));
  }

  function renderGroupSlotCell(m, dateStr, hm, mtz, selected, fullMap, partialMap, gapBefore = false) {
    const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    let cls = 'empty';
    let tip = `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)}`;
    let initials = '';
    const atSlotIds = availabilityIdsAt(m, slotIso);
    const allAtSlot = m.attendees.length > 0 && atSlotIds.length === m.attendees.length;
    if (fullMap.has(slotIso)) {
      const s = fullMap.get(slotIso);
      cls = 'full';
      tip += ` · all attendees free for full meeting (${s.count}/${m.attendees.length})`;
      initials = (s.attendees || []).map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else if (partialMap.has(slotIso)) {
      const p = partialMap.get(slotIso);
      const fullCount = (p.attendees_full || []).length;
      if (fullCount === m.attendees.length) {
        cls = 'full';
        tip += ` · all attendees free for full meeting (${fullCount}/${m.attendees.length})`;
      } else if (allAtSlot || fullCount > 0) {
        cls = 'partial-full';
        tip += fullCount > 0
          ? ` · ${fullCount}/${m.attendees.length} free for full meeting; others partial or absent`
          : ' · all attendees marked at this start, but not for the full meeting duration';
      } else {
        cls = 'partial';
        tip += ' · some attendees available (not full duration for everyone)';
      }
      const idList = (p.attendees_full || []).length
        ? p.attendees_full
        : atSlotIds;
      initials = idList.map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else if (atSlotIds.length) {
      // Fallback when suggestion maps miss a slot: judge duration locally
      const fullIds = attendeesFullForStart(m, slotIso);
      if (fullIds.length === m.attendees.length && m.attendees.length > 0) {
        cls = 'full';
        tip += ` · all attendees free for full meeting (${fullIds.length}/${m.attendees.length})`;
      } else if (allAtSlot) {
        cls = 'partial-full';
        tip += ' · all attendees marked at this start, but not for the full meeting duration';
      } else {
        cls = 'partial';
        tip += ' · some attendees available';
      }
      initials = atSlotIds.map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else {
      tip += ' · no availability marked';
    }
    const selectedClass = selected === slotIso ? ' selected-start' : '';
    const gapClass = gapBefore ? ' day-gap-before' : '';
    return `<button type="button" class="slot group-slot ${cls}${selectedClass}${gapClass}" data-action="use-slot" data-slot="${escapeHtml(slotIso)}" title="${escapeHtml(tip)}">${initials ? `<span class="slot-initials">${escapeHtml(initials)}</span>` : ''}</button>`;
  }

  /** Attendee ids who are free for the whole meeting window starting at slotIso. */
  function attendeesFullForStart(m, slotIso) {
    const { duration, gran, steps, valid } = meetingSlotSteps(m);
    const stepCount = valid ? steps : Math.max(1, Math.ceil(duration / gran));
    const startMs = new Date(slotIso).getTime();
    if (Number.isNaN(startMs)) return [];
    const windowKeys = [];
    for (let i = 0; i < stepCount; i++) {
      windowKeys.push(new Date(startMs + i * gran * 60000).toISOString());
    }
    return m.attendees
      .map((a) => a.id)
      .filter((id) => windowKeys.every((key) => {
        const ids = m.availability?.[key] || availabilityIdsAt(m, key);
        return ids.includes(id);
      }));
  }

  function availabilityIdsAt(m, iso) {
    if (m.availability?.[iso]) return m.availability[iso];
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return [];
    for (const [key, ids] of Object.entries(m.availability || {})) {
      if (new Date(key).getTime() === target) return ids;
    }
    return [];
  }

  // ─── Locations tab ───────────────────────────────────────────────────────────

  function locationRowFields(loc) {
    if (!loc) return { notes: '', location: '' };
    if (loc.kind === 'row') {
      try {
        const o = JSON.parse(loc.detail || '{}');
        const generic = loc.label === 'Online' || loc.label === 'Physical';
        const online = o.online || '';
        const physical = o.physical || '';
        return {
          notes: generic ? '' : (loc.label || ''),
          location: locationDisplayFromParts(online, physical),
        };
      } catch (_) {
        return { notes: loc.label || '', location: loc.detail || '' };
      }
    }
    if (['video', 'phone', 'hybrid'].includes(loc.kind)) {
      const url = extractUrlFromDetail(loc.detail) || loc.detail || '';
      return { notes: loc.label || '', location: url };
    }
    return {
      notes: loc.label || '',
      location: String(loc.detail || '').trim(),
    };
  }

  function locationDisplayFromParts(online, physical) {
    if (online && physical) return `${online} · ${physical}`;
    return online || physical || '';
  }

  /** @deprecated Legacy helper for unused chip UI */
  function locationConfirmChannel(loc) {
    const f = locationRowFields(loc);
    const parsed = parseLocationFieldText(f.location);
    if (parsed.online && parsed.physical) return 'both';
    if (parsed.online) return 'online';
    return 'physical';
  }

  function looksLikeMalformedUrl(text) {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (/^https?:\/\//i.test(raw) || isWellFormedUrl(normalizeExternalUrl(raw))) return false;
    const markers = ['/', '.', 'ww', ':', 'ttp'];
    let count = 0;
    for (const m of markers) if (raw.includes(m)) count++;
    return count >= 3;
  }

  function parseLocationFieldText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { online: '', physical: '' };
    if (/^https?:\/\//i.test(raw) || isWellFormedUrl(normalizeExternalUrl(raw))) {
      return { online: normalizeExternalUrl(raw), physical: '' };
    }
    if (looksLikeMalformedUrl(raw)) {
      return { online: '', physical: raw, malformedUrl: true };
    }
    return { online: '', physical: raw };
  }

  function readLocationRowInputs(row) {
    const notes = row.querySelector('[data-loc-field="notes"]')?.value.trim() || '';
    const location = row.querySelector('[data-loc-field="location"]')?.value.trim() || '';
    const parsed = parseLocationFieldText(location);
    return { notes, ...parsed };
  }

  function locationRowSnapshot(row) {
    const { notes, online, physical } = readLocationRowInputs(row);
    return JSON.stringify({
      notes,
      location: locationDisplayFromParts(online, physical),
    });
  }

  function selectElementContents(el) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch (_) { /* ignore */ }
  }

  function renderLocFieldDisplay(m, state, locId, field, value, { readOnly }) {
    if (!value) return '—';
    const key = `${locId || 'new'}:${field}`;
    const expanded = state.expandedLocFields?.has(key);
    const href = field === 'location' ? normalizeExternalUrl(value) : '';
    const isUrl = field === 'location' && isWellFormedUrl(href);

    if (readOnly && isUrl) {
      if (!expanded && value.length <= 48) {
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
      }
      if (expanded) {
        return `<span class="loc-url-wrap">
          <span class="loc-selectable-text loc-url-full" data-loc-select="${escapeHtml(key)}" tabindex="0" title="Full link — selected for copy">${escapeHtml(value)}</span>
          <span class="loc-url-actions row">
            <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="compact-btn">Open</a>
            <button type="button" class="compact-btn" data-action="copy-loc-url" data-url="${escapeHtml(href)}" title="Copy link to clipboard">Copy</button>
          </span>
        </span>`;
      }
      const shown = `${value.slice(0, 45)}…`;
      return `<button type="button" class="loc-expand-btn loc-url-text" data-action="expand-loc-cell" data-loc-expand="${escapeHtml(key)}" title="Show full link (selects all for copy)">${escapeHtml(shown)}</button>`;
    }

    if (readOnly) {
      const lines = String(value).split('\n');
      const needsClamp = !expanded && (lines.length > 3 || String(value).length > 120);
      if (needsClamp) {
        return `<button type="button" class="loc-expand-btn loc-text-clamp" data-action="expand-loc-cell" data-loc-expand="${escapeHtml(key)}" title="Show all (selects for copy)">${escapeHtml(value)}</button>`;
      }
      if (expanded) {
        return `<span class="loc-selectable-text loc-text-full" data-loc-select="${escapeHtml(key)}" tabindex="0">${escapeHtml(value)}</span>`;
      }
    }

    return escapeHtml(value);
  }

  function renderLocationRowCells(m, state, attendee, loc, { showConfirm = false, isOrg = false, readOnly = false } = {}) {
    const id = loc?.id || '';
    const f = locationRowFields(loc);
    const canEdit = !!attendee && !readOnly;
    const voters = loc ? attendeesForLocation(m, loc.id) : [];
    const initials = voters.map((a) => a.initials || deriveInitials(a.display_name)).filter(Boolean).join(' ');
    const worksSelected = loc && attendee && state.selectedLocations.has(loc.id);
    const confirmedIds = effectiveConfirmedLocationIds(state, m);
    const isConfirmed = loc && confirmedIds.includes(loc.id);

    const notesCell = canEdit
      ? `<textarea class="loc-cell loc-cell-textarea" data-loc-field="notes" rows="3" placeholder="Notes" title="Notes">${escapeHtml(f.notes)}</textarea>`
      : renderLocFieldDisplay(m, state, id, 'notes', f.notes, { readOnly: true });

    const locationCell = canEdit
      ? `<input type="text" class="loc-cell" data-loc-field="location" value="${escapeHtml(f.location)}" placeholder="URL or place name" title="URL or place name">`
      : renderLocFieldDisplay(m, state, id, 'location', f.location, { readOnly: true });

    const worksCell = !loc
      ? '—'
      : readOnly
        ? `<span class="loc-ok-indicator${worksSelected ? ' yes' : ''}">${worksSelected ? 'Yes' : '?'}</span>`
        : !attendee
          ? `<span class="loc-ok-indicator${worksSelected ? ' yes' : ''}">${worksSelected ? 'Yes' : '?'}</span>`
          : `<button type="button" class="loc-ok-toggle${worksSelected ? ' on' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}" title="${worksSelected ? 'Remove — OK with me' : 'OK with me — saves immediately'}" aria-label="OK with me">${worksSelected ? 'Yes' : '?'}</button>`;

    const confirmCell = showConfirm && loc
      ? (isOrg
        ? `<button type="button" class="loc-confirm-btn${isConfirmed ? ' on' : ''}" data-action="pick-confirm-location" data-location-id="${escapeHtml(loc.id)}" title="Confirmed for meeting">${isConfirmed ? '✓' : '○'}</button>`
        : (isConfirmed ? '✓' : '—'))
      : '';

    return `
      <td class="loc-cell-notes">${notesCell}</td>
      <td class="loc-cell-location">${locationCell}</td>
      <td class="loc-ok-with">${initials ? escapeHtml(initials) : '—'}</td>
      <td class="loc-ok-me">${worksCell}</td>
      ${showConfirm ? `<td class="loc-confirm-col">${confirmCell}</td>` : ''}`;
  }

  function renderLocationsTable(m, state, attendee, { showConfirm = false, isOrg = false, readOnly = false } = {}) {
    const confirmCol = showConfirm ? '<th title="Organiser confirms for the meeting">Confirmed</th>' : '';
    const existingRows = m.locations.map((loc) => `
      <tr class="loc-row" data-location-row data-location-id="${escapeHtml(loc.id)}">
        ${renderLocationRowCells(m, state, attendee, loc, { showConfirm, isOrg, readOnly })}
      </tr>`).join('');
    const newRow = attendee && !readOnly ? `
      <tr class="loc-row loc-row-new" data-location-row data-location-id="">
        ${renderLocationRowCells(m, state, attendee, null, { showConfirm: false, isOrg: false, readOnly: false })}
      </tr>` : '';
    return `<div class="pane-region tint-places locations-table-scroll"><table class="data-table locations-table">
      <thead><tr>
        <th>Notes</th>
        <th>Location</th>
        <th title="Initials of attendees who marked OK with me">OK with</th>
        <th class="loc-ok-me-head" title="Toggle if this location works for you"><span>OK</span><span>with me</span></th>
        ${confirmCol}
      </tr></thead>
      <tbody>${newRow}${existingRows}</tbody>
    </table></div>`;
  }

  function renderLocationsTab(m, state, attendee) {
    const hint = attendee
      ? `<p class="meta pane-lead">Proposed URLs or place names in the <strong>top row</strong> are added to the table. Tab out of an amended cell to save.</p>
         <p class="meta pane-lead">Toggle <strong>OK with me</strong> to record your preference. Tap/click overflow cells to expand; use <strong>Copy</strong> after expanding a link.</p>`
      : '<p class="meta pane-lead">Proposed URLs or place names in the top row are added to the table. Sign in on Attendees to propose locations and mark OK with me.</p>';
    return `
      <section class="panel stack" id="meeting-locations-pane">
        ${hint}
        ${renderLocationsTable(m, state, attendee)}
      </section>`;
  }

  async function handleLocationRowBlur(e, root, state) {
    if (!e.target.matches('.loc-cell')) return;
    const row = e.target.closest('[data-location-row]');
    if (!row) return;
    const rowRef = row;
    requestAnimationFrame(async () => {
      if (rowRef.contains(document.activeElement)) return;
      await saveLocationRow(root, state, rowRef);
    });
  }

  async function saveLocationRow(root, state, row) {
    if (!state.attendeeId) return;
    const id = row.dataset.locationId || '';
    const snapshot = row.dataset.locSnapshot || '';
    const currentSnap = locationRowSnapshot(row);
    if (snapshot && snapshot === currentSnap) return;

    const { notes, online, physical } = readLocationRowInputs(row);
    const locationText = row.querySelector('[data-loc-field="location"]')?.value.trim() || '';
    if (looksLikeMalformedUrl(locationText)) {
      const ok = confirm('This location looks like a badly formed URL. Save it as plain text instead?');
      if (!ok) return;
    }
    if (!online && !physical) {
      if (id && row.dataset.locSaving !== '1') {
        const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
        if (!me?.is_organizer) {
          render(root, state);
          toast('Only the organiser can remove a location row', true);
          return;
        }
        row.dataset.locSaving = '1';
        try {
          const data = await apiPost({
            action: 'remove_location',
            slug: state.slug,
            acting_attendee_id: state.attendeeId,
            location_id: id,
          });
          state.meet = data.meet;
          state.selectedLocations.delete(id);
          render(root, state);
          toast('Location row removed');
        } catch (err) {
          toast(err.message, true);
        } finally {
          delete row.dataset.locSaving;
        }
      }
      return;
    }
    if (online && !isWellFormedUrl(normalizeExternalUrl(online))) {
      toast('Location URL must be well-formed (https://…)', true);
      return;
    }
    const payload = {
      slug: state.slug,
      notes,
      location_text: row.querySelector('[data-loc-field="location"]')?.value.trim() || '',
    };
    if (row.dataset.locSaving === '1') return;
    row.dataset.locSaving = '1';
    try {
      let data;
      if (id) {
        data = await apiPost({ action: 'update_location', location_id: id, ...payload });
      } else {
        data = await apiPost({ action: 'add_location', ...payload });
      }
      state.meet = data.meet;
      row.dataset.locSnapshot = currentSnap;
      render(root, state);
      toast(id ? 'Location saved' : 'Location added');
    } catch (err) {
      toast(err.message, true);
    } finally {
      delete row.dataset.locSaving;
    }
  }

  function renderEditLocationForm(loc, attendee) {
    const editKind = ['physical', 'other'].includes(loc.kind) ? 'physical' : 'video';
    const url = extractUrlFromDetail(loc.detail) || 'https://';
    const physDetail = String(loc.detail || '').replace(extractUrlFromDetail(loc.detail) || '', '').replace(/^[\s·]+/, '').trim();
    const canDelete = !!attendee?.is_organizer;
    return `
      <form class="inline-form edit-location-form" data-form="edit-location">
        <input type="hidden" name="location_id" value="${escapeHtml(loc.id)}">
        <label>Type
          <select name="kind">
            <option value="video"${editKind === 'video' ? ' selected' : ''}>Online</option>
            <option value="physical"${editKind === 'physical' ? ' selected' : ''}>Physical</option>
          </select>
        </label>
        <label>Label <input name="label" required value="${escapeHtml(loc.label)}"></label>
        <label class="loc-edit-online"${editKind === 'video' ? '' : ' hidden'}>Meeting link <input name="online_url" type="url" value="${escapeHtml(editKind === 'video' ? url : 'https://')}" autocapitalize="off" spellcheck="false"></label>
        <label class="loc-edit-physical"${editKind === 'physical' ? '' : ' hidden'}>Location details <input name="physical_address" value="${escapeHtml(editKind === 'physical' ? (physDetail || loc.detail || '') : '')}"></label>
        <div class="row">
          <button type="submit">Save location</button>
          ${canDelete ? `<button type="button" class="btn-cancel" data-action="delete-location" data-location-id="${escapeHtml(loc.id)}">Delete location</button>` : ''}
          <button type="button" class="btn-cancel" data-action="cancel-edit-location">Cancel</button>
        </div>
      </form>`;
  }

  // ─── Meeting Resources tab ─────────────────────────────────────────────────

  function attachmentUnifiedContent(att) {
    if (att.type === 'url') return att.url || '';
    return att.body || '';
  }

  function findMalformedUrlsInText(text) {
    const bad = [];
    const re = /https?:\/\/[^\s<>"']+/gi;
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
      const norm = normalizeExternalUrl(m[0]);
      if (!isWellFormedUrl(norm)) bad.push(m[0]);
    }
    return bad;
  }

  function parseAttachmentContent(raw) {
    const text = String(raw || '').trim();
    if (!text) return { type: 'text', body: '' };
    const single = text.replace(/<[^>]+>/g, '').trim();
    if (/^https?:\/\//i.test(single) && !/\s/.test(single)) {
      const url = normalizeExternalUrl(single);
      if (isWellFormedUrl(url)) return { type: 'url', url };
    }
    return { type: 'text', body: raw };
  }

  function renderAttachFieldDisplay(state, attId, value, { readOnly }) {
    if (!value) return '—';
    const key = `${attId || 'new'}:content`;
    const expanded = state.expandedAttachFields.has(key);
    const plain = String(value).replace(/<[^>]+>/g, ' ');
    if (readOnly && !expanded && plain.length > 120) {
      return `<button type="button" class="loc-expand-btn loc-text-clamp" data-action="expand-attach-cell" data-attach-expand="${escapeHtml(key)}" title="Show all">${escapeHtml(plain)}</button>`;
    }
    if (readOnly && expanded) {
      return `<span class="loc-selectable-text" data-attach-select="${escapeHtml(key)}" tabindex="0">${sanitizeHtml(value)}</span>`;
    }
    return escapeHtml(plain.slice(0, 120));
  }

  function renderAttachmentsTable(m, state, attendee) {
    const canEdit = !!attendee;
    const rows = (m.attachments || []).map((att) => {
      const content = attachmentUnifiedContent(att);
      return `<tr class="attach-row" data-attachment-row data-attachment-id="${escapeHtml(att.id)}" data-attach-snapshot="${escapeHtml(attachmentRowSnapshotFromAtt(att))}">
        <td class="attach-cell-label">${canEdit
          ? `<input type="text" class="attach-cell" data-attach-field="label" value="${escapeHtml(att.label)}" placeholder="Label">`
          : escapeHtml(att.label)}</td>
        <td class="attach-cell-content">${canEdit
          ? `<textarea class="attach-cell" data-attach-field="content" rows="3" placeholder="URL or text (simple HTML)">${escapeHtml(content)}</textarea>`
          : renderAttachFieldDisplay(state, att.id, content, { readOnly: true })}</td>
      </tr>`;
    }).join('');
    const newRow = canEdit ? `<tr class="attach-row attach-row-new" data-attachment-row data-attachment-id="">
      <td class="attach-cell-label"><input type="text" class="attach-cell" data-attach-field="label" placeholder="Label"></td>
      <td class="attach-cell-content"><textarea class="attach-cell" data-attach-field="content" rows="3" placeholder="URL or text (simple HTML)"></textarea></td>
    </tr>` : '';
    return `<div class="pane-region-scroll attachments-table-scroll"><table class="data-table attachments-table">
      <thead><tr><th>Label</th><th>Content</th></tr></thead>
      <tbody>${newRow}${rows}</tbody>
    </table></div>`;
  }

  function attachmentRowSnapshotFromAtt(att) {
    return `${att.label || ''}|${attachmentUnifiedContent(att)}`;
  }

  function attachmentRowSnapshot(row) {
    const label = row.querySelector('[data-attach-field="label"]')?.value || '';
    const content = row.querySelector('[data-attach-field="content"]')?.value || '';
    return `${label}|${content}`;
  }

  async function handleAttachmentRowBlur(e, root, state) {
    if (!e.target.matches('.attach-cell')) return;
    const row = e.target.closest('[data-attachment-row]');
    if (!row) return;
    const rowRef = row;
    requestAnimationFrame(async () => {
      if (rowRef.contains(document.activeElement)) return;
      await saveAttachmentRow(root, state, rowRef);
    });
  }

  async function saveAttachmentRow(root, state, row) {
    if (!state.attendeeId) return;
    const id = row.dataset.attachmentId || '';
    const snapshot = row.dataset.attachSnapshot || '';
    const currentSnap = attachmentRowSnapshot(row);
    if (snapshot && snapshot === currentSnap) return;

    const label = row.querySelector('[data-attach-field="label"]')?.value.trim() || '';
    const contentRaw = row.querySelector('[data-attach-field="content"]')?.value || '';
    if (!label && !contentRaw.trim()) return;

    const malformed = findMalformedUrlsInText(contentRaw);
    if (malformed.length) {
      toast(`Malformed URL: ${malformed[0]}`, true);
      return;
    }

    const parsed = parseAttachmentContent(contentRaw);
    try {
      if (id) {
        if (!label) { toast('Label required', true); return; }
        const payload = { action: 'update_attachment', slug: state.slug, attachment_id: id, label };
        if (parsed.type === 'url') payload.url = parsed.url;
        else payload.body = parsed.body;
        const data = await apiPost(payload);
        state.meet = data.meet;
      } else if (label) {
        const payload = { action: 'add_attachment', slug: state.slug, label, type: parsed.type };
        if (parsed.type === 'url') payload.url = parsed.url;
        else payload.body = parsed.body;
        const data = await apiPost(payload);
        state.meet = data.meet;
      }
      render(root, state);
      toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  function renderAgendaTab(m, state, attendee) {
    const canEditDesc = !!attendee;
    const saveBtn = `<button type="submit" class="compact-btn">Save</button>`;
    return `
      <section class="panel stack" id="meeting-agenda-pane">
        <p class="meta pane-lead">Description, agenda, decisions, notes, and attachments — pre- and post-meeting assets in one place.</p>
        <div class="pane-region tint-text">
          <form class="inline-form" data-form="update-description">
            <label>Description for attendees <span class="label-hint">(simple HTML — status bar &amp; Overview)</span>
              ${canEditDesc ? formatToolbar('organizer_intro', { withHelp: true, helpTopic: 'meeting description' }) : ''}
              <textarea name="organizer_intro" rows="4" placeholder="${escapeHtml(INTRO_PLACEHOLDER)}"${canEditDesc ? '' : ' readonly'}>${escapeHtml(m.organizer_intro || '')}</textarea>
            </label>
            ${canEditDesc ? `<div class="pane-save-row">${saveBtn}</div>` : '<p class="meta">Sign in on Attendees to edit.</p>'}
          </form>
        </div>
        <details ${paneDetailsAttrs(state, 'mr-agenda', { extraClass: 'tint-text' })}>
          <summary>Agenda &amp; decisions</summary>
          <div class="pane-details-body">
          <form class="inline-form" data-form="update-agenda">
            <label>Agenda <span class="label-hint">(each line is a bullet on Overview)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(each line is a bullet on Overview)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            ${canEditDesc ? `<div class="pane-save-row">${saveBtn}</div>` : ''}
          </form>
          </div>
        </details>
        <details ${paneDetailsAttrs(state, 'mr-notes', { extraClass: 'tint-text' })}>
          <summary>Notes</summary>
          <div class="pane-details-body">
          <form class="inline-form" data-form="update-notes">
            <label>Notes <span class="label-hint">(simple HTML)</span>
              ${canEditDesc ? formatToolbar('notes', { withHelp: false }) : ''}
              <textarea name="notes" rows="5">${escapeHtml(m.notes || '')}</textarea>
            </label>
            ${canEditDesc ? `<div class="pane-save-row">${saveBtn}</div>` : ''}
          </form>
          </div>
        </details>
        <div class="pane-region tint-assets">
          <p class="meta">Attachments — links or text (recordings, transcripts, summaries). Top row adds on tab out.</p>
          ${canEditDesc ? renderAttachmentsTable(m, state, attendee) : (m.attachments.length ? renderAttachmentsTable(m, state, attendee) : '<p class="meta">No attachments yet.</p>')}
        </div>
      </section>`;
  }

  // ─── Meeting options tab ─────────────────────────────────────────────────────

  function inferDurationMode(m) {
    const amMins = minutesBetweenTimes(m.am_start || '09:00', m.am_end || '12:00');
    const pmMins = minutesBetweenTimes(m.pm_start || '12:00', m.pm_end || '16:00');
    if (Number(m.duration_minutes) === amMins) return 'am';
    if (Number(m.duration_minutes) === pmMins) return 'pm';
    return 'custom';
  }

  function durationModeBounds(mode, m) {
    if (mode === 'am') {
      return {
        duration: minutesBetweenTimes(m.am_start || '09:00', m.am_end || '12:00'),
        day_start: m.am_start || '09:00',
        day_end: m.am_end || '12:00',
      };
    }
    if (mode === 'pm') {
      return {
        duration: minutesBetweenTimes(m.pm_start || '12:00', m.pm_end || '16:00'),
        day_start: m.pm_start || '12:00',
        day_end: m.pm_end || '16:00',
      };
    }
    return null;
  }

  function renderOptionsTab(m, state, attendee) {
    const canEdit = canEditOptions(m, attendee);
    const mtz = meetingTz(m);
    const saveBtn = canEdit ? '<button type="submit">Save</button>' : '';
    const headerSaveBtn = canEdit ? '<button type="submit" form="update-settings-form">Save</button>' : '';
    const rangeEndDisplay = optionsRangeEnd(m);
    return `
      <section class="panel stack">
        <div class="pane-title-row row">
          <p class="meta pane-lead"><strong>Don't forget to save after making changes.</strong> Meeting length, calendar slot size, bookable dates and hours.${canEdit ? '' : ' View only — organiser can edit.'}</p>
          ${canEdit ? formSaveHeader(headerSaveBtn) : ''}
        </div>
        ${canEdit && !m.attendees.length ? `<div class="row">
          <button type="button" class="btn-nav compact-btn" data-action="tab" data-tab="getting-started">Back to Getting started</button>
          <button type="button" class="btn-nav compact-btn" data-action="tab" data-tab="attendees">Next step: Attendees →</button>
        </div>` : ''}
        <form id="update-settings-form" class="inline-form organizer-form" data-form="update-settings">
          ${canEdit ? '' : formSaveHeader('')}
          <fieldset class="options-fieldset"${canEdit ? '' : ' disabled'}>
          <details ${paneDetailsAttrs(state, 'opts-length', { extraClass: 'tint-dates' })}>
            <summary>Meeting length &amp; calendar</summary>
            <div class="pane-details-body">
            <div class="form-grid">
              <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
            </div>
            <div class="form-grid options-duration-grid">
              <label title="Minutes, 1.5h, 2,5h, or AM / PM (sets default bookable hours)">Meeting length
                <input type="text" name="duration_input" value="${escapeHtml(formatDurationFieldValue(m))}" placeholder="e.g. 60, 1.5h, AM, PM">
              </label>
              <label title="Granularity for partial availability — must divide meeting length evenly">Calendar slot size
                <input type="text" name="slot_granularity_input" value="${escapeHtml(formatDurationForInput(m.slot_granularity_minutes))}" placeholder="e.g. 30, 15m">
              </label>
              <label class="checkbox-label" title="When off, Saturday and Sunday are hidden from calendar navigation"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
            </div>
            <p class="meta options-duration-hint"><strong>Calendar slot size</strong> is one granularity at which attendees can confirm availability to indicate partial attendance.${!meetingSlotSteps(m).valid ? ' <strong>Slot size must divide meeting length evenly.</strong>' : ''} Changing meeting length or slot size does <strong>not</strong> remap saved availability — attendees should review <strong>My availability</strong> and save again.</p>
            </div>
          </details>
          <details ${paneDetailsAttrs(state, 'opts-booking', { extraClass: 'tint-dates' })}>
            <summary>Bookable dates &amp; daily hours</summary>
            <div class="pane-details-body">
            <div class="options-booking-grid">
              <label title="Earliest date this meeting is open for scheduling.">Start date<input type="date" name="range_start" value="${escapeHtml(optionsRangeStart(m))}"></label>
              <label title="Earliest start time on the calendar grid each day (meeting timezone).">Start time <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
              <label title="Latest date this meeting is open for scheduling. Leave blank for open-ended.">End date <span class="label-hint">(optional)</span><input type="date" name="range_end" value="${escapeHtml(rangeEndDisplay)}"></label>
              <label title="Latest end time on the calendar grid each day (meeting timezone).">End time <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
            </div>
            </div>
          </details>
          <details ${paneDetailsAttrs(state, 'opts-timezone', { extraClass: 'tint-dates' })}>
            <summary>Calendar hours &amp; timezone</summary>
            <div class="pane-details-body">
            <p class="meta">${escapeHtml(mtz)} · ${escapeHtml(formatWallHour(parseTime(m.day_start)))}–${escapeHtml(formatWallHour(parseTime(m.day_end)))} · ${escapeHtml(optionsRangeStart(m))}${rangeEndDisplay ? ` – ${escapeHtml(rangeEndDisplay)}` : ' – open-ended'}</p>
            <p class="meta">Times on the calendar grid are shown in each person’s local timezone (and UTC in slot details). The timezone below defines which wall-clock hours ${escapeHtml(formatWallHour(parseTime(m.day_start)))}–${escapeHtml(formatWallHour(parseTime(m.day_end)))} refer to — everyone marks the same underlying slots.</p>
            <label>Timezone
              <select name="timezone">${timezoneOptions(m.timezone)}</select>
            </label>
            </div>
          </details>
          <details ${paneDetailsAttrs(state, 'opts-recurrence', { secondary: true, extraClass: 'tint-dates pane-future' })}>
            <summary>Recurrence (future feature)</summary>
            <div class="pane-details-body">
            <p class="meta">One-off scheduling only for now. Recurrence design is parked.</p>
            </div>
          </details>
          </fieldset>
          ${saveBtn}
        </form>
      </section>`;
  }

  const OPEN_ENDED_RANGE_END = '2099-12-31';

  function optionsRangeStart(m) {
    return m.range_start_stored || m.range_start || meetingTodayStr(m);
  }

  function optionsRangeEnd(m) {
    const stored = m.range_end_stored || '';
    return (stored === '' || stored === OPEN_ENDED_RANGE_END) ? '' : stored;
  }

  // ─── Attendees section ───────────────────────────────────────────────────────

  function attendeePanelIsOpen(state, m, attendee) {
    if (state.attendeePanelOpen !== undefined) return state.attendeePanelOpen;
    return !meetingEstablished(m) || !attendee;
  }

  function renderAttendeesSection(m, state, attendee, { showContinue = false, standalone = false } = {}) {
    const signedIn = !!attendee;
    const established = meetingEstablished(m);
    const panelOpen = standalone || attendeePanelIsOpen(state, m, attendee);
    const listHint = signedIn
      ? (attendee.is_organizer
        ? 'Toggle Organiser rights for others. Expand <strong>Merge duplicate attendees</strong> if needed.'
        : 'Duplicate rows can be merged — expand <strong>Merge duplicate attendees</strong> if needed.')
      : 'Toggle sign-in if you are listed (enter passcode if set), or add yourself below.';
    const claiming = m.attendees.find((a) => a.id === state.claimingId);
    const showOrganiserCol = signedIn && attendee.is_organizer;
    const colCount = 6 + (showOrganiserCol ? 1 : 0);
    const regPaneId = standalone ? 'att-registered' : 'att-registered-cal';

    const identityBar = signedIn ? `<div class="row attendee-identity-bar">
      <button type="button" class="compact-btn" data-action="edit-attendee" title="Edit your display name, contact, or passcode">Edit identity</button>
      <button type="button" class="btn-cancel compact-btn" data-action="switch-user" title="Sign out on this browser">Switch user</button>
    </div>` : '';

    const tableBlock = `
        <div class="attendee-table-panel">
        <div class="table-wrap table-wrap-compact attendee-table-wrap">
          <table class="data-table attendee-table">
            <thead><tr><th class="col-me" title="Toggle sign-in for this row">Signed-in as</th><th>Name</th><th>Initials</th><th>Contact</th><th title="Count of locations marked OK with me">Time slots/locations</th><th>Passcode</th>${showOrganiserCol ? '<th title="Toggle organiser rights">Organiser</th>' : ''}</tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => renderAttendeeRow(m, state, attendee, a, { signedIn, showOrganiserCol })).join('') : `<tr><td colspan="${colCount}">None yet</td></tr>`}
            </tbody>
          </table>
        </div>
        </div>`;

    const registeredInner = signedIn || m.attendees.length
      ? `${identityBar}${tableBlock}${claiming ? renderClaimPinForm(claiming) : ''}${signedIn && state.editingAttendeeId === attendee.id ? renderEditAttendeeForm(attendee, state) : ''}`
      : '';

    const addPane = signedIn ? renderAddAttendeeForm(true, attendee, state) : (m.attendees.length ? renderAddAttendeeForm(false, attendee, state) : '');
    const mergePane = signedIn && attendee?.is_organizer ? renderOrganiserMergePanel(m, state) : '';
    const tail = `${addPane}${mergePane}${showContinue ? renderContinueToCalendar(state) : ''}`;

    if (!signedIn && !m.attendees.length) {
      const firstAdd = renderAddAttendeeForm(false, attendee, state);
      if (standalone) return `<p class="meta pane-lead">${listHint}</p>${firstAdd}${tail}`;
      return `
      <details class="attendee-block stack"${panelOpen ? ' open' : ''}>
        <summary class="attendee-block-summary">Add yourself as an attendee</summary>
        <div class="attendee-block-body stack">${firstAdd}${tail}</div>
      </details>`;
    }

    const registeredPane = `<details ${paneDetailsAttrs(state, regPaneId, { extraClass: 'tint-people' })}>
      <summary>Registered attendees (${m.attendees.length || 'none yet'})</summary>
      <div class="pane-details-body stack">${registeredInner}</div>
    </details>`;

    if (standalone) {
      return `<p class="meta pane-lead">${listHint}</p>${registeredPane}${tail}`;
    }

    const summaryLabel = established && signedIn
      ? `Registered attendees (${m.attendees.length}) — click to expand`
      : `Registered attendees (${m.attendees.length || 'none yet'})`;
    return `
      <details class="attendee-block stack"${panelOpen ? ' open' : ''}>
        <summary class="attendee-block-summary">${summaryLabel} <span class="label-hint">— ${listHint}</span></summary>
        <div class="attendee-block-body stack">${registeredInner}${tail}</div>
      </details>`;
  }

  function renderContinueToCalendar(state) {
    const ready = !!state.attendeeId;
    return `<div class="calendar-continue-row">
      <button type="button" class="btn-nav" data-action="tab" data-tab="calendar" title="Open My availability">Continue to My availability →</button>
      <p class="meta">${ready
        ? 'Mark your availability on <strong>My availability</strong>.'
        : 'Add yourself above, then go to <strong>My availability</strong>.'}</p>
    </div>`;
  }

  function renderAddAttendeeForm(signedIn, attendee, state) {
    const formId = 'add-attendee-form';
    const saveBtn = `<button type="submit" form="${formId}" class="compact-btn">Save</button>`;
    const modeRow = signedIn ? '' : `
        <div class="add-mode-row add-mode-inline add-mode-left">
          <div class="mode-options mode-options-inline mode-options-left">
            <label class="mode-choice"><input type="radio" name="add_mode" value="self" checked><span>Myself</span></label>
            <label class="mode-choice"><input type="radio" name="add_mode" value="propose"><span>Someone else</span></label>
          </div>
          <p class="meta add-field-guide">Display name: any text. Initials: default from display name. Contact optional: comma-separated email, URL, phone, or free text. Passcode: optional — ${PASSCODE_TIP}</p>
        </div>`;
    const pinField = `
          <label class="field-pin">Passcode <span class="label-hint">(optional)</span>
            <input class="input-pin" name="pin" type="text" autocomplete="new-password" maxlength="22" size="22" title="${escapeHtml(PASSCODE_TIP)}" placeholder="For Find my meetings">
          </label>`;
    const extras = signedIn ? '' : `
        <p class="meta propose-hint" data-show-when="propose" hidden>They are not emailed — share the meeting link with them. They tick <strong>Me</strong> on their row to sign in.</p>`;

    if (signedIn) {
      return `
        <details ${paneDetailsAttrs(state, 'att-add', { secondary: true, extraClass: 'tint-people' })}>
          <summary class="row"><span>Add another attendee</span>${saveBtn}</summary>
          <div class="pane-details-body">
          <form class="inline-form add-attendee-form" data-form="add-attendee" id="${formId}">
            <input type="hidden" name="add_mode" value="propose">
            <p class="meta">Add <strong>someone else</strong>. Share the meeting link with them.</p>
            <div class="add-attendee-fields">
              <label class="field-name">Display name
                <input class="input-name" name="display_name" required maxlength="80" placeholder="e.g. name or email">
              </label>
              <label class="field-initials">Initials <span class="label-hint">(opt.)</span>
                <input class="input-initials" name="initials" maxlength="4" title="Defaults from display name if blank">
              </label>
              ${pinField}
              <label class="field-contact">Contact <span class="label-hint">(opt.)</span>
                <input class="input-contact" name="contact" maxlength="120" placeholder="email, URL, phone" autocomplete="email" title="Comma-separated email, URL, phone, or free text">
              </label>
            </div>
            <button type="submit" class="add-attendee-submit-full">Save</button>
          </form>
          </div>
        </details>`;
    }

    return `
        <details ${paneDetailsAttrs(state, 'att-add-first', { extraClass: 'tint-people' })}>
            <summary class="add-attendee-summary row">
              <span class="add-attendee-summary-label">Add yourself as an attendee</span>
              ${saveBtn}
            </summary>
          <div class="pane-details-body">
          <form class="inline-form add-attendee-form" data-form="add-attendee" id="${formId}">
            <p class="meta">Add yourself as an attendee, or propose someone else.</p>
            ${modeRow}
            <div class="add-attendee-fields">
              <label class="field-name">Display name
                <input class="input-name" name="display_name" required maxlength="80" placeholder="e.g. name or email">
              </label>
              <label class="field-initials">Initials <span class="label-hint">(opt.)</span>
                <input class="input-initials" name="initials" maxlength="4" title="Defaults from display name if blank">
              </label>
              ${pinField}
              <label class="field-contact">Contact <span class="label-hint">(opt.)</span>
                <input class="input-contact" name="contact" maxlength="120" placeholder="email, phone" autocomplete="email">
              </label>
            </div>
            ${extras}
            <button type="submit" class="add-attendee-submit-full">Save</button>
          </form>
          </div>
        </details>`;
  }

  function renderEditAttendeeForm(a, state) {
    const hasPinAlready = a.has_pin;
    const changingPin = !!state.changingPin;
    return `
        <form class="inline-form edit-attendee-form" data-form="edit-attendee">
          <h3 class="section-title">Edit my details</h3>
          <input type="hidden" name="attendee_id" value="${escapeHtml(a.id)}">
          <div class="add-attendee-fields">
            <label class="field-name">Display name
              <input class="input-name" name="display_name" required maxlength="80" value="${escapeHtml(a.display_name)}">
            </label>
            <label class="field-initials">Initials <span class="label-hint">(opt.)</span>
              <input class="input-initials" name="initials" maxlength="4" value="${escapeHtml(a.initials || '')}">
            </label>
            <label class="field-contact">Contact <span class="label-hint">(opt.)</span>
              <input class="input-contact" name="contact" maxlength="120" placeholder="email, phone" value="${escapeHtml(a.contact || '')}">
            </label>
          </div>
          <div class="pin-change-block">
            <h4 class="section-title">${hasPinAlready ? 'Change passcode' : 'Set passcode'}</h4>
            <p class="meta">You are already signed in — current passcode is not required. Leave blank to keep your existing passcode.</p>
            ${hasPinAlready ? `<label class="checkbox-label"><input type="checkbox" name="clear_pin" data-toggle="clear-pin"> Remove passcode instead of setting a new one</label>` : ''}
            <div class="pin-inline-row">
              <label class="field-new-pin"${hasPinAlready ? ' data-clear-pin-target' : ''}>${hasPinAlready ? 'New passcode' : 'Passcode'}
                <input name="new_pin" type="text" maxlength="22" size="14" autocomplete="new-password" title="${escapeHtml(PASSCODE_TIP)}" placeholder="${hasPinAlready && !changingPin ? 'leave blank to keep' : ''}">
              </label>
            </div>
          </div>
          <div class="row">
            <button type="submit">Save my details</button>
            <button type="button" class="btn-cancel" data-action="cancel-edit-attendee" title="Cancel and return without saving">Cancel</button>
          </div>
        </form>`;
  }

  function renderAttendeeRow(m, state, current, a, { signedIn, showOrganiserCol }) {
    const isSelf = current?.id === a.id;
    const dupOfSelf = current && a.id !== current.id
      && a.display_name.trim().toLowerCase() === current.display_name.trim().toLowerCase();
    const pinCell = a.has_pin ? 'Set' : 'Not set';
    let meCell;
    if (dupOfSelf && current) {
      meCell = `<td class="col-me"><button type="button" class="sign-in-toggle merge-tick" data-action="merge-into-me" data-remove-id="${escapeHtml(a.id)}" title="Merge duplicate into your row">○</button></td>`;
    } else {
      const isOn = signedIn && isSelf;
      meCell = `<td class="col-me"><button type="button" class="sign-in-toggle${isOn ? ' on' : ''}" data-action="toggle-sign-in" data-attendee-id="${escapeHtml(a.id)}" data-has-pin="${a.has_pin ? '1' : '0'}" title="${isOn ? 'Sign out' : 'Sign in as this attendee'}">${isOn ? '●' : '○'}</button></td>`;
    }

    const organiserCell = showOrganiserCol
      ? `<td><input type="checkbox" data-action="toggle-organizer" data-attendee-id="${escapeHtml(a.id)}" ${a.is_organizer ? 'checked' : ''} aria-label="Meeting organiser for ${escapeHtml(a.display_name)}"></td>`
      : '';

    return `<tr class="attendee-row${isSelf ? ' is-self' : ''}${!signedIn ? ' is-selectable' : ''}">
      ${meCell}
      <td>${escapeHtml(a.display_name)}</td>
      <td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
      <td>${renderContactCell(a)}</td>
      <td>${countLocationPrefsFor(m, a.id)}</td>
      <td>${pinCell}</td>
      ${organiserCell}
    </tr>`;
  }

  function renderClaimPinForm(target) {
    const needsPin = target.has_pin;
    return `
      <form class="inline-form claim-form" data-form="claim">
        <input type="hidden" name="attendee_id" value="${escapeHtml(target.id)}">
        <p class="meta"><strong>${escapeHtml(target.display_name)}</strong> — ${needsPin ? 'enter your passcode to sign in' : 'optionally set a passcode, then press Continue'}</p>
        <label>${needsPin ? 'Passcode' : 'Passcode (optional)'}
          <input name="pin" type="text" autocomplete="one-time-code" ${needsPin ? 'required' : ''} maxlength="20" title="${escapeHtml(PASSCODE_TIP)}">
        </label>
        <div class="row">
          <button type="submit">Continue</button>
          <button type="button" class="btn-cancel" data-action="cancel-claim" title="Cancel and return">Cancel</button>
        </div>
      </form>`;
  }

  function renderOrganiserMergePanel(m, state) {
    const keepId = m.attendees[0]?.id || '';
    const removeId = m.attendees.length > 1 ? m.attendees[1].id : keepId;
    const optHtml = (selectedId) => m.attendees.map((a, i) =>
      `<option value="${escapeHtml(a.id)}"${a.id === selectedId ? ' selected' : ''}>${i + 1}. ${escapeHtml(attendeeLabel(a))}</option>`
    ).join('');
    return `
      <details ${paneDetailsAttrs(state, 'att-merge', { secondary: true, extraClass: 'tint-people' })}>
        <summary>Merge duplicate attendees</summary>
        <div class="pane-details-body">
        <form class="inline-form row" data-form="merge-organiser">
          <label>Keep row 1 <select name="keep_id" required>${optHtml(keepId)}</select></label>
          <label>Remove row 2 <select name="remove_id" required>${optHtml(removeId)}</select></label>
          <button type="submit">Merge</button>
        </form>
        <p class="meta">Availability from the removed row is combined into the kept row.</p>
        </div>
      </details>`;
  }

  // ─── Location helpers ────────────────────────────────────────────────────────

  function locationKindLabel(kind) {
    return { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[kind] || kind;
  }

  function locationChipLabel(loc) {
    if (loc.kind === 'row') {
      const f = locationRowFields(loc);
      const parts = [];
      if (f.notes) parts.push(f.notes);
      if (f.location) parts.push(f.location);
      return parts.join(' · ') || 'Location';
    }
    const kind = locationKindLabel(loc.kind);
    const service = String(loc.label || '').trim();
    const detail = loc.detail ? ` — ${loc.detail}` : '';
    if (service && service.toLowerCase() !== kind.toLowerCase() && service.toLowerCase() !== 'physical location') {
      return `${kind} (${service})${detail}`;
    }
    return `${kind}${detail}`;
  }

  function locationInlineHtml(m, locationId) {
    if (!locationId) return '<span class="label-hint">No location scheduled yet.</span>';
    const loc = m.locations.find((l) => l.id === locationId);
    if (!loc) return escapeHtml(locationId);
    if (loc.kind === 'row') {
      const f = locationRowFields(loc);
      const parts = [];
      if (f.notes) parts.push(escapeHtml(f.notes));
      if (f.location) {
        const href = normalizeExternalUrl(f.location);
        parts.push(isWellFormedUrl(href)
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(f.location)}</a>`
          : escapeHtml(f.location));
      }
      return parts.join(' · ') || escapeHtml(locationId);
    }
    const url = extractUrlFromDetail(loc.detail);
    const kind = locationKindLabel(loc.kind);
    const service = String(loc.label || '').trim();
    let html = escapeHtml(kind);
    if (service && service.toLowerCase() !== kind.toLowerCase() && service.toLowerCase() !== 'physical location') {
      html += ` <span class="label-hint">(${escapeHtml(service)})</span>`;
    }
    if (url && isWellFormedUrl(url)) {
      html += ` — <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
      const rest = String(loc.detail || '').replace(url, '').replace(/^[\s·]+/, '').trim();
      if (rest) html += ` <span class="label-hint">(${escapeHtml(rest)})</span>`;
    } else if (loc.detail) {
      html += ` — ${escapeHtml(loc.detail)}`;
    }
    return html;
  }

  function isWellFormedUrl(str) {
    try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (_) { return false; }
  }

  function extractUrlFromDetail(detail) {
    const raw = String(detail || '').trim();
    if (!raw) return '';
    const match = raw.match(/https?:\/\/[^\s·]+/i);
    if (match) return match[0];
    if (isWellFormedUrl(normalizeExternalUrl(raw))) return normalizeExternalUrl(raw);
    return '';
  }

  function renderAddLocationForm(state) {
    const locType = state.locType || 'online';
    const isOnline = locType === 'online';
    return `
      <form class="inline-form add-location-form" data-form="add-location">
        <label>Location type
          <select name="loc_type">
            <option value="online"${isOnline ? ' selected' : ''}>Online</option>
            <option value="physical"${!isOnline ? ' selected' : ''}>Physical</option>
          </select>
        </label>
        <div data-loc-fields="online" class="loc-fields"${isOnline ? '' : ' hidden'}>
          <label>Service
            <select name="online_service">
              <option value="Zoom">Zoom</option>
              <option value="Microsoft Teams">Microsoft Teams</option>
              <option value="Google Meet">Google Meet</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>Meeting link (optional)
            <input name="online_url" type="url" value="https://" placeholder="https://" autocapitalize="off" autocomplete="url" spellcheck="false">
          </label>
        </div>
        <div data-loc-fields="physical" class="loc-fields"${!isOnline ? '' : ' hidden'}>
          <label>Location details <input name="physical_address" placeholder="Venue name, address, room, phone, or joining note"></label>
        </div>
        <p class="meta span-full">Propose online and physical locations independently — save each one separately. You can propose several of each.</p>
        <button type="submit">Save new location</button>
      </form>`;
  }

  function buildLocationPayload(fd) {
    const locType = String(fd.get('loc_type') || 'online');
    const addr = String(fd.get('physical_address') || '').trim();
    const rawUrl = String(fd.get('online_url') || '').trim();
    const url = (!rawUrl || rawUrl === 'https://') ? '' : normalizeExternalUrl(rawUrl);
    const service = String(fd.get('online_service') || 'Online').trim() || 'Online';

    if (locType === 'physical') {
      if (!addr) throw new Error('Enter physical location details before saving');
      return { label: 'Physical location', kind: 'physical', detail: addr };
    }
    if (url && !isWellFormedUrl(url)) {
      throw new Error('Please enter a validly formatted link starting with https://');
    }
    return { label: service, kind: 'video', detail: url || 'Link to be added' };
  }

  // ─── Format helpers ───────────────────────────────────────────────────────────

  const FMT_TITLES = {
    strong: 'Wrap selected text in bold tags, or insert bold tags at the cursor',
    em: 'Wrap selected text in italic tags, or insert italic tags at the cursor',
    p: 'Wrap selected text in a paragraph, or insert an empty paragraph at the cursor',
    br: 'Insert a line break (<br>) at the cursor',
    a: 'Wrap selected text as a link (opens in a new tab), or insert a link at the cursor',
    ul: 'Wrap selected text in a bullet list, or insert a one-item list',
  };

  function renderIntroBlock(m, state, field, text, placeholder, editLabel = 'Meeting text', { withTextHelp = false } = {}) {
    if (state.editingIntro === field) {
      return `
        <div class="meet-intro-edit">
          <p class="field-label-plain">${escapeHtml(editLabel)} <span class="label-hint">(simple HTML)</span></p>
          ${formatToolbar(field, { withHelp: withTextHelp, helpTopic: editLabel.toLowerCase() })}
          <textarea id="intro-edit-${field}" name="${field}" rows="4">${escapeHtml(text || '')}</textarea>
          <div class="row">
            <button type="button" data-action="save-intro" data-field="${field}">Save</button>
            <button type="button" class="btn-cancel" data-action="cancel-intro">Cancel</button>
          </div>
        </div>`;
    }
    const body = (text || '').trim()
      ? sanitizeHtml(text)
      : `<span class="intro-placeholder">${escapeHtml(placeholder)}</span>`;
    return `
      <div class="meet-intro row">
        <div class="meet-intro-body">${body}</div>
        <button type="button" class="icon-btn" data-action="edit-intro" data-field="${field}" title="Edit this section text">✎</button>
      </div>`;
  }

  function helpToggle(topic, bodyHtml) {
    return `
      <details class="help-toggle">
        <summary><span class="help-q">?</span> Help for ${escapeHtml(topic)}</summary>
        <div class="help-body meta">${bodyHtml}</div>
      </details>`;
  }

  function textEntryHelp(topic) {
    return helpToggle(topic, 'Enter plain text or simple HTML. Tags not in the allowed list are stripped on save. Allowed: paragraphs, line breaks, bold, italic, links, and lists.');
  }

  function formatToolbar(field, { withHelp = true, helpTopic = 'meeting text' } = {}) {
    const help = withHelp ? textEntryHelp(helpTopic) : '';
    const btn = (fmt, label) => `<button type="button" class="btn-cancel fmt-btn" data-fmt="${fmt}" title="${escapeHtml(FMT_TITLES[fmt])}">${label}</button>`;
    return `
      ${help}
      <div class="fmt-toolbar" data-field="${field}">
        ${btn('strong', 'Bold')}${btn('em', 'Italic')}${btn('p', 'Paragraph')}${btn('br', 'Line break')}${btn('a', 'Link')}${btn('ul', 'List')}
      </div>`;
  }

  function renderAttachment(att, attendee = null, state = null) {
    const canEdit = !!attendee;
    const editing = state?.editingAttachmentId === att.id;
    if (editing && canEdit) {
      return `
        <form class="inline-form attachment-edit-form" data-form="edit-attachment">
          <input type="hidden" name="attachment_id" value="${escapeHtml(att.id)}">
          <label>Label <input name="label" required value="${escapeHtml(att.label)}"></label>
          ${att.type === 'text'
            ? `<label>Text <textarea name="body" rows="4">${escapeHtml(att.body || '')}</textarea></label>`
            : `<label>Link <input name="url" type="url" value="${escapeHtml(att.url || 'https://')}" autocapitalize="off"></label>`}
          <div class="row">
            <button type="submit">Save attachment</button>
            <button type="button" class="btn-cancel" data-action="cancel-edit-attachment">Cancel</button>
          </div>
        </form>`;
    }
    const actions = canEdit ? `
      <button type="button" class="compact-btn" data-action="edit-attachment" data-attachment-id="${escapeHtml(att.id)}">Edit</button>
      <button type="button" class="btn-cancel compact-btn" data-action="delete-attachment" data-attachment-id="${escapeHtml(att.id)}">Delete</button>` : '';
    if (att.type === 'text') {
      return `<details class="attachment attachment-text"${state?.openAttachmentId === att.id ? ' open' : ''}>
        <summary class="attachment-summary">${escapeHtml(att.label)}</summary>
        <div class="attachment-inner">
          ${actions}
          <pre class="attachment-body">${escapeHtml(att.body || '')}</pre>
        </div>
      </details>`;
    }
    const href = normalizeExternalUrl(att.url);
    return `<div class="attachment"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a> <span class="label-hint">(opens in a new window)</span>${actions}</div>`;
  }

  function formatTimePair(iso) {
    return `<strong>${escapeHtml(formatSlotLocal(iso))}</strong> (${escapeHtml(formatSlotUtc(iso))})`;
  }

  function slotSelectedByUser(state, m, slotIso, attendeeId) {
    if (!attendeeId || state.attendeeId !== attendeeId) return false;
    return state.selectedSlots.has(slotIso);
  }

  function bestProposedSlot(m) {
    const everyone = m.suggestions?.slots?.[0];
    if (everyone) return { slot: everyone.slot, count: everyone.count, kind: 'everyone' };
    const orgIds = new Set(m.attendees.filter((a) => a.is_organizer).map((a) => a.id));
    for (const p of m.suggestions?.partial_slots || []) {
      const full = p.attendees_full || [];
      if (full.some((id) => orgIds.has(id)) && full.some((id) => !orgIds.has(id))) {
        return { slot: p.slot, count: full.length, kind: 'organiser_plus_one' };
      }
    }
    return null;
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  async function handleSubmit(e, root, state) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = new FormData(form);
    try {
      let data;
      if (kind === 'add-attendee') {
        const mode = fd.get('add_mode') || 'self';
        const contact = validateContact(fd.get('contact'));
        const payload = {
          action: 'join', slug: state.slug,
          display_name: fd.get('display_name'), contact,
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
          client_timezone: tz,
        };
        if (mode === 'self') {
          const rawPin = String(fd.get('pin') || '').trim();
          const normPin = normalizePasscode(rawPin);
          if (rawPin !== '' && normPin === '') {
            throw new Error('Passcode must be 2 to 20 characters (letters, numbers, spaces, safe specials — not |).');
          }
          payload.pin = normPin || undefined;
          data = await apiPost(payload);
          state.attendeeId = data.attendee_id;
          localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        } else {
          data = await apiPost(payload);
        }
        form.reset();
      } else if (kind === 'claim') {
        const rawClaimPin = String(fd.get('pin') || '').trim();
        const claimPin = sanitizePasscode(rawClaimPin);
        data = await apiPost({ action: 'claim', slug: state.slug, attendee_id: fd.get('attendee_id'), pin: claimPin || undefined });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        state.claimingId = null;
      } else if (kind === 'update-settings') {
        const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
        if (!canEditOptions(state.meet, me)) {
          throw new Error('Only a meeting organiser can change these settings.');
        }
        const parsed = parseDurationField(fd.get('duration_input'), state.meet);
        let duration = parsed.duration;
        let dayStart = parsed.day_start || fd.get('day_start');
        let dayEnd = parsed.day_end || fd.get('day_end');
        if (!duration) throw new Error('Enter meeting length: minutes, 1.5h, 2,5h, AM, or PM.');
        const slotGran = parseDurationInput(fd.get('slot_granularity_input'));
        const durationErr = validateDurationSlotPair(duration, slotGran);
        if (durationErr) throw new Error(durationErr);
        const rangeStart = String(fd.get('range_start') || '').trim() || meetingTodayStr(state.meet);
        const rangeEnd = String(fd.get('range_end') || '').trim() || OPEN_ENDED_RANGE_END;
        data = await apiPost({
          action: 'update_meta', slug: state.slug, acting_attendee_id: state.attendeeId,
          title: fd.get('title'),
          duration_minutes: duration,
          slot_granularity_minutes: slotGran,
          day_start: dayStart, day_end: dayEnd,
          range_start: rangeStart, range_end: rangeEnd,
          timezone: normalizeTimezone(fd.get('timezone')),
          show_weekends: fd.get('show_weekends') === 'on',
        });
      } else if (kind === 'add-location-row') {
        const onlineLabel = String(fd.get('online_label') || '').trim();
        const onlineUrl = String(fd.get('online_url') || '').trim();
        const physicalLabel = String(fd.get('physical_label') || '').trim();
        const physicalDetail = String(fd.get('physical_detail') || '').trim();
        if (!onlineLabel && !physicalLabel) throw new Error('Enter an online label and/or a physical place name.');
        if (onlineLabel) {
          let detail = (!onlineUrl || onlineUrl === 'https://') ? 'Link to be added' : normalizeExternalUrl(onlineUrl);
          if (onlineUrl && onlineUrl !== 'https://' && !isWellFormedUrl(detail)) {
            throw new Error('Online link must be a well-formed URL (https://…).');
          }
          data = await apiPost({ action: 'add_location', slug: state.slug, label: onlineLabel, kind: 'video', detail });
          state.meet = data.meet;
        }
        if (physicalLabel) {
          data = await apiPost({ action: 'add_location', slug: state.slug, label: physicalLabel, kind: 'physical', detail: physicalDetail });
          state.meet = data.meet;
        }
        form.reset();
      } else if (kind === 'update-description') {
        const payload = {
          action: 'update_meta', slug: state.slug,
          organizer_intro: fd.get('organizer_intro'),
        };
        if (state.attendeeId) payload.acting_attendee_id = state.attendeeId;
        data = await apiPost(payload);
      } else if (kind === 'update-agenda') {
        const payload = {
          action: 'update_meta', slug: state.slug,
          agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')),
        };
        if (state.attendeeId) payload.acting_attendee_id = state.attendeeId;
        data = await apiPost(payload);
      } else if (kind === 'update-notes') {
        const payload = {
          action: 'update_meta', slug: state.slug,
          notes: fd.get('notes'),
        };
        if (state.attendeeId) payload.acting_attendee_id = state.attendeeId;
        data = await apiPost(payload);
      } else if (kind === 'update-meta') {
        const payload = {
          action: 'update_meta', slug: state.slug,
          agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes'),
        };
        if (fd.get('organizer_intro') != null) payload.organizer_intro = fd.get('organizer_intro');
        if (state.attendeeId) payload.acting_attendee_id = state.attendeeId;
        data = await apiPost(payload);
      } else if (kind === 'add-location') {
        const built = buildLocationPayload(fd);
        const duplicate = (state.meet.locations || []).some((loc) => {
          return String(loc.label || '').trim().toLowerCase() === String(built.label || '').trim().toLowerCase()
            && String(loc.kind || '').trim().toLowerCase() === String(built.kind || '').trim().toLowerCase()
            && String(loc.detail || '').trim().toLowerCase() === String(built.detail || '').trim().toLowerCase();
        });
        if (duplicate) throw new Error('That location already exists. Edit details or add a unique option.');
        data = await apiPost({ action: 'add_location', slug: state.slug, label: built.label, kind: built.kind, detail: built.detail });
        form.reset();
        state.locType = 'online';
      } else if (kind === 'edit-location') {
        const locId = String(fd.get('location_id') || '');
        const existing = (state.meet.locations || []).find((l) => l.id === locId);
        if (!existing) throw new Error('Location not found');
        const locKind = String(fd.get('kind') || 'video');
        let detail = '';
        if (locKind === 'video' || locKind === 'phone') {
          const rawUrl = String(fd.get('online_url') || '').trim();
          const url = (!rawUrl || rawUrl === 'https://') ? '' : normalizeExternalUrl(rawUrl);
          if (url && !isWellFormedUrl(url)) throw new Error('Please enter a validly formatted link starting with https://');
          detail = url || 'Link to be added';
        } else {
          detail = String(fd.get('physical_address') || '').trim();
          if (!detail) throw new Error('Enter physical location details before saving');
        }
        data = await apiPost({
          action: 'update_location',
          slug: state.slug,
          location_id: locId,
          label: String(fd.get('label') || '').trim(),
          kind: locKind,
          detail,
        });
        state.editingLocationId = null;
      } else if (kind === 'add-attachment') {
        const type = fd.get('attachment_type') || 'url';
        const rawUrl = String(fd.get('url') || '').trim();
        const url = type === 'url' ? normalizeExternalUrl(rawUrl) : undefined;
        if (type === 'url' && (!rawUrl || rawUrl === 'https://' || !isWellFormedUrl(url))) {
          throw new Error('Please enter a validly formatted link starting with https://');
        }
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type, url, body: fd.get('body') });
      } else if (kind === 'edit-attachment') {
        const rawUrl = String(fd.get('url') || '').trim();
        const body = fd.get('body');
        const payload = {
          action: 'update_attachment',
          slug: state.slug,
          attachment_id: fd.get('attachment_id'),
          label: fd.get('label'),
        };
        if (rawUrl !== '') {
          const url = normalizeExternalUrl(rawUrl);
          if (rawUrl === 'https://' || !isWellFormedUrl(url)) {
            throw new Error('Please enter a validly formatted link starting with https://');
          }
          payload.url = url;
        }
        if (body !== null) payload.body = body;
        data = await apiPost(payload);
        state.editingAttachmentId = null;
      } else if (kind === 'confirm') {
        data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_slot: fd.get('confirmed_slot'),
        });
        state.pendingConfirmSlot = null;
        state.pendingConfirmedLocationIds = null;
      } else if (kind === 'merge-organiser') {
        const keepId = fd.get('keep_id');
        const removeId = fd.get('remove_id');
        if (keepId === removeId) throw new Error('Choose two different attendees');
        data = await apiPost({ action: 'merge_attendees', slug: state.slug, keep_id: keepId, remove_id: removeId, acting_attendee_id: state.attendeeId });
        if (state.attendeeId === removeId) {
          state.attendeeId = keepId;
          localStorage.setItem(attendeeKey(state.slug), keepId);
        }
      } else if (kind === 'edit-attendee') {
        const contact = validateContact(fd.get('contact'));
        const newPinRaw = String(fd.get('new_pin') || '').trim();
        const newPin = normalizePasscode(newPinRaw);
        if (newPinRaw !== '' && newPin === '') {
          throw new Error('Passcode must be 2 to 20 characters (letters, numbers, spaces, safe specials — not |).');
        }
        const clearPin = fd.get('clear_pin') === 'on';
        const payload = {
          action: 'update_attendee', slug: state.slug,
          acting_attendee_id: state.attendeeId,
          attendee_id: fd.get('attendee_id'),
          display_name: fd.get('display_name'),
          contact,
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
        };
        if (clearPin || newPin !== '') {
          payload.new_pin = newPin;
          payload.skip_current_pin = true;
          if (clearPin) payload.clear_pin = true;
        }
        data = await apiPost(payload);
        state.editingAttendeeId = null;
        state.changingPin = false;
        state.attendeePanelOpen = true;
        state.scrollAfterRender = 'attendee-block';
      } else return;

      state.meet = data.meet;
      if (kind === 'add-attendee' && (fd.get('add_mode') || 'self') === 'self') restoreAttendeeSelections(state);
      else if (kind === 'claim') restoreAttendeeSelections(state);
      if (kind === 'update-settings') localStorage.setItem(setupOptionsSavedKey(state.slug), 'yes');
      if (kind === 'update-meta') state.openNotesEditor = false;
      if (kind === 'add-attendee' || kind === 'claim') {
        state.overviewHelpOpen = false;
        localStorage.setItem(overviewHelpKey(state.slug), 'closed');
      }
      if (kind === 'add-attendee' || kind === 'claim') state.scrollAfterRender = 'attendee-block';
      render(root, state);

      if (kind === 'add-location') toast('Location saved');
      else if (kind === 'add-location-row') toast('Location(s) added');
      else if (kind === 'add-attendee') toast((fd.get('add_mode') || 'self') === 'self' ? 'You are signed in. Next: mark availability, then share the meeting link.' : 'Attendee saved');
      else if (kind === 'edit-attendee') toast(fd.get('clear_pin') === 'on' ? 'Passcode removed' : 'Your details were updated');
      else if (kind === 'confirm') toast('Meeting time agreed — status updated');
      else if (kind === 'update-settings') {
        toast(state.attendeeId
          ? 'Calendar options saved.'
          : 'Calendar options saved. Next: add yourself as attendee (or return to Getting started).');
      } else if (kind === 'update-description') toast('Description saved');
      else if (kind === 'update-agenda') toast('Agenda saved');
      else if (kind === 'update-notes') toast('Notes saved');
      else if (kind === 'update-meta') toast('Saved');
      else toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  async function handleClick(e, root, state) {
    const locSelect = e.target.closest('[data-loc-select]');
    if (locSelect) {
      selectElementContents(locSelect);
      return;
    }

    const btn = e.target.closest('[data-action], [data-fmt]');
    if (!btn) return;

    if (btn.dataset.fmt) {
      applyFormat(btn.dataset.field || btn.closest('.fmt-toolbar')?.dataset.field, btn.dataset.fmt);
      return;
    }

    const action = btn.dataset.action;

    if (action === 'tab') { setTab(state, btn.dataset.tab); render(root, state); window.scrollTo(0, 0); return; }

    if (action === 'copy-link') {
      const input = document.getElementById('share-url-input');
      const link = input?.value || shareUrl(state.slug);
      try {
        await navigator.clipboard.writeText(link);
        localStorage.setItem(setupLinkCopiedKey(state.slug), 'yes');
        toast('Link copied');
      } catch (_) { if (input) { input.value = link; input.select(); } document.execCommand('copy'); localStorage.setItem(setupLinkCopiedKey(state.slug), 'yes'); toast('Link copied'); }
      render(root, state);
      return;
    }

    if (action === 'toggle-help') {
      state.helpOpen = !state.helpOpen;
      if (state.helpOpen && isNarrowScreen()) state.headerExpanded = true;
      render(root, state);
      return;
    }
    if (action === 'edit-agenda-decisions') {
      state.openNotesEditor = true;
      setTab(state, 'agenda');
      state.scrollAfterRender = 'notes-edit-details';
      render(root, state);
      return;
    }
    if (action === 'toggle-header') { state.headerExpanded = !state.headerExpanded; render(root, state); return; }

    if (action === 'preset-duration-am' || action === 'preset-duration-pm') {
      return;
    }

    if (action === 'edit-intro') { state.editingIntro = btn.dataset.field; render(root, state); return; }
    if (action === 'cancel-intro') { state.editingIntro = null; render(root, state); return; }
    if (action === 'save-intro') {
      const field = btn.dataset.field;
      const val = document.getElementById(`intro-edit-${field}`)?.value ?? '';
      const payload = { action: 'update_meta', slug: state.slug, acting_attendee_id: state.attendeeId };
      payload[field] = val;
      try {
        const data = await apiPost(payload);
        state.meet = data.meet;
        state.editingIntro = null;
        render(root, state);
        toast('Saved');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'toggle-slot') {
      if (state.dragHandledClick) {
        state.dragHandledClick = false;
        return;
      }
      toggleSlot(state, btn.dataset.slot);
      render(root, state);
      return;
    }

    if (action === 'expand-attach-cell') {
      const key = btn.dataset.attachExpand;
      if (!key) return;
      const opening = !state.expandedAttachFields.has(key);
      if (state.expandedAttachFields.has(key)) state.expandedAttachFields.delete(key);
      else state.expandedAttachFields.add(key);
      render(root, state);
      if (opening) {
        requestAnimationFrame(() => {
          const el = root.querySelector(`[data-attach-select="${CSS.escape(key)}"]`);
          if (el) selectElementContents(el);
        });
      }
      return;
    }

    if (action === 'expand-loc-cell') {
      const key = btn.dataset.locExpand;
      if (!key) return;
      const opening = !state.expandedLocFields.has(key);
      if (state.expandedLocFields.has(key)) state.expandedLocFields.delete(key);
      else state.expandedLocFields.add(key);
      render(root, state);
      if (opening) {
        requestAnimationFrame(() => {
          const el = root.querySelector(`[data-loc-select="${CSS.escape(key)}"]`);
          if (el) selectElementContents(el);
        });
      }
      return;
    }

    if (action === 'copy-loc-url') {
      const url = btn.dataset.url || '';
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      } catch (_) {
        toast('Could not copy link', true);
      }
      return;
    }

    if (action === 'toggle-location') {
      if (!state.attendeeId) {
        toast('Sign in on Attendees first to save location preferences', true);
        return;
      }
      const id = btn.dataset.location;
      state.selectedLocations.has(id) ? state.selectedLocations.delete(id) : state.selectedLocations.add(id);
      try {
        const data = await apiPost({ action: 'save_location_prefs', slug: state.slug, attendee_id: state.attendeeId, location_ids: [...state.selectedLocations] });
        state.meet = data.meet;
        render(root, state);
        toast(state.selectedLocations.has(id) ? 'Location preference saved' : 'Location preference removed');
      } catch (err) {
        state.selectedLocations.has(id) ? state.selectedLocations.delete(id) : state.selectedLocations.add(id);
        toast(err.message, true);
      }
      return;
    }

    if (action === 'delete-location') {
      if (!window.confirm('Remove this location proposal from the meeting?')) return;
      try {
        const data = await apiPost({ action: 'remove_location', slug: state.slug, acting_attendee_id: state.attendeeId, location_id: btn.dataset.locationId });
        state.meet = data.meet;
        state.selectedLocations.delete(btn.dataset.locationId);
        if (state.editingLocationId === btn.dataset.locationId) state.editingLocationId = null;
        render(root, state);
        toast('Location removed');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'edit-location') {
      if (!state.attendeeId) {
        toast('Sign in on Attendees first to edit a location', true);
        return;
      }
      state.editingLocationId = btn.dataset.locationId;
      render(root, state);
      return;
    }
    if (action === 'cancel-edit-location') {
      state.editingLocationId = null;
      render(root, state);
      return;
    }

    if (action === 'prev-days') {
      const min = calendarMinStart(state.meet);
      state.viewStart = shiftViewByDisplayedDays(state.viewStart, -1, state.meet.show_weekends);
      if (state.viewStart < min) state.viewStart = min;
      render(root, state);
      return;
    }
    if (action === 'prev-week') {
      const min = calendarMinStart(state.meet);
      state.viewStart = shiftViewByDisplayedDays(state.viewStart, -7, state.meet.show_weekends);
      if (state.viewStart < min) state.viewStart = min;
      render(root, state);
      return;
    }
    if (action === 'go-today') {
      state.viewStart = calendarMinStart(state.meet);
      render(root, state);
      return;
    }
    if (action === 'go-range-start') {
      state.viewStart = calendarMinStart(state.meet);
      render(root, state);
      return;
    }
    if (action === 'go-range-end') {
      const lastAvail = lastAvailabilityDay(state.meet);
      const dayCount = visibleDayCount();
      let target = lastAvail ? startOfDay(lastAvail) : state.viewStart;
      if (lastAvail) {
        target = shiftViewByDisplayedDays(target, -(dayCount - 1), state.meet.show_weekends);
        const min = calendarMinStart(state.meet);
        if (target < min) target = min;
      }
      state.viewStart = target;
      render(root, state);
      return;
    }
    if (action === 'prev-screen') {
      const min = calendarMinStart(state.meet);
      const n = visibleDayCount();
      state.viewStart = shiftViewByDisplayedDays(state.viewStart, -n, state.meet.show_weekends);
      if (state.viewStart < min) state.viewStart = min;
      render(root, state);
      return;
    }
    if (action === 'next-screen') {
      const n = visibleDayCount();
      let next = shiftViewByDisplayedDays(state.viewStart, n, state.meet.show_weekends);
      if (state.activeTab === 'group') {
        const lastAvail = lastAvailabilityDay(state.meet);
        if (lastAvail) {
          const dayCount = visibleDayCount();
          const maxStart = shiftViewByDisplayedDays(startOfDay(lastAvail), -(dayCount - 1), state.meet.show_weekends);
          if (startOfDay(next) > startOfDay(maxStart)) next = maxStart;
        }
      }
      state.viewStart = next;
      render(root, state);
      return;
    }
    if (action === 'next-days') {
      if (state.activeTab === 'group') {
        const lastAvail = lastAvailabilityDay(state.meet);
        if (lastAvail) {
          const dayCount = visibleDayCount();
          const days = getVisibleDays(calendarViewStart(state, state.meet), dayCount, state.meet.show_weekends);
          if (days.length && startOfDay(days[days.length - 1]) >= startOfDay(lastAvail)) {
            toast('No availability marked after this date', true);
            return;
          }
        }
      }
      let next = shiftViewByDisplayedDays(state.viewStart, 1, state.meet.show_weekends);
      if (state.activeTab === 'group') {
        const lastAvail = lastAvailabilityDay(state.meet);
        if (lastAvail && startOfDay(next) > startOfDay(lastAvail)) next = startOfDay(lastAvail);
      }
      state.viewStart = next;
      render(root, state);
      return;
    }
    if (action === 'next-week') {
      let next = shiftViewByDisplayedDays(state.viewStart, 7, state.meet.show_weekends);
      if (state.activeTab === 'group') {
        const lastAvail = lastAvailabilityDay(state.meet);
        if (lastAvail && startOfDay(next) > startOfDay(lastAvail)) next = startOfDay(lastAvail);
      }
      state.viewStart = next;
      render(root, state);
      return;
    }

    if (action === 'jump-slot') {
      state.viewStart = startOfDay(new Date(btn.dataset.slot));
      setTab(state, 'calendar');
      render(root, state);
      return;
    }

    if (action === 'use-slot') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can select a proposed meeting start time', true);
        return;
      }
      const slot = btn.dataset.slot;
      const current = state.pendingConfirmSlot || state.meet.confirmed_slot || '';
      if (current === slot) {
        state.pendingConfirmSlot = '';
        render(root, state);
        toast('Selection cleared');
        return;
      }
      const missing = attendeesUnavailableForSlot(state.meet, slot);
      if (missing.length) {
        const initials = missing.map((a) => a.initials || deriveInitials(a.display_name)).join(', ');
        if (!window.confirm(`Are you sure? Unavailable: ${initials}`)) return;
      }
      state.pendingConfirmSlot = slot;
      render(root, state);
      toast('Proposed meeting start updated');
      return;
    }
    if (action === 'pick-confirm-location') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can confirm locations', true);
        return;
      }
      const loc = state.meet.locations.find((l) => l.id === btn.dataset.locationId);
      if (!loc) return;
      const cur = [...effectiveConfirmedLocationIds(state, state.meet)];
      const idx = cur.indexOf(loc.id);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(loc.id);
      try {
        const data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_location_ids: cur,
        });
        state.meet = data.meet;
        state.pendingConfirmedLocationIds = null;
        render(root, state);
        toast(idx >= 0 ? 'Location unconfirmed' : 'Location confirmed');
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }
    if (action === 'confirm-time') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can accept the proposed start as the scheduled start time', true);
        return;
      }
      const slot = effectiveConfirmSlot(state, state.meet);
      if (!slot) {
        toast('Choose a start slot first on the calendar above', true);
        return;
      }
      const wasAlreadyConfirmed = !!state.meet.confirmed_slot;
      try {
        const data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_slot: slot,
        });
        state.meet = data.meet;
        state.pendingConfirmSlot = null;
        if (wasAlreadyConfirmed) {
          state.wasRescheduled = true;
          localStorage.setItem(rescheduledKey(state.slug), 'yes');
        }
        render(root, state);
        toast('Meeting start time scheduled');
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }
    if (action === 'switch-user') {
      state.attendeeId = '';
      state.claimingId = null;
      localStorage.removeItem(attendeeKey(state.slug));
      state.selectedSlots.clear();
      state.selectedLocations.clear();
      render(root, state);
      return;
    }

    if (action === 'toggle-sign-in') {
      const targetId = btn.dataset.attendeeId;
      const target = state.meet.attendees.find((a) => a.id === targetId);
      if (!target) return;
      if (state.attendeeId === targetId) {
        state.attendeeId = '';
        state.claimingId = null;
        localStorage.removeItem(attendeeKey(state.slug));
        state.selectedSlots.clear();
        state.selectedLocations.clear();
        render(root, state);
        toast('Signed out');
        return;
      }
      if (target.has_pin || btn.dataset.hasPin === '1') {
        state.claimingId = targetId;
        render(root, state);
        requestAnimationFrame(() => root.querySelector('.claim-form input[name="pin"]')?.focus());
        return;
      }
      try {
        if (state.attendeeId) localStorage.removeItem(attendeeKey(state.slug));
        const data = await apiPost({ action: 'claim', slug: state.slug, attendee_id: targetId });
        state.attendeeId = data.attendee_id;
        state.meet = data.meet;
        state.claimingId = null;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        restoreAttendeeSelections(state);
        render(root, state);
        toast('Signed in');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'claim-row') {
      if (state.attendeeId === btn.dataset.attendeeId) { toast('Already signed in as this attendee'); return; }
      state.claimingId = btn.dataset.attendeeId;
      render(root, state);
      requestAnimationFrame(() => root.querySelector('.claim-form input[name="pin"]')?.focus());
      return;
    }

    if (action === 'edit-attendee') {
      state.editingAttendeeId = state.attendeeId;
      state.changingPin = false;
      state.attendeePanelOpen = true;
      render(root, state);
      requestAnimationFrame(() => root.querySelector('.edit-attendee-form input[name="display_name"]')?.focus());
      return;
    }

    if (action === 'start-pin-change') { state.changingPin = true; render(root, state); return; }
    if (action === 'cancel-pin-change') { state.changingPin = false; render(root, state); return; }

    if (action === 'cancel-edit-attendee') { state.editingAttendeeId = null; state.changingPin = false; render(root, state); return; }
    if (action === 'cancel-claim') { state.claimingId = null; render(root, state); return; }

    if (action === 'merge-into-me') {
      const removeId = btn.dataset.removeId;
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      const target = state.meet.attendees.find((a) => a.id === removeId);
      if (!me || !target) return;
      let pin = '';
      const confirmMsg = `Keep your row (${attendeeLabel(me)}) and delete the duplicate (${attendeeLabel(target)})?\n\nAvailability from the removed row will be combined into yours.`;
      if (target.has_pin) {
        pin = sanitizePasscode(window.prompt('Enter the passcode for the duplicate row you are removing:') || '');
        if (!pin) return;
      } else if (!window.confirm(confirmMsg)) {
        return;
      }
      try {
        const data = await apiPost({ action: 'merge_attendees', slug: state.slug, keep_id: state.attendeeId, remove_id: removeId, acting_attendee_id: state.attendeeId, pin: pin || undefined });
        state.meet = data.meet;
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        restoreAttendeeSelections(state);
        render(root, state);
        toast('Duplicate removed — your row was kept');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'set-pin') {
      state.editingAttendeeId = state.attendeeId;
      state.changingPin = true;
      state.attendeePanelOpen = true;
      render(root, state);
      requestAnimationFrame(() => root.querySelector('.edit-attendee-form input[name="new_pin"]')?.focus());
      return;
    }

    if (action === 'edit-attachment') {
      state.editingAttachmentId = btn.dataset.attachmentId;
      render(root, state);
      return;
    }
    if (action === 'cancel-edit-attachment') {
      state.editingAttachmentId = null;
      render(root, state);
      return;
    }
    if (action === 'delete-attachment') {
      if (!confirm('Delete this attachment?')) return;
      try {
        const data = await apiPost({ action: 'remove_attachment', slug: state.slug, attachment_id: btn.dataset.attachmentId });
        state.meet = data.meet;
        if (state.editingAttachmentId === btn.dataset.attachmentId) state.editingAttachmentId = null;
        render(root, state);
        toast('Attachment deleted');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'save-availability') {
      try {
        const data = await apiPost({ action: 'save_availability', slug: state.slug, attendee_id: state.attendeeId, slots: [...state.selectedSlots] });
        localStorage.setItem(slotsKey(state.slug, state.attendeeId), JSON.stringify([...state.selectedSlots]));
        state.meet = data.meet;
        render(root, state);
        toast('Availability saved');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (action === 'toggle-group-hours') {
      state.showAllGroupHours = !state.showAllGroupHours;
      localStorage.setItem(groupHoursKey(state.slug), state.showAllGroupHours ? 'all' : 'compact');
      render(root, state);
      return;
    }

    if (action === 'save-locations') {
      try {
        const data = await apiPost({ action: 'save_location_prefs', slug: state.slug, attendee_id: state.attendeeId, location_ids: [...state.selectedLocations] });
        state.meet = data.meet;
        render(root, state);
        toast('Location preferences saved');
      } catch (err) { toast(err.message, true); }
    }
  }

  function applyFormat(field, fmt) {
    const ta = document.getElementById(`intro-edit-${field}`) || document.querySelector(`textarea[name="${field}"]`);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let insert = sel;
    if (fmt === 'br') insert = '<br>';
    else if (fmt === 'p') insert = `<p>${sel || 'text'}</p>`;
    else if (fmt === 'strong') insert = `<strong>${sel || 'text'}</strong>`;
    else if (fmt === 'em') insert = `<em>${sel || 'text'}</em>`;
    else if (fmt === 'a') { const href = prompt('Link URL:', 'https://'); if (!href) return; insert = `<a href="${href}" target="_blank" rel="noopener noreferrer">${sel || 'link text'}</a>`; }
    else if (fmt === 'ul') insert = `<ul>\n<li>${sel || 'item'}</li>\n</ul>`;
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.focus();
  }

  function handleChange(e, root, state) {
    if (e.target.matches('details.overview-help')) {
      state.overviewHelpOpen = e.target.open;
      localStorage.setItem(overviewHelpKey(state.slug), e.target.open ? 'open' : 'closed');
      return;
    }
    if (e.target.matches('details.attendee-block')) { state.attendeePanelOpen = e.target.open; return; }
    if (e.target.matches('[data-action="edit-confirmed-slot"]')) {
      const hidden = document.getElementById('confirmed-slot-hidden');
      if (hidden) hidden.value = e.target.value;
      return;
    }
    if (e.target.name === 'loc_type') {
      state.locType = e.target.value === 'physical' ? 'physical' : 'online';
      render(root, state);
      return;
    }
    if (e.target.name === 'kind' && e.target.closest('.edit-location-form')) {
      const form = e.target.closest('form');
      const isVideo = e.target.value === 'video';
      form?.querySelector('.loc-edit-online')?.toggleAttribute('hidden', !isVideo);
      form?.querySelector('.loc-edit-physical')?.toggleAttribute('hidden', isVideo);
      return;
    }
    if (e.target.name === 'attachment_type') {
      const form = e.target.closest('form');
      if (form) form.querySelectorAll('[data-attach-fields]').forEach((el) => { el.hidden = el.dataset.attachFields !== e.target.value; });
      return;
    }
    if (e.target.matches('[data-action="sort-order"]')) { state.sortOrder = e.target.value; render(root, state); return; }
    if (e.target.name === 'clear_pin') {
      syncClearPinFields(e.target.closest('form'));
      if (e.target.checked) e.target.closest('form')?.querySelector('[name="current_pin"]')?.focus();
      return;
    }
    if (e.target.name === 'add_mode') {
      const form = e.target.closest('form');
      if (!form) return;
      const isSelf = e.target.value === 'self';
      const pin = form.querySelector('.field-pin');
      if (pin) pin.hidden = !isSelf;
      form.querySelector('[data-show-when="propose"]')?.toggleAttribute('hidden', isSelf);
      return;
    }
    if (e.target.name === 'recurrence_type') {
      const extra = root.querySelector('#recurrence-extra');
      const showWeekends = root.querySelector('[name="show_weekends"]')?.checked ?? false;
      if (extra) extra.innerHTML = recurrenceExtraFields({ type: e.target.value }, showWeekends);
      const summary = e.target.closest('details')?.querySelector('.recurrence-summary');
      const label = e.target.options[e.target.selectedIndex]?.text || 'One-off';
      if (summary) summary.textContent = `Recurrence: ${label}`;
      return;
    }
    if (e.target.name === 'show_weekends') {
      root.querySelectorAll('#weekday-checks input[type="checkbox"]').forEach((cb) => {
        const v = Number(cb.value);
        const weekend = v === 0 || v === 6;
        if (weekend) { cb.disabled = !e.target.checked; if (!e.target.checked) cb.checked = false; }
      });
      return;
    }
    if (e.target.matches('[data-action="toggle-organizer"]')) {
      const targetId = e.target.dataset.attendeeId;
      const checked = e.target.checked;
      apiPost({ action: 'set_organizer', slug: state.slug, acting_attendee_id: state.attendeeId, attendee_id: targetId, organizer: checked })
        .then((data) => { state.meet = data.meet; render(root, state); toast('Organiser updated'); })
        .catch((err) => { e.target.checked = !checked; toast(err.message, true); });
    }
  }

  function handlePointerDown(e, root, state) {
    if (e.pointerType !== 'mouse') return;
    if (e.target.closest('input, textarea, select, form')) return;
    const slot = e.target.closest('[data-action="toggle-slot"]');
    if (!slot || !state.attendeeId) return;
    state.dragging = true;
    state.dragHandledClick = true;
    state.dragSelect = !state.selectedSlots.has(slot.dataset.slot);
    if (state.dragSelect) state.selectedSlots.add(slot.dataset.slot);
    else state.selectedSlots.delete(slot.dataset.slot);
    render(root, state);
  }

  function handlePointerOver(e, root, state) {
    if (!state.dragging) return;
    if (typeof e.buttons === 'number' && e.buttons === 0) {
      state.dragging = false;
      return;
    }
    const slot = e.target.closest('[data-action="toggle-slot"]');
    if (!slot) return;
    if (state.dragSelect) state.selectedSlots.add(slot.dataset.slot);
    else state.selectedSlots.delete(slot.dataset.slot);
    render(root, state);
  }

  function toggleSlot(state, slot) {
    state.selectedSlots.has(slot) ? state.selectedSlots.delete(slot) : state.selectedSlots.add(slot);
  }

  // ─── Sorting ─────────────────────────────────────────────────────────────────

  function sortPartialSuggestions(m, order) {
    const list = (m.suggestions?.partial_slots || []).map((s) => ({ ...s }));
    if (order === 'names') list.sort((a, b) => attendeeName(m, (a.attendees_full || [])[0] || '').localeCompare(attendeeName(m, (b.attendees_full || [])[0] || '')) || a.slot.localeCompare(b.slot));
    else list.sort((a, b) => a.slot.localeCompare(b.slot));
    return list;
  }

  function sortSuggestions(m, order) {
    const list = (m.suggestions?.slots || []).map((s) => ({ ...s }));
    if (order === 'count') list.sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot));
    else if (order === 'names') list.sort((a, b) => attendeeName(m, a.attendees[0]).localeCompare(attendeeName(m, b.attendees[0])) || a.slot.localeCompare(b.slot));
    else list.sort((a, b) => a.slot.localeCompare(b.slot));
    return list;
  }

  // ─── Calendar helpers ─────────────────────────────────────────────────────────

  function getVisibleDays(start, count, showWeekends) {
    const days = [];
    let cursor = startOfDay(new Date(start));
    let guard = 0;
    while (days.length < count && guard < 366) {
      const dow = cursor.getDay();
      if (showWeekends || (dow !== 0 && dow !== 6)) days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
      guard++;
    }
    return days;
  }

  /** Move the calendar window by N displayed days (skips Sat/Sun when weekends hidden). */
  function shiftViewByDisplayedDays(start, delta, showWeekends) {
    let cursor = startOfDay(new Date(start));
    const step = delta >= 0 ? 1 : -1;
    let moved = 0;
    let guard = 0;
    while (moved < Math.abs(delta) && guard < 366) {
      cursor = addDays(cursor, step);
      const dow = cursor.getDay();
      if (showWeekends || (dow !== 0 && dow !== 6)) moved++;
      guard++;
    }
    return cursor;
  }

  function dayHasGapBefore(days, index) {
    if (index <= 0) return false;
    const ms = days[index].getTime() - days[index - 1].getTime();
    return ms > 36 * 60 * 60 * 1000; // more than 1.5 days → weekend/hidden days skipped
  }

  function buildHours(startStr, endStr, granularity) {
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    const slots = [];
    for (let mins = start.hour * 60 + start.minute; mins < end.hour * 60 + end.minute; mins += granularity) {
      slots.push({ hour: Math.floor(mins / 60), minute: mins % 60 });
    }
    return slots;
  }

  function parseTime(str) {
    const [h, m] = String(str || '08:00').split(':').map(Number);
    return { hour: h || 0, minute: m || 0 };
  }

  // ─── Recurrence ───────────────────────────────────────────────────────────────

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function weekdaySelect(name, value) {
    return `<select name="${name}">${WEEKDAYS.map((d, i) => `<option value="${i}"${Number(value) === i ? ' selected' : ''}>${d}</option>`).join('')}</select>`;
  }

  function nthSelect(name, value) {
    return `<select name="${name}">${[[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [-1, 'last']].map(([v, l]) => `<option value="${v}"${Number(value) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function recurrenceOptions(current) {
    return [
      ['none', 'One-off'],
      ['weekly', 'Weekly on chosen day(s)'],
      ['monthly_day', 'Same date each month (e.g. the 19th)'],
      ['monthly_nth_weekday', 'Same weekday each month (e.g. 3rd Monday)'],
      ['friday_13th', 'Friday 13th only (rare)'],
    ].map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
  }

  function recurrenceExtraFields(rec, showWeekends = false) {
    const type = rec.type || 'none';
    if (type === 'weekly') {
      return `<label>Repeat every <input type="number" name="interval" value="${rec.interval || 1}" min="1" max="52"> week(s)</label>${weekdayCheckboxes(rec, showWeekends)}`;
    }
    if (type === 'monthly_day') {
      const day = Number(rec.day || 1);
      const interval = Number(rec.interval || 1);
      const dayOpts = Array.from({ length: 31 }, (_, i) => { const v = i + 1; return `<option value="${v}"${day === v ? ' selected' : ''}>${v}</option>`; }).join('');
      const intOpts = Array.from({ length: 24 }, (_, i) => { const v = i + 1; return `<option value="${v}"${interval === v ? ' selected' : ''}>${v}</option>`; }).join('');
      return `<p class="meta">Same calendar date each month. Shorter months use the last day.</p>
        <div class="recurrence-inline">
          <label>Day <select name="day">${dayOpts}</select></label>
          <label>every <select name="interval">${intOpts}</select> month(s)</label>
        </div>`;
    }
    if (type === 'monthly_nth_weekday') {
      const interval = Number(rec.interval || 1);
      const intOpts = Array.from({ length: 24 }, (_, i) => { const v = i + 1; return `<option value="${v}"${interval === v ? ' selected' : ''}>${v}</option>`; }).join('');
      return `<p class="meta">Example: 3rd Monday every 2 months.</p>
        <div class="recurrence-inline">
          <label>${nthSelect('nth', rec.nth ?? 3)}</label>
          <label>${weekdaySelect('weekday', rec.weekday ?? 1)}</label>
          <label>every <select name="interval">${intOpts}</select> month(s)</label>
        </div>`;
    }
    if (type === 'friday_13th') {
      return '<p class="meta">Highlights dates that are the 13th and a Friday. Rare — usually leave as One-off.</p>';
    }
    return '<p class="meta">Pick a time everyone can make, then set confirmed details on Set confirmed meeting details.</p>';
  }

  function weekdayCheckboxes(rec, showWeekends) {
    const selected = new Set(rec.weekdays || [1]);
    return `<label>On these days</label>
      <div class="weekday-checks" id="weekday-checks">
        ${WEEKDAYS.map((d, i) => {
          const weekend = i === 0 || i === 6;
          const disabled = !showWeekends && weekend;
          return `<label><input type="checkbox" name="weekday_${i}" value="${i}"${selected.has(i) ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${d}</label>`;
        }).join('')}
      </div>
      ${!showWeekends ? '<p class="meta">To include Saturday or Sunday, turn on <strong>Include weekends</strong> above.</p>' : ''}`;
  }

  function weekdaysFromForm(fd) {
    const weekdays = [];
    for (let i = 0; i < 7; i++) { if (fd.get(`weekday_${i}`) !== null) weekdays.push(i); }
    return weekdays;
  }

  function buildRecurrenceFromForm(fd) {
    const type = fd.get('recurrence_type');
    const base = { type };
    if (type === 'weekly') {
      base.interval = Math.max(1, Math.min(52, Number(fd.get('interval') || 1)));
      const weekdays = weekdaysFromForm(fd);
      base.weekdays = weekdays.length ? weekdays : [1];
    } else if (type === 'monthly_day') {
      base.day = Math.max(1, Math.min(31, Number(fd.get('day') || 1)));
      base.interval = Math.max(1, Math.min(24, Number(fd.get('interval') || 1)));
    } else if (type === 'monthly_nth_weekday') {
      base.nth = Number(fd.get('nth') || 3);
      base.weekday = Number(fd.get('weekday') ?? 1);
      base.interval = Math.max(1, Math.min(24, Number(fd.get('interval') || 1)));
    }
    return base;
  }

  // ─── Date/time utilities ──────────────────────────────────────────────────────

  function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function meetingTodayStr(m) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: meetingTz(m) }).format(new Date()); }
    catch (_) { return new Intl.DateTimeFormat('en-CA').format(new Date()); }
  }
  function parseDateIsoLocal(iso) { const [y, mo, d] = iso.split('-').map(Number); return startOfDay(new Date(y, mo - 1, d)); }
  function calendarMinStart(m) { return parseDateIsoLocal(m.calendar_start || meetingTodayStr(m)); }
  function calendarViewStart(state, m) { const min = calendarMinStart(m); return state.viewStart < min ? min : state.viewStart; }
  function toDateIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function formatDayHead(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function lastAvailabilityDay(m) {
    let maxMs = 0;
    for (const [iso, ids] of Object.entries(m.availability || {})) {
      if (!ids || !ids.length) continue;
      const t = new Date(iso).getTime();
      if (!Number.isNaN(t) && t > maxMs) maxMs = t;
    }
    return maxMs ? startOfDay(new Date(maxMs)) : null;
  }

  function formatDayRangeLabel(days) {
    if (!days.length) return '';
    return days.length === 1 ? formatDayHead(days[0]) : `${formatDayHead(days[0])} – ${formatDayHead(days[days.length - 1])}`;
  }
  function formatSlotLocal(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function formatSlotUtc(iso) { return new Date(iso).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC'); }
  function attendeeName(m, id) { return m.attendees.find((a) => a.id === id)?.display_name || id; }
  function attendeeLabel(a) { return a.initials ? `${a.display_name} (${a.initials})` : a.display_name; }
  function attendeeLabelById(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? attendeeLabel(a) : id; }
  function attendeeInitials(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? (a.initials || deriveInitials(a.display_name)) : ''; }
  function deriveInitials(name) { return String(name).trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase(); }
  function countSlotsFor(m, id) { return Object.values(m.availability).filter((ids) => ids.includes(id)).length; }
  function countLocationPrefsFor(m, id) { return (m.location_preferences?.[id] || []).length; }
  function lines(v) { return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean); }
  function shareUrl(slug) { return meetingUrl(slug); }

  function isWellFormedEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }
  function validateContact(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    const parts = v.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('@') && !isWellFormedEmail(part)) {
        throw new Error('Contact must be a valid email and/or phone number (comma-separated OK)');
      }
    }
    return v;
  }
  function isWellFormedWebUrl(s) {
    const raw = String(s || '').trim();
    if (!raw) return false;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  function contactHref(c) {
    const v = String(c || '').trim();
    if (!v || v.includes(',')) return null;
    if (v.includes('@')) return isWellFormedEmail(v) ? `mailto:${v}` : null;
    if (/^https?:\/\//i.test(v) || /^www\./i.test(v) || /\.[a-z]{2,}(\/|$)/i.test(v)) {
      return isWellFormedWebUrl(v) ? normalizeExternalUrl(v) : null;
    }
    return null;
  }
  function renderContactCell(a) {
    if (!a.contact) return '—';
    const parts = String(a.contact).split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.map((part) => {
        const href = contactHref(part);
        return href ? `<a href="${escapeHtml(href)}">${escapeHtml(part)}</a>` : escapeHtml(part);
      }).join(', ');
    }
    const href = contactHref(a.contact);
    if (href) return `<a href="${escapeHtml(href)}">${escapeHtml(a.contact)}</a>`;
    return escapeHtml(a.contact);
  }

  function normalizeExternalUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '#';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  function sanitizeHtml(html) {
    const withBreaks = String(html).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
    const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV']);
    const doc = new DOMParser().parseFromString(`<div>${withBreaks}</div>`, 'text/html');
    doc.body.querySelectorAll('*').forEach((el) => {
      if (!allowed.has(el.tagName)) el.replaceWith(...el.childNodes);
      else if (el.tagName === 'A') {
        [...el.attributes].forEach((a) => { if (a.name !== 'href') el.removeAttribute(a.name); });
        el.setAttribute('rel', 'noopener'); el.setAttribute('target', '_blank');
      } else [...el.attributes].forEach((a) => el.removeAttribute(a.name));
    });
    return doc.body.innerHTML;
  }

  function escapeHtml(str) { return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

  let toastTimer;
  function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#111827';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
})();
