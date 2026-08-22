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
        box.innerHTML = `<p class="meta">${countLabel}</p>
          <table class="meetings-found-table">
            <tbody>${res.meetings.map((m) => {
              const when = String(m.range_start || '').trim() || String(m.created || '').slice(0, 10) || '—';
              return `<tr>
                <td class="meetings-found-date">${escapeHtml(when)}</td>
                <td class="meetings-found-title"><a href="${escapeHtml(meetingUrl(m.slug))}">${escapeHtml(m.title)}</a></td>
              </tr>`;
            }).join('')}</tbody>
          </table>`;
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
      editingLocationId: null,
      showAllGroupHours: localStorage.getItem(groupHoursKey(slug)) === 'all',
      openNotesEditor: false,
      overviewHelpOpen: localStorage.getItem(overviewHelpKey(slug)) !== 'closed',
      attendeePanelOpen: undefined,
      lastDayCount: visibleDayCount(),
      helpOpen: false,
      locType: 'online',
      lastNarrow: isNarrowScreen(),
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
      wireOperationsLink(slug);
      render(root, state);
    } catch (err) {
      root.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }

    root.addEventListener('click', (e) => handleClick(e, root, state));
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

  function visibleDayCount() {
    if (window.innerWidth >= 1200) return 7;
    if (window.innerWidth >= 900) return 5;
    return 3;
  }

  /** Parse meeting length or slot size: plain minutes, 90m, 1.5h, 2,5h (comma decimal). */
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
    { id: 'agenda',     label: 'Meeting Resources', tip: 'Meeting description, agenda, decisions, notes, attachments, and post-meeting records.' },
    { id: 'calendar',   label: 'My availability',   tip: 'Mark when you are free. Each cell is one calendar slot; select consecutive slots for the full meeting length. Use ◀ ▶ beside dates to move by weekday.' },
    { id: 'options',    label: 'Calendar Options',    tip: 'Meeting length (whole meeting), calendar slot size (partial availability — must divide meeting length), AM/PM presets, bookable dates and hours. Organiser only.' },
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
    return `<p class="meta signed-in-banner">Currently signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong> (${role})
      <button type="button" class="compact-btn" data-action="edit-attendee" title="Edit your details">Edit</button>
      <button type="button" class="btn-cancel compact-btn" data-action="switch-user" title="Sign out on this browser">Switch user</button>
    </p>`;
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
    let timeHtml;
    let locHtml;
    const locs = effectiveConfirmLocations(state, m);
    const scheduled = kind === 'scheduled' || kind === 'rescheduled' || kind === 'past' || kind === 'summarised';
    const recurrenceLabel = escapeHtml(m.recurrence_label || 'One-off');
    if (scheduled) {
      timeHtml = `<span class="meta">Time: ${formatTimePair(m.confirmed_slot)}</span>`;
    } else {
      const pendingSlot = effectiveConfirmSlot(state, m);
      timeHtml = pendingSlot
        ? `<span class="meta">Time (proposed): ${formatTimePair(pendingSlot)}</span>`
        : '<span class="meta">No date and time selected</span>';
    }
    const recurrenceHtml = `<span class="meta">Recurrence: ${recurrenceLabel}</span>`;
    const parts = [];
    if (locs.online) {
      parts.push(`${scheduled ? 'Online' : 'Online (proposed)'}: ${locationInlineHtml(m, locs.online)}`);
    }
    if (locs.physical) {
      parts.push(`${scheduled ? 'Physical' : 'Physical (proposed)'}: ${locationInlineHtml(m, locs.physical)}`);
    }
    locHtml = parts.length
      ? parts.map((p) => `<span class="meta">${p}</span>`).join('')
      : '<span class="meta">No location selected</span>';
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
          <div class="help-columns">
            <div class="help-col">
              <h3 class="help-heading">Setting up a meeting (organiser)</h3>
              <ol class="help-steps">
                <li><strong>Attendees</strong> — add yourself first. You become the organiser. Optionally set a passcode so you can find this meeting from the home page later.</li>
                <li><strong>Calendar Options</strong> — meeting length (whole meeting), calendar slot size (partial availability — must divide meeting length evenly), AM/PM half-day presets, bookable dates and daily hours, timezone. Save when done.</li>
                <li><strong>Meeting Resources</strong> — optional description, agenda, decisions, notes, attachments.</li>
                <li><strong>My availability</strong> — mark when you are free. Select enough consecutive slots for the full meeting length if you can. Press <em>Save my availability</em>.</li>
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
                <li>Open <strong>My availability</strong> and mark every slot when you are free. Select enough consecutive slots to cover the full meeting if you can — finer slots mean you can also mark partial availability. Press <em>Save my availability</em>. You can come back and update this any time — clicking a previously selected slot deselects it, so remember to save again.</li>
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
          <p class="meta">Steps below are aimed at the meeting organiser. Attendees can skip organiser-only steps — sign in on <strong>Attendees</strong>, mark <strong>My availability</strong>, vote on <strong>Locations</strong>, and review proposed times.</p>
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
            ${go('calendar', 'Go to My availability')} and select slots when you are free — use ◀ ▶ beside the dates to move by weekday. Select enough consecutive slots to cover the full meeting if you can.
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
              <button type="button" class="btn-cancel compact-btn" data-action="ack-link-shared" title="Mark this step done if you have already sent the link by other means">I've shared the link</button>
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
        <details class="overview-block"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title" title="Tap or click the triangle to expand/collapse">Time · Recurrence · Proposed times</summary>
          <p class="meta"><strong>${scheduled ? 'Scheduled' : 'Proposed'}:</strong> ${timeSummary}</p>
          <p class="meta"><strong>Meeting length:</strong> ${formatDurationLabel(m.duration_minutes)} · <strong>Calendar slot:</strong> ${formatDurationLabel(m.slot_granularity_minutes)}</p>
          <p class="meta"><strong>Recurrence:</strong> ${escapeHtml(m.recurrence_label || 'One-off')}</p>
        </details>
        <details class="overview-block"${agendaOpen ? ' open' : ''}><summary class="section-title" title="Tap or click the triangle to expand/collapse">Agenda and decisions <span class="label-hint">(Set in Meeting Resources)</span></summary>
          ${m.agenda.length ? `<p class="meta"><strong>Agenda:</strong></p><ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet — go to <strong>Meeting Resources</strong> to set it.</p>'}
          ${m.decisions.length ? `<p class="meta"><strong>Decisions required:</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No decisions listed yet — go to <strong>Meeting Resources</strong> to set them.</p>'}
          ${(m.notes || '').trim() ? `<div class="meet-intro-body">${sanitizeHtml(m.notes)}</div>` : ''}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Attendees registered (${m.attendees.length}) · Availability entered (${availabilityCount})</summary>
          ${renderOverviewAttendeeTable(m)}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Top start times (${Math.min(10, suggestionTotal)} of ${suggestionTotal}) — best attendance</summary>
          ${sorted.length
            ? `<ul class="list-plain">${sorted.map((s) => `<li>${formatOverviewTimeSuggestion(m, s)}</li>`).join('')}</ul>
               <p class="meta">Confirm one with <strong>Set confirmed meeting details</strong>. Includes times where everyone is free for the full meeting, and times with partial overlap.</p>`
            : '<p class="meta">No overlap times yet — attendees need to mark availability on <strong>My availability</strong>, then check <strong>Set confirmed meeting details</strong>.</p>'}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click the triangle to expand/collapse">Top locations (${Math.min(3, locationTotal)} of ${locationTotal}) — by popularity</summary>
          ${topLocations.length
            ? `<ul class="list-plain">${topLocations.map((item) => `<li>${escapeHtml(locationChipLabel(item.loc))} — ${item.votes} preference${item.votes === 1 ? '' : 's'}</li>`).join('')}</ul>`
            : '<p class="meta">No locations proposed yet.</p>'}
        </details>
        ${recordsOpen && m.attachments.length ? `<details class="overview-block" open><summary class="section-title" title="Tap or click the triangle to expand/collapse">Attachments and records (${m.attachments.length})</summary>
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

  function renderOverviewAttendeeTable(m) {
    if (!m.attendees.length) return '<p class="meta">No attendees registered yet.</p>';
    return `<table class="data-table overview-attendee-table">
      <thead><tr><th>Name</th><th>Slots marked</th><th>Role</th></tr></thead>
      <tbody>${m.attendees.map((a) => `<tr>
        <td>${escapeHtml(a.display_name)}</td>
        <td>${countSlotsFor(m, a.id)}</td>
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
        <details class="calendar-instructions"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title" title="How to mark your availability on the calendar">Mark when you are free</summary>
          <p class="meta">Each cell is one <strong>calendar slot</strong> (${formatDurationLabel(m.slot_granularity_minutes)}). Drag or tap to select. Save with <em>Save my availability</em>. Tap a selected slot again to deselect — save again after changes.</p>
          <p class="meta"><strong>Meeting length</strong> is ${formatDurationLabel(m.duration_minutes)}.${slotHint} Finer slots let you show partial availability if you cannot make the whole meeting.</p>
          <p class="meta slot-legend-note"><strong>Initials</strong> show who else chose that slot. A <strong>+</strong> means more people than fit in the cell.</p>
          <p class="meta">Use <strong>◀ ▶</strong> in the date row (left of the grid) to move backward or forward by one weekday. Dates stay visible while you scroll.</p>
          <p class="meta">Meeting hours ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} in <strong>${escapeHtml(mtz)}</strong> (and UTC). Your browser timezone: <strong>${escapeHtml(tz)}</strong>.</p>
        </details>
        ${!meetingEstablished(m) ? renderAttendeesSection(m, state, attendee) : ''}
        ${renderSaveRow(state, m, { showBottomButton: false })}
        <div class="calendar" style="--cal-cols:${days.length || dayCount}">
          ${renderCalendarHeader(days, { canGoBack, canGoForward, todayStr, m, recurringSet, mtz })}
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label" title="Time in ${escapeHtml(mtz)}">${formatWallHour(hm)}</div>
              ${days.map((day, i) => renderSlotCell(m, state, toDateIso(day), hm, attendee, mtz, dayHasGapBefore(days, i))).join('')}
            `).join('')}
          </div>
        </div>
        ${renderSaveRow(state, m, { showTopDuplicate: false })}
      </section>`;
  }

  function renderCalendarHeader(days, { canGoBack, canGoForward, todayStr, m, recurringSet, mtz }) {
    return `
      <div class="cal-header cal-header-nav">
        <div class="time-gutter cal-nav-gutter" title="Move backward or forward by one weekday. Today jumps to the current date when there is room.">
          <div class="cal-nav">
            <button type="button" class="btn-nav cal-nav-btn" data-action="prev-days" title="Previous weekday" ${canGoBack ? '' : 'disabled'} aria-label="Previous weekday">◀</button>
            <button type="button" class="btn-nav cal-nav-btn cal-nav-today" data-action="go-today" title="Jump so today is the first visible day (shown when there is room)">Today</button>
            <button type="button" class="btn-nav cal-nav-btn" data-action="next-days" title="Next weekday" ${canGoForward ? '' : 'disabled'} aria-label="Next weekday">▶</button>
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
    const saveBtn = `<button type="button" data-action="save-availability" title="Save your currently selected availability slots to the meeting">Save my availability</button>`;
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
    const selectedLocations = effectiveConfirmLocations(state, m);
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
        <h2 class="section-title">Set confirmed meeting details</h2>
        <p class="meta"><strong>Group calendar</strong> — everyone’s availability on one grid (marks come from <strong>My availability</strong>). Meeting length is ${formatDurationLabel(m.duration_minutes)}; calendar slots are ${formatDurationLabel(m.slot_granularity_minutes)} each.${calendarNavHint(m)}</p>
        <p class="meta">Organiser: pick a start below and press <em>Accept start</em>. You may choose times with partial overlap — full attendance for the whole meeting is not required. Locations are optional.</p>
        <details class="meeting-link-block">
          <summary class="meta" title="Share this link so others can open the meeting">Meeting link</summary>
          <div class="share-row row">
            <input class="share-input" type="text" readonly value="${escapeHtml(shareUrl(state.slug))}" id="share-url-input">
            <button type="button" class="compact-btn" data-action="copy-link" title="Copy meeting link to clipboard">Copy meeting link</button>
          </div>
        </details>
        <div class="row confirm-actions-row">
          ${renderAcceptTimeButton(isOrg, state, m)}
          ${renderAcceptLocationButton(isOrg, state, m)}
        </div>
        <p class="meta slot-legend-note"><strong>Initials</strong> in cells show who marked that slot on My availability. Use <strong>◀ ▶</strong> beside the dates to move by weekday.</p>
        <div class="row group-legend">
          <span class="legend-chip full" title="Every attendee marked enough consecutive slots for the full meeting length">Light green = all attendees, full meeting</span>
          <span class="legend-chip partial-full" title="Everyone marked something at this start, but not all for the full meeting length">Amber = all attendees, partial meeting</span>
          <span class="legend-chip partial" title="Some but not all attendees marked this start">Purple = some attendees available</span>
          <span class="legend-chip selected" title="Your current proposed start before Accept">Dark green border = selected start</span>
        </div>
        <details class="confirm-section"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title" title="Pick a meeting start from the Group calendar">Proposed meeting time</summary>
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
                <div class="time-label" title="Time in ${escapeHtml(mtz)}">${formatWallHour(hm)}</div>
                ${days.map((day, i) => renderGroupSlotCell(m, toDateIso(day), hm, mtz, selected, fullMap, partialMap, dayHasGapBefore(days, i))).join('')}
              `).join('')}
            </div>
          </div>
        </details>
        <details class="confirm-section"${autoDetailsOpen(true) ? ' open' : ''}>
          <summary class="section-title">Proposed locations</summary>
          <p class="meta">Organisers can confirm <strong>up to one Online</strong> and <strong>up to one Physical</strong> location independently (click again to clear). Locations are optional.</p>
          <p class="meta"><strong>Online:</strong> ${selectedLocations.online ? locationInlineHtml(m, selectedLocations.online) : 'none selected'}</p>
          <p class="meta"><strong>Physical:</strong> ${selectedLocations.physical ? locationInlineHtml(m, selectedLocations.physical) : 'none selected'}</p>
          ${renderConfirmLocationChoices(m, state, isOrg, selectedLocations)}
          <p class="meta">Locations can be proposed and voted for on the <strong>Locations</strong> tab.</p>
        </details>
        <div class="row confirm-actions-row">
          ${renderAcceptTimeButton(isOrg, state, m)}
          ${renderAcceptLocationButton(isOrg, state, m)}
        </div>
      </section>`;
  }

  function renderAcceptTimeButton(isOrg, state, m) {
    const slot = effectiveConfirmSlot(state, m);
    const label = slot
      ? `Accept start: ${formatSlotLocal(slot)}`
      : 'Accept start: None proposed';
    if (!isOrg) {
      return `<button type="button" class="confirm-action-btn" data-action="confirm-time" disabled title="Organiser status required">${escapeHtml(label)}</button>`;
    }
    return `<button type="button" class="confirm-action-btn" data-action="confirm-time"${slot ? '' : ' disabled'} title="${slot ? 'Accept this start as the scheduled time' : 'Select a start slot below first'}">${escapeHtml(label)}</button>`;
  }

  function renderAcceptLocationButton(isOrg, state, m) {
    const locs = effectiveConfirmLocations(state, m);
    const parts = [];
    if (locs.online) {
      const loc = m.locations.find((l) => l.id === locs.online);
      parts.push(loc ? locationChipLabel(loc) : 'Online');
    }
    if (locs.physical) {
      const loc = m.locations.find((l) => l.id === locs.physical);
      parts.push(loc ? locationChipLabel(loc) : 'Physical');
    }
    const label = parts.length
      ? `Accept locations: ${parts.join('; ')}`
      : 'Accept locations: None proposed';
    if (!isOrg) {
      return `<button type="button" class="confirm-action-btn" data-action="confirm-locations" disabled title="Organiser status required">${escapeHtml(label)}</button>`;
    }
    return `<button type="button" class="confirm-action-btn" data-action="confirm-locations"${parts.length ? '' : ' disabled'} title="${parts.length ? 'Accept selected location(s)' : 'Select location(s) below first'}">${escapeHtml(label)}</button>`;
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

  function locationConfirmChannel(kind) {
    if (kind === 'hybrid') return 'both';
    if (kind === 'video' || kind === 'phone') return 'online';
    return 'physical';
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
      const channel = locationConfirmChannel(loc.kind);
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

  function renderLocationsTab(m, state, attendee) {
    const selectedLocs = effectiveConfirmLocations(state, m);
    return `
      <section class="panel stack" id="meeting-locations-pane">
        <h2 class="section-title">Locations</h2>
        <p class="meta"><strong>Select from locations proposed and save choice. Propose new location(s) if you need to.</strong></p>
        <div class="row group-legend loc-legend">
          <span class="legend-chip">Proposed location</span>
          <span class="legend-chip chip-demo active">Works for me (selected)</span>
          <span class="legend-chip selected">Selected by organiser</span>
        </div>
        <h3 class="section-title">Proposed locations</h3>
        <p class="meta">Clicking/tapping a location toggles its selection and saves your choice(s). Initials show attendees who are OK with each destination.</p>
        <div class="chip-list">${m.locations.length ? m.locations.map((loc) => renderLocationItem(m, state, attendee, loc, selectedLocs)).join('') : '<p class="meta">No locations proposed yet — use Propose a location below.</p>'}</div>
        ${attendee ? '' : '<p class="meta">Sign in on Attendees to save location preferences.</p>'}
        <details class="propose-location-block" open><summary>Propose a location</summary>
          <p class="meta">Anyone can propose a location. Add as many options as you like. Deleting a proposed location requires organiser status. Signed-in people can edit a proposal if the URL or details are wrong.</p>
          ${renderAddLocationForm(state)}
        </details>
      </section>`;
  }

  function renderLocationItem(m, state, attendee, loc, selectedLocs) {
    const selected = state.selectedLocations.has(loc.id);
    const organiserPicked = selectedLocs.online === loc.id || selectedLocs.physical === loc.id;
    const voters = attendeesForLocation(m, loc.id);
    const initials = voters.map((a) => a.initials || deriveInitials(a.display_name)).filter(Boolean).join(' ');
    const editing = state.editingLocationId === loc.id;
    if (editing && attendee) {
      return renderEditLocationForm(loc, attendee);
    }
    return `<div class="location-item">
      <button type="button" class="chip${selected ? ' active' : ''}${organiserPicked ? ' selected-start' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}"
        title="${selected ? 'Click to deselect as workable for you' : 'Click to select as workable for you'}">
        ${escapeHtml(locationChipLabel(loc))}${initials ? ` <span class="label-hint">(${escapeHtml(initials)})</span>` : ''}
      </button>
      ${attendee ? `<button type="button" class="compact-btn" data-action="edit-location" data-location-id="${escapeHtml(loc.id)}" title="Edit or remove this location">Edit or remove</button>` : ''}
    </div>`;
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

  // ─── Agree time tab ──────────────────────────────────────────────────────────

  function renderConfirmTab(m, state, attendee) {
    const isOrg = !!attendee?.is_organizer;
    const slotVal = m.confirmed_slot || state.pendingConfirmSlot || '';
    const locs = effectiveConfirmLocations(state, m);

    if (m.confirmed_slot) {
      return `
        <section class="panel stack">
          <h2 class="section-title">Agreed time &amp; location</h2>
          <div class="agreed-display">
            <p><span class="badge good">Agreed</span></p>
            <p class="meta"><strong>Time:</strong> ${formatTimePair(m.confirmed_slot)}</p>
            <p class="meta"><strong>Online:</strong> ${locs.online ? locationInlineHtml(m, locs.online) : '— none —'}</p>
            <p class="meta"><strong>Physical:</strong> ${locs.physical ? locationInlineHtml(m, locs.physical) : '— none —'}</p>
          </div>
          ${isOrg ? renderConfirmForm(m, state, slotVal, true) : '<p class="meta">The organiser can update the agreed time and location if needed.</p>'}
        </section>`;
    }

    return `
      <section class="panel stack">
        <h2 class="section-title">Agree time &amp; location</h2>
        <p class="meta">No time has been agreed yet. Once attendees have marked their availability, the organiser can choose a time and location here.</p>
        ${isOrg
          ? renderConfirmForm(m, state, slotVal, false)
          : `<p class="meta">You can see proposed times on <strong>Set confirmed meeting details</strong> (Group calendar). The organiser will agree the final time and it will appear here.</p>`}
      </section>`;
  }

  function renderConfirmForm(m, state, slotVal, isUpdate) {
    const locs = effectiveConfirmLocations(state, m);
    const onlineOpts = m.locations.filter((l) => ['video', 'phone', 'hybrid'].includes(l.kind));
    const physOpts = m.locations.filter((l) => ['physical', 'hybrid', 'other'].includes(l.kind));
    return `
      <details${isUpdate ? '' : ' open'}><summary>${isUpdate ? 'Update agreed time &amp; location (organiser)' : 'Agree meeting time &amp; location (organiser)'}</summary>
        <p class="meta">Choose a time from <strong>Set confirmed meeting details</strong> by clicking a slot, or enter a UTC time below. Online and Physical locations are optional.</p>
        <form class="inline-form" data-form="confirm" id="confirm-form">
          <label>Proposed meeting start time
            ${renderProposedStartBlock(m, slotVal)}
            <input type="hidden" name="confirmed_slot" id="confirmed-slot-hidden" value="${escapeHtml(slotVal)}">
            <details class="technical-slot-details">
              <summary>Enter UTC time manually</summary>
              <p class="meta">Format: <code>2026-09-03T10:00:00.000Z</code> (T separates date/time, Z means UTC)</p>
              <input class="mono" data-action="edit-confirmed-slot" value="${escapeHtml(slotVal)}" placeholder="2026-09-03T10:00:00.000Z">
            </details>
          </label>
          <label>Online location
            <select name="confirmed_location_online"><option value="">— none —</option>
              ${onlineOpts.map((l) => `<option value="${escapeHtml(l.id)}"${locs.online === l.id ? ' selected' : ''}>${escapeHtml(locationChipLabel(l))}</option>`).join('')}
            </select>
          </label>
          <label>Physical location
            <select name="confirmed_location_physical"><option value="">— none —</option>
              ${physOpts.map((l) => `<option value="${escapeHtml(l.id)}"${locs.physical === l.id ? ' selected' : ''}>${escapeHtml(locationChipLabel(l))}</option>`).join('')}
            </select>
          </label>
          <button type="submit">${isUpdate ? 'Update agreed time &amp; location' : 'Agree meeting time &amp; location'}</button>
        </form>
      </details>`;
  }

  function renderProposedStartBlock(m, slotVal) {
    if (m.confirmed_slot) {
      return `<p class="confirmed-time-display"><span class="label-hint">Currently agreed:</span> ${formatTimePair(m.confirmed_slot)}</p>`;
    }
    if (slotVal) {
      return `<p class="confirmed-time-display"><span class="label-hint">Proposed (not yet agreed):</span> ${formatTimePair(slotVal)}</p>`;
    }
    return '<p class="meta">No time selected yet. Choose a slot on the Group calendar (<strong>Set confirmed meeting details</strong>) or enter a UTC time below.</p>';
  }

  // ─── Agenda, Attachments and Records tab ─────────────────────────────────────

  function renderAgendaTab(m, state, attendee) {
    const urlAttachments = m.attachments.filter((a) => a.type !== 'text');
    const textRecords = m.attachments.filter((a) => a.type === 'text');
    const canEditDesc = !!attendee;
    const saveMetaBtn = `<button type="submit" form="meeting-resources-form">Save meeting resources</button>`;
    return `
      <section class="panel stack" id="meeting-agenda-pane">
        <h2 class="section-title">Meeting Resources</h2>
        <p class="meta">Meeting description, agenda, decisions, preparatory notes, attachments, and post-meeting records.</p>
        ${formSaveHeader(saveMetaBtn)}
        <form class="inline-form" data-form="update-meta" id="meeting-resources-form">
          <h3 class="section-title">Description for attendees</h3>
          <label><span class="label-hint">(simple HTML — also shown in the status bar at the top)</span>
            ${canEditDesc ? formatToolbar('organizer_intro', { withHelp: true, helpTopic: 'meeting description' }) : ''}
            <textarea name="organizer_intro" rows="4" placeholder="${escapeHtml(INTRO_PLACEHOLDER)}"${canEditDesc ? '' : ' readonly'}>${escapeHtml(m.organizer_intro || '')}</textarea>
          </label>
          <h3 class="section-title">Notes &amp; agenda</h3>
          ${m.agenda.length ? `<p class="meta"><strong>Agenda:</strong></p><ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
          ${m.decisions.length ? `<p class="meta"><strong>Decisions required:</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
          ${(m.notes || '').trim() ? `<div class="meet-intro-body notes-display">${sanitizeHtml(m.notes)}</div>` : ''}
          <details class="notes-edit-details"${state.openNotesEditor ? ' open' : ''}><summary>Edit agenda / decisions / notes</summary>
            <label>Agenda <span class="label-hint">(plain text, each line is displayed as a bullet)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(plain text, each line is displayed as a bullet)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes <span class="label-hint">(simple HTML)</span>
              ${formatToolbar('notes', { withHelp: false })}
              <textarea name="notes" rows="3">${escapeHtml(m.notes || '')}</textarea>
            </label>
          </details>
          ${canEditDesc ? `<button type="submit">Save meeting resources</button>` : '<p class="meta">Sign in on Attendees to edit meeting resources.</p>'}
        </form>
        <h3 class="section-title">Attachments</h3>
        <details class="add-attachment-details"><summary>Add attachment</summary>
          ${renderAddAttachmentForm()}
        </details>
        ${urlAttachments.length ? urlAttachments.map((a) => renderAttachment(a, attendee, state)).join('') : '<p class="meta">No attachments yet.</p>'}
        <h3 class="section-title">Records</h3>
        <p class="meta">Recordings, transcripts, and AI summaries after the meeting.</p>
        ${textRecords.length ? textRecords.map((a) => renderAttachment(a, attendee, state)).join('') : '<p class="meta">No records yet.</p>'}
      </section>`;
  }

  function renderAddAttachmentForm() {
    return `
      <form class="inline-form add-attachment-form" data-form="add-attachment">
        <label>Label <input name="label" required placeholder="Label"></label>
        <fieldset class="add-mode-row">
          <legend class="label-hint">Type</legend>
          <div class="mode-options">
            <label class="mode-choice"><input type="radio" name="attachment_type" value="url" checked><span>URL</span></label>
            <label class="mode-choice"><input type="radio" name="attachment_type" value="text"><span>Text summary</span></label>
          </div>
        </fieldset>
        <div data-attach-fields="url" class="loc-fields">
          <label>Link <input name="url" type="text" value="https://" placeholder="https://example.com/..."></label>
          <p class="meta span-full">Use a full web address starting with https://</p>
        </div>
        <div data-attach-fields="text" class="loc-fields" hidden>
          <label>Summary <textarea name="body" rows="3" placeholder="Paste summary (plain text)"></textarea></label>
        </div>
        <button type="submit">Attach</button>
      </form>`;
  }

  // ─── Meeting options tab ─────────────────────────────────────────────────────

  function renderOptionsTab(m, state, attendee) {
    const canEdit = canEditOptions(m, attendee);
    const mtz = meetingTz(m);
    const saveBtn = canEdit ? '<button type="submit">Save calendar options</button>' : '';
    return `
      <section class="panel stack">
        <h2 class="section-title">Calendar Options</h2>
        ${canEdit
          ? '<p class="meta">Don\'t forget to <strong>Save calendar options</strong> after amending details.</p>'
          : '<p class="meta"><strong>View only.</strong> Only a meeting organiser can change these settings.</p>'}
        ${canEdit && !m.attendees.length ? '<p class="meta"><strong>Setup:</strong> Save your options below. Then return to Getting started or go straight to Attendees to add yourself as the first attendee.</p>' : ''}
        ${canEdit && !m.attendees.length ? `<div class="row">
          <button type="button" class="btn-nav compact-btn" data-action="tab" data-tab="getting-started">Back to Getting started</button>
          <button type="button" class="btn-nav compact-btn" data-action="tab" data-tab="attendees">Next step: Attendees →</button>
        </div>` : ''}
        <form class="inline-form organizer-form" data-form="update-settings">
          ${formSaveHeader(saveBtn)}
          <fieldset class="options-fieldset"${canEdit ? '' : ' disabled'}>
          <div class="form-grid">
            <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
          </div>
          <div class="form-grid">
            <label title="Full meeting duration. Plain number = minutes. Also: 1.5h, 2,5h, 90m (comma decimal OK).">Meeting length
              <input type="text" name="duration_input" value="${escapeHtml(formatDurationForInput(m.duration_minutes))}" placeholder="e.g. 60, 1.5h, 2,5h">
            </label>
            <label title="Calendar grid cell size — how finely attendees can mark partial availability. Must divide meeting length evenly.">Calendar slot size
              <input type="text" name="slot_granularity_input" value="${escapeHtml(formatDurationForInput(m.slot_granularity_minutes))}" placeholder="e.g. 30, 15m">
            </label>
            <label class="checkbox-label" title="When off, Saturday and Sunday are hidden from calendar navigation"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
          </div>
          <p class="meta options-duration-hint"><strong>Meeting length</strong> (${formatDurationLabel(m.duration_minutes)}) is the whole meeting. <strong>Calendar slot size</strong> (${formatDurationLabel(m.slot_granularity_minutes)}) is one cell — use a smaller slot if people may attend for only part of the meeting. Slot size must divide meeting length evenly (e.g. 3 h meeting with 1 h slots → select 3 consecutive slots for full attendance).${meetingSlotSteps(m).valid && meetingSlotSteps(m).steps > 1 ? ` Currently ${meetingSlotSteps(m).steps} slot(s) per full meeting.` : ''}${!meetingSlotSteps(m).valid ? ' <strong>Current settings do not divide evenly — please fix before saving.</strong>' : ''}</p>
          <details class="session-presets-block">
            <summary title="Half-day shortcuts for meeting length">Half-day presets (AM / PM)</summary>
            <p class="meta">Default AM <strong>09:00–12:00</strong>, PM <strong>12:00–16:00</strong>. Adjust the times if your organisation uses different half-days (e.g. AM until 13:00, PM 15:00–18:00). Buttons set <em>meeting length</em> and snap <em>grid hours</em> to that session — change slot size if needed, then save.</p>
            <div class="form-grid session-times-grid">
              <label title="Start of morning (AM) session">AM from<input type="time" name="am_start" value="${escapeHtml(m.am_start || '09:00')}"></label>
              <label title="End of morning (AM) session">AM until<input type="time" name="am_end" value="${escapeHtml(m.am_end || '12:00')}"></label>
              <label title="Start of afternoon (PM) session">PM from<input type="time" name="pm_start" value="${escapeHtml(m.pm_start || '12:00')}"></label>
              <label title="End of afternoon (PM) session">PM until<input type="time" name="pm_end" value="${escapeHtml(m.pm_end || '16:00')}"></label>
            </div>
            <div class="row session-preset-btns">
              <button type="button" class="btn-nav compact-btn" data-action="preset-duration-am" title="Set meeting length to the AM session and snap grid hours to the AM window">Use AM length (${formatDurationLabel(minutesBetweenTimes(m.am_start || '09:00', m.am_end || '12:00'))})</button>
              <button type="button" class="btn-nav compact-btn" data-action="preset-duration-pm" title="Set meeting length to the PM session and snap grid hours to the PM window">Use PM length (${formatDurationLabel(minutesBetweenTimes(m.pm_start || '12:00', m.pm_end || '16:00'))})</button>
            </div>
          </details>
          <details class="timezone-block">
            <summary>Calendar hours timezone <span class="label-hint">(defaults to yours: ${escapeHtml(tz)})</span></summary>
            <p class="meta">These times will be displayed for each person in their local time zone and UTC. The timezone below only affects which timezone the "earliest/latest" hours are defined in, so everyone marks the same slots.</p>
            <label>Timezone
              <select name="timezone">${timezoneOptions(m.timezone)}</select>
            </label>
          </details>
          <div class="form-grid">
            <label title="Earliest date this meeting is open for scheduling.">Earliest bookable meeting start<input type="date" name="range_start" value="${escapeHtml(optionsRangeStart(m))}"></label>
            <label title="Earliest start time shown on the calendar grid each day (meeting timezone).">Allow bookings from <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
            <label title="Latest date this meeting is open for scheduling. Leave blank for open-ended.">Require bookings to be on or before <span class="label-hint">(optional — blank = open-ended)</span><input type="date" name="range_end" value="${escapeHtml(optionsRangeEnd(m))}"></label>
            <label title="Latest end time shown on the calendar grid each day (meeting timezone).">Allow bookings up until <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
          </div>
          <details>
            <summary class="recurrence-summary">Recurrence: ${escapeHtml(m.recurrence_label || 'One-off')}</summary>
            <label>Recurrence type<select name="recurrence_type">${recurrenceOptions(m.recurrence.type)}</select></label>
            <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence, m.show_weekends)}</div>
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
    const summaryLabel = established && signedIn && !standalone
      ? `Registered attendees (${m.attendees.length}) — click to expand`
      : `Registered attendees (${m.attendees.length || 'none yet'})`;
    const listHint = signedIn
      ? (attendee.is_organizer
        ? 'Use the Organiser column to assign organiser rights. Remove duplicate rows using Merge below if needed.'
        : 'Use Remove duplicate (keep me) if you appear more than once.')
      : 'Tick <strong>Me</strong> on your row if you are already listed, or fill in the form below to add yourself.';
    const claiming = m.attendees.find((a) => a.id === state.claimingId);
    const showOrganiserCol = signedIn && attendee.is_organizer;
    const colCount = 6 + (showOrganiserCol ? 1 : 0);

    const body = `
        ${listHint ? `<p class="meta">${listHint}</p>` : ''}
        <div class="table-wrap table-wrap-compact attendee-table-wrap">
          <table class="data-table attendee-table">
            <thead><tr><th class="col-me" title="Sign in as this row">Me</th><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th><th>Passcode</th>${showOrganiserCol ? '<th>Organiser</th>' : ''}</tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => renderAttendeeRow(m, state, attendee, a, { signedIn, showOrganiserCol })).join('') : `<tr><td colspan="${colCount}">None yet</td></tr>`}
            </tbody>
          </table>
        </div>
        ${claiming ? renderClaimPinForm(claiming) : ''}
        ${signedIn && state.editingAttendeeId === attendee.id ? renderEditAttendeeForm(attendee, state) : ''}
        ${signedIn && attendee.is_organizer ? renderOrganiserMergePanel(m) : ''}
        ${renderAddAttendeeForm(signedIn, attendee)}
        ${showContinue ? renderContinueToCalendar(state) : ''}`;

    if (standalone) {
      return `
      <div class="attendee-block stack attendee-block-standalone">
        <h2 class="section-title">Attendees</h2>
        ${body}
      </div>`;
    }

    return `
      <details class="attendee-block stack"${panelOpen ? ' open' : ''}>
        <summary class="attendee-block-summary">${summaryLabel}</summary>
        <div class="attendee-block-body stack">
        ${body}
        </div>
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

  function renderAddAttendeeForm(signedIn, attendee) {
    const modeRow = signedIn ? '' : `
        <div class="add-mode-row add-mode-inline">
          <div class="mode-options mode-options-inline">
            <label class="mode-choice"><input type="radio" name="add_mode" value="self" checked><span>Myself</span></label>
            <label class="mode-choice"><input type="radio" name="add_mode" value="propose"><span>Someone else</span></label>
          </div>
          <p class="meta add-field-guide">Display name: any text including email. Initials: optional (defaults from name). Contact: optional — email, phone, or a comma-separated list. Passcode: optional — ${PASSCODE_TIP}</p>
        </div>`;
    const pinRow = signedIn ? '' : `
          <label class="field-pin">Passcode <span class="label-hint">(optional)</span>
            <input class="input-pin" name="pin" type="text" autocomplete="new-password" maxlength="22" size="22" title="${escapeHtml(PASSCODE_TIP)}">
          </label>`;
    const extras = signedIn ? '' : `
        <p class="meta propose-hint" data-show-when="propose" hidden>They are not emailed — share the meeting link with them. They tick <strong>Me</strong> on their row to sign in.</p>`;
    const intro = signedIn
      ? `<p class="meta">You are signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>. Use this form to add <strong>someone else</strong>. Display name: any text. Initials/contact optional (contact may be comma-separated).</p>`
      : '<p class="meta">Add yourself as an attendee, or propose someone else.</p>';
    return `
        <div class="add-attendee-block">
          <h3 class="section-title">${signedIn ? 'Add another attendee' : 'Add new attendee'}</h3>
          ${intro}
          <form class="inline-form add-attendee-form" data-form="add-attendee">
            ${signedIn ? '<input type="hidden" name="add_mode" value="propose">' : ''}
            ${modeRow}
            <div class="add-attendee-fields">
              <label class="field-name">Display name
                <input class="input-name" name="display_name" required maxlength="80" placeholder="e.g. name or email">
              </label>
              <label class="field-initials">Initials <span class="label-hint">(opt.)</span>
                <input class="input-initials" name="initials" maxlength="4">
              </label>
              <label class="field-contact">Contact <span class="label-hint">(opt.)</span>
                <input class="input-contact" name="contact" maxlength="120" placeholder="email, phone" autocomplete="email">
              </label>
              ${pinRow}
            </div>
            ${extras}
            <button type="submit">${signedIn ? 'Add another attendee' : 'Add attendee'}</button>
          </form>
        </div>`;
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
    if (!signedIn) {
      meCell = `<td class="col-me"><button type="button" class="claim-tick-btn" data-action="claim-row" data-attendee-id="${escapeHtml(a.id)}" title="Sign in as this attendee" aria-label="Sign in as ${escapeHtml(a.display_name)}">☐</button></td>`;
    } else if (isSelf) {
      meCell = `<td class="col-me"><span class="claim-tick on" title="You">✓</span></td>`;
    } else if (current && dupOfSelf) {
      meCell = `<td class="col-me"><button type="button" class="claim-tick-btn merge-tick" data-action="merge-into-me" data-remove-id="${escapeHtml(a.id)}" title="Merge duplicate into your row">☐</button></td>`;
    } else {
      meCell = '<td class="col-me"></td>';
    }

    const organiserCell = showOrganiserCol
      ? `<td><input type="checkbox" data-action="toggle-organizer" data-attendee-id="${escapeHtml(a.id)}" ${a.is_organizer ? 'checked' : ''} aria-label="Meeting organiser for ${escapeHtml(a.display_name)}"></td>`
      : '';

    return `<tr class="attendee-row${isSelf ? ' is-self' : ''}${!signedIn ? ' is-selectable' : ''}">
      ${meCell}
      <td>${escapeHtml(a.display_name)}</td>
      <td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
      <td>${renderContactCell(a)}</td>
      <td>${countSlotsFor(m, a.id)}</td>
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

  function renderOrganiserMergePanel(m) {
    const keepId = m.attendees[0]?.id || '';
    const removeId = m.attendees.length > 1 ? m.attendees[1].id : keepId;
    const optHtml = (selectedId) => m.attendees.map((a, i) =>
      `<option value="${escapeHtml(a.id)}"${a.id === selectedId ? ' selected' : ''}>${i + 1}. ${escapeHtml(attendeeLabel(a))}</option>`
    ).join('');
    return `
      <details class="merge-organiser-panel help-toggle">
        <summary><span class="help-q">?</span> Merge duplicate attendees (organiser)</summary>
        <form class="inline-form row" data-form="merge-organiser">
          <label>Keep row 1 <select name="keep_id" required>${optHtml(keepId)}</select></label>
          <label>Remove row 2 <select name="remove_id" required>${optHtml(removeId)}</select></label>
          <button type="submit">Merge</button>
        </form>
        <p class="meta help-body">Availability from the removed row is combined into the kept row. You do not need their passcode as organiser.</p>
      </details>`;
  }

  // ─── Location helpers ────────────────────────────────────────────────────────

  function locationKindLabel(kind) {
    return { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[kind] || kind;
  }

  function locationChipLabel(loc) {
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
    if (state.selectedSlots.has(slotIso)) return true;
    if (!attendeeId) return false;
    return availabilityIdsAt(m, slotIso).includes(attendeeId);
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
        const duration = parseDurationInput(fd.get('duration_input'));
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
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          am_start: fd.get('am_start'), am_end: fd.get('am_end'),
          pm_start: fd.get('pm_start'), pm_end: fd.get('pm_end'),
          range_start: rangeStart, range_end: rangeEnd,
          timezone: normalizeTimezone(fd.get('timezone')),
          show_weekends: fd.get('show_weekends') === 'on',
          recurrence: buildRecurrenceFromForm(fd),
        });
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
        const online = String(fd.get('confirmed_location_online') || '').trim();
        const physical = String(fd.get('confirmed_location_physical') || '').trim();
        data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_slot: fd.get('confirmed_slot'),
          confirmed_location_online: online,
          confirmed_location_physical: physical,
        });
        state.pendingConfirmSlot = null;
        state.pendingConfirmLocationOnline = null;
        state.pendingConfirmLocationPhysical = null;
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
      else if (kind === 'add-attendee') toast((fd.get('add_mode') || 'self') === 'self' ? 'You are signed in. Next: mark availability, then share the meeting link.' : 'Attendee added');
      else if (kind === 'edit-attendee') toast(fd.get('clear_pin') === 'on' ? 'Passcode removed' : 'Your details were updated');
      else if (kind === 'confirm') toast('Meeting time agreed — status updated');
      else if (kind === 'update-settings') {
        toast(state.attendeeId
          ? 'Calendar options saved.'
          : 'Calendar options saved. Next: add yourself as attendee (or return to Getting started).');
      }
      else if (kind === 'update-meta') toast('Meeting resources saved');
      else toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  async function handleClick(e, root, state) {
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

    if (action === 'ack-link-shared') {
      localStorage.setItem(setupLinkCopiedKey(state.slug), 'yes');
      toast('Marked as shared');
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
      const form = btn.closest('form[data-form="update-settings"]');
      if (!form) return;
      const isAm = action === 'preset-duration-am';
      const startName = isAm ? 'am_start' : 'pm_start';
      const endName = isAm ? 'am_end' : 'pm_end';
      const start = form.querySelector(`[name="${startName}"]`)?.value;
      const end = form.querySelector(`[name="${endName}"]`)?.value;
      if (!start || !end) {
        toast('Set AM/PM session times first', true);
        return;
      }
      const mins = minutesBetweenTimes(start, end);
      if (mins < 1) {
        toast('Session end must be after start', true);
        return;
      }
      const durInput = form.querySelector('[name="duration_input"]');
      if (durInput) durInput.value = formatDurationForInput(mins);
      const dayStart = form.querySelector('[name="day_start"]');
      const dayEnd = form.querySelector('[name="day_end"]');
      if (dayStart) dayStart.value = start;
      if (dayEnd) dayEnd.value = end;
      toast(`${isAm ? 'AM' : 'PM'} length set to ${formatDurationLabel(mins)} — check slot size divides evenly, then save`);
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
        toast('Only organisers can set the currently selected location', true);
        return;
      }
      const loc = state.meet.locations.find((l) => l.id === btn.dataset.locationId);
      if (!loc) return;
      const channel = locationConfirmChannel(loc.kind);
      const id = loc.id;
      const cur = effectiveConfirmLocations(state, state.meet);
      if (channel === 'both') {
        const on = cur.online === id && cur.physical === id;
        state.pendingConfirmLocationOnline = on ? '' : id;
        state.pendingConfirmLocationPhysical = on ? '' : id;
      } else if (channel === 'online') {
        state.pendingConfirmLocationOnline = cur.online === id ? '' : id;
      } else {
        state.pendingConfirmLocationPhysical = cur.physical === id ? '' : id;
      }
      render(root, state);
      toast('Confirmed location selection updated');
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
    if (action === 'confirm-locations') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can accept proposed locations', true);
        return;
      }
      const locs = effectiveConfirmLocations(state, state.meet);
      try {
        const data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_location_online: locs.online || '',
          confirmed_location_physical: locs.physical || '',
        });
        state.meet = data.meet;
        state.pendingConfirmLocationPhysical = null;
        state.pendingConfirmLocationOnline = null;
        render(root, state);
        toast('Confirmed location(s) saved');
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
  function contactHref(c) {
    const v = String(c || '').trim();
    if (!v) return '#';
    if (v.includes(',')) return '#';
    if (v.includes('@')) return isWellFormedEmail(v) ? `mailto:${v}` : '#';
    return `tel:${v}`;
  }
  function renderContactCell(a) {
    if (!a.contact) return '—';
    const parts = String(a.contact).split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.map((part) => {
        if (part.includes('@') && !isWellFormedEmail(part)) return `${escapeHtml(part)} <span class="badge warn" title="Not a valid email">check</span>`;
        const href = contactHref(part);
        if (href === '#') return escapeHtml(part);
        return `<a href="${escapeHtml(href)}">${escapeHtml(part)}</a>`;
      }).join(', ');
    }
    if (a.contact.includes('@') && !isWellFormedEmail(a.contact)) return `${escapeHtml(a.contact)} <span class="badge warn" title="Not a valid email">check</span>`;
    const href = contactHref(a.contact);
    if (href === '#') return escapeHtml(a.contact);
    return `<a href="${escapeHtml(href)}">${escapeHtml(a.contact)}</a>`;
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
