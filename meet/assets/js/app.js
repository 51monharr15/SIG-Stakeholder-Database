(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const TZ_ALIASES = {
    EDT: 'America/New_York', EST: 'America/New_York',
    CDT: 'America/Chicago', CST: 'America/Chicago',
    MDT: 'America/Denver', MST: 'America/Denver',
    PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles',
    BST: 'Europe/London', GMT: 'UTC',
  };
  const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Toronto', 'America/Sao_Paulo',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
  ];
  const INTRO_PLACEHOLDER = 'Add a short description for attendees — use Meeting options.';
  const isTouchUi = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  const page = document.body.dataset.page;

  document.getElementById('footer-tz')?.replaceChildren(document.createTextNode(tz));

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  // ─── Home page ───────────────────────────────────────────────────────────────

  function initHome() {
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
        const res = await apiPost({
          action: 'list_meetings',
          display_name: data.get('display_name'),
          pin: data.get('pin'),
        });
        if (!box) return;
        box.hidden = false;
        if (!res.meetings?.length) {
          box.innerHTML = '<p class="meta">No meetings found for that name and PIN. Check spelling and that you set a PIN when you registered.</p>';
          return;
        }
        box.innerHTML = `<p class="meta">${res.meetings.length} meeting(s):</p><ul>${
          res.meetings.map((m) => {
            const when = String(m.range_start || '').trim() || String(m.created || '').slice(0, 10);
            const disambig = when ? ` · starts ${escapeHtml(when)}` : '';
            return `<li><a href="${escapeHtml(meetingUrl(m.slug))}">${escapeHtml(m.title)}</a> <span class="meta">(${escapeHtml(m.slug)}${disambig})</span></li>`;
          }).join('')
        }</ul>`;
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
      changingPin: false,
      pendingConfirmLocation: null,
      showAllGroupHours: localStorage.getItem(groupHoursKey(slug)) === 'all',
      openNotesEditor: false,
      overviewHelpOpen: localStorage.getItem(overviewHelpKey(slug)) !== 'closed',
      attendeePanelOpen: undefined,
      lastDayCount: visibleDayCount(),
      helpOpen: false,
    };

    try {
      state.meet = await fetchMeet(slug);
      if (state.attendeeId && !state.meet.attendees.some((a) => a.id === state.attendeeId)) {
        state.attendeeId = '';
        localStorage.removeItem(attendeeKey(slug));
      }
      const explicit = tabFromUrl();
      const signedIn = state.meet.attendees.find((a) => a.id === state.attendeeId);
      let activeTab = explicit || localStorage.getItem(tabKey(slug)) || 'overview';
      const validTabs = allValidTabs(state.meet, signedIn);
      if (!validTabs.includes(activeTab)) activeTab = validTabs[0] || 'overview';
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

  function tabFromUrl() {
    const t = new URLSearchParams(window.location.search).get('view');
    const valid = ['overview', 'attendees', 'calendar', 'group', 'locations', 'notes', 'records', 'options'];
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

  function timezoneOptions(selected) {
    const current = normalizeTimezone(selected);
    const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : COMMON_TIMEZONES;
    const ids = [...new Set([current, tz, ...COMMON_TIMEZONES, ...all])].sort();
    return ids.map((id) => `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(timezoneLabel(id))}</option>`).join('');
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
    const signedIn = state.meet?.attendees.find((a) => a.id === state.attendeeId);
    if (tab === 'options' && state.meet?.attendees.length && !signedIn?.is_organizer) {
      toast('Only meeting organisers can access meeting options', true);
      return;
    }
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
    // Step 1: options were set at creation (title) or explicitly saved
    const step1 = localStorage.getItem(setupOptionsSavedKey(state.slug)) === 'yes'
      || !!(m.title?.trim());
    const step2 = !!attendee;
    const step3 = !!attendee && countSlotsFor(m, attendee.id) > 0;
    // Step 4: link copied/acknowledged, or another attendee joined via the link
    const step4 = localStorage.getItem(setupLinkCopiedKey(state.slug)) === 'yes'
      || (m.attendees?.length || 0) > 1;
    const allDone = step1 && step2 && step3 && step4;
    return { isOrg, step1, step2, step3, step4, allDone };
  }

  function restoreAttendeeSelections(state) {
    if (!state.attendeeId) return;
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
    { id: 'overview',   label: 'Overview',          tip: 'Summary of the meeting — status, attendees, and best overlap times.' },
    { id: 'attendees',  label: 'Attendees',          tip: 'Register yourself, add others, and manage the attendee list.' },
    { id: 'calendar',   label: 'My availability',   tip: 'Mark the times when you are free on the calendar grid.' },
    { id: 'group',      label: 'Set confirmed meeting details', tip: 'Viewed by anyone. Set/changed by organisers.' },
    { id: 'locations',  label: 'Locations',          tip: 'Propose meeting locations and mark your preferences.' },
    { id: 'notes',      label: 'Notes & agenda',     tip: 'Agenda items, decisions needed, and preparatory notes.' },
    { id: 'records',    label: 'Records',            tip: 'After the meeting: recordings, transcripts, and summaries.' },
    { id: 'options',    label: 'Meeting options',    tip: 'Meeting length, grid step, timezone, recurrence — organiser only.', organiserOnly: true },
  ];

  function allValidTabs(m, attendee) {
    return TAB_DEFS
      .filter((t) => !t.organiserOnly || canShowOptions(m, attendee))
      .map((t) => t.id);
  }

  function canShowOptions(m, attendee) {
    return !m.attendees.length || !!attendee?.is_organizer;
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

    root.innerHTML = `
      <div class="meet-shell">
        <div class="sticky-top">
          <div class="sticky-top-inner">
            <div class="sticky-head row">
              <h1 class="meet-title">${escapeHtml(m.title)}</h1>
              <div class="row">
                <button type="button" class="secondary compact-btn" data-action="toggle-help" title="How to use this meeting scheduler">How to use this</button>
                <button type="button" class="compact-btn" data-action="copy-link" title="Copy meeting link">Copy meeting link</button>
              </div>
            </div>
            ${renderMeetingStatus(m)}
            <nav class="dashboard-nav" aria-label="Meeting sections">
              ${renderDashboardNav(m, state, attendee)}
            </nav>
            ${state.helpOpen ? renderHelpPanel(m, attendee) : ''}
            <div class="sticky-extras is-open">
              <p class="meta tz-banner">Calendar hours in <strong>${escapeHtml(meetingTz(m))}</strong> · Your timezone: <strong>${escapeHtml(tz)}</strong></p>
              <div class="share-row row desktop-share">
                <input class="share-input" type="text" readonly value="${escapeHtml(shareUrl(state.slug))}" id="share-url-input">
              </div>
            </div>
          </div>
        </div>
        <div class="meet-content">
          ${state.activeTab === 'overview'  ? renderOverviewTab(m, state, attendee) : ''}
          ${state.activeTab === 'attendees' ? renderAttendeesTab(m, state, attendee) : ''}
          ${state.activeTab === 'calendar'  ? renderCalendarTab(m, state, attendee) : ''}
          ${state.activeTab === 'group'     ? renderGroupAvailabilityTab(m, state, attendee) : ''}
          ${state.activeTab === 'locations' ? renderLocationsTab(m, state, attendee) : ''}
          ${state.activeTab === 'notes'     ? renderNotesTab(m, state, attendee) : ''}
          ${state.activeTab === 'records'   ? renderRecordsTab(m, state) : ''}
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

  function afterRenderScroll(root, state) {}

  // ─── Dashboard nav ───────────────────────────────────────────────────────────

  function renderDashboardNav(m, state, attendee) {
    return TAB_DEFS
      .filter((t) => !t.organiserOnly || canShowOptions(m, attendee))
      .map((t) => {
        const active = state.activeTab === t.id;
        return `<button type="button" class="dash-btn${active ? ' active' : ''}" data-action="tab" data-tab="${t.id}" title="${escapeHtml(t.tip)}">${escapeHtml(t.label)}</button>`;
      }).join('');
  }

  // ─── Meeting status strip ────────────────────────────────────────────────────

  function renderMeetingStatus(m) {
    if (m.confirmed_slot) {
      const tip = 'To change: open Set confirmed meeting details and update as organiser.';
      return `<div class="status-strip">
        <span class="badge good" title="${escapeHtml(tip)}">Agreed</span>
        <span class="meta">Time: ${formatTimePair(m.confirmed_slot)}</span>
        <span class="meta">Location: ${locationInlineHtml(m, m.confirmed_location)}</span>
      </div>`;
    }
    const proposed = bestProposedSlot(m);
    let timeHint = 'No agreed time yet';
    if (proposed?.kind === 'everyone') {
      timeHint = `Best slot (everyone free): ${formatSlotLocal(proposed.slot)}`;
    } else if (proposed?.kind === 'organiser_plus_one') {
      timeHint = `Best partial overlap: ${formatSlotLocal(proposed.slot)}`;
    }
    const locHint = m.locations?.length
      ? `${m.locations.length} location(s) proposed`
      : 'No location proposed yet';
    return `<div class="status-strip">
      <span class="badge">Scheduling</span>
      <span class="meta">${escapeHtml(timeHint)}</span>
      <span class="meta">${escapeHtml(locHint)}</span>
    </div>`;
  }

  // ─── Help panel ──────────────────────────────────────────────────────────────

  function renderHelpPanel(m, attendee) {
    const established = meetingEstablished(m);
    return `
      <div class="help-panel" id="help-panel">
        <div class="help-panel-inner">
          <div class="help-panel-header row">
            <strong>How to use this meeting scheduler</strong>
            <button type="button" class="secondary compact-btn" data-action="toggle-help" title="Close help panel">Close</button>
          </div>
          <div class="help-columns">
            <div class="help-col">
              <h3 class="help-heading">Setting up a meeting (organiser)</h3>
              <ol class="help-steps">
                <li><strong>Meeting options</strong> — set the title, meeting length, calendar hours, timezone, and optionally a description for attendees. Save when done.</li>
                <li><strong>Attendees</strong> — add yourself first. Choose "Myself", enter your name, and optionally set a PIN (lets you find this meeting from the home page later). You become the organiser.</li>
                <li><strong>My availability</strong> — mark every time slot when you are free by clicking or dragging on the calendar grid. Press <em>Save my availability</em>.</li>
                <li><strong>Locations</strong> — optionally propose one or more meeting locations (online or physical).</li>
                <li><strong>Share the link</strong> — press <em>Copy link</em> at the top of the page and send it to your attendees. Anyone with the link can join.</li>
                <li>Once attendees have marked their availability, open <strong>Set confirmed meeting details</strong> to see overlaps.</li>
                <li>When ready, choose a start slot and location there, then set confirmed meeting details. The status badge changes to <em>Agreed</em>.</li>
              </ol>
            </div>
            <div class="help-col">
              <h3 class="help-heading">Joining a meeting (attendee)</h3>
              <ol class="help-steps">
                <li>Open the meeting link you were sent. You will see the meeting title and current status.</li>
                <li>Go to <strong>Attendees</strong>. If you are already listed, press <em>This is me</em> on your row and enter your PIN if prompted. If you are not listed, fill in the <em>Add new attendee</em> form with your name.</li>
                <li>Open <strong>My availability</strong> and mark every slot when you are free. Press <em>Save my availability</em>. You can come back and update this any time.</li>
                <li>Open <strong>Locations</strong> to see any proposed venues. Click locations that work for you (blue means saved). Click again to remove. You can also propose a new location.</li>
                <li>Open <strong>Set confirmed meeting details</strong> to see how times overlap and what is proposed/agreed.</li>
                <li>Check the top status badge for the current agreed time and location.</li>
                <li>Repeat any of these steps as the meeting evolves — there is no fixed order.</li>
              </ol>
            </div>
          </div>
          <div class="help-footer">
            <p class="meta">The <strong>Copy link</strong> button at the top copies the meeting URL. Save it — the random code in the link is the only way back to this meeting unless you set a PIN. The <em>Find my meetings</em> option on the home page lets you look up meetings by name and PIN.</p>
          </div>
        </div>
      </div>`;
  }

  // ─── Overview tab ────────────────────────────────────────────────────────────

  function renderOverviewTab(m, state, attendee) {
    const established = meetingEstablished(m);
    const setup = setupChecklistState(m, state, attendee);

    if (!established || (setup.isOrg && !setup.allDone)) {
      return `
        <section class="panel stack overview-panel">
          <h2 class="section-title">Getting started</h2>
          <p><strong>Meeting is currently in setup mode.</strong> Follow these steps to make it ready for attendees.</p>
          <ol class="setup-steps">
            <li>
              <strong>${setup.step1 ? '✓ ' : ''}Set meeting options</strong> — set the title, meeting length, calendar hours, and timezone.
              <br><button type="button" class="secondary compact-btn" data-action="tab" data-tab="options" style="margin-top:0.35rem">Go to Meeting options →</button>
            </li>
            <li>
              <strong>${setup.step2 ? '✓ ' : ''}Add yourself as an attendee</strong> — you will become the default organiser.
              <br><button type="button" class="secondary compact-btn" data-action="tab" data-tab="attendees" style="margin-top:0.35rem">Go to Attendees →</button>
            </li>
            <li>
              <strong>${setup.step3 ? '✓ ' : ''}Mark your availability</strong> — open My availability and click the slots when you are free. Optionally propose a location on Locations.
              <br><button type="button" class="secondary compact-btn" data-action="tab" data-tab="calendar" style="margin-top:0.35rem">Go to My availability →</button>
            </li>
            <li>
              <strong>${setup.step4 ? '✓ ' : ''}Share the link</strong> — Copy meeting link and send it to all attendees so they can open this meeting and enter availability.
              <br><span class="row" style="margin-top:0.35rem;flex-wrap:wrap;gap:0.35rem">
                <button type="button" class="secondary compact-btn" data-action="copy-link">Copy meeting link</button>
                <button type="button" class="secondary compact-btn" data-action="ack-link-shared" title="Mark this step done if you have already sent the link by other means">I've shared the link</button>
              </span>
            </li>
          </ol>
          ${setup.isOrg && setup.allDone ? '<p class="meta"><strong>Setup complete.</strong> You can now run the meeting in active mode using the tabs above.</p>' : '<p class="meta">The checklist stays visible until all four steps are complete.</p>'}
        </section>`;
    }

    const sorted = sortSuggestions(m, 'date').slice(0, 5);
    const desc = (m.organizer_intro || '').trim();
    const signedIn = !!attendee;
    const isOrg = !!attendee?.is_organizer;

    // Attendee prompt (shown when signed in as a regular attendee or not yet signed in)
    const attendeePrompt = `
      <details class="attendee-prompt overview-help"${state.overviewHelpOpen ? ' open' : ''}>
        <summary class="section-title" title="Tap or click to expand/collapse">What to do next</summary>
        ${isOrg ? `<ul class="help-steps">
          <li>Review <strong>Meeting options</strong> for duration, timezone, and recurrence.</li>
          <li>Open <strong>Attendees</strong> to confirm who is invited and organiser roles.</li>
          <li>Open <strong>My availability</strong> and mark your own slots.</li>
          <li>Allow time for attendees to mark their availability.</li>
          <li>Open <strong>Set confirmed meeting details</strong> to review overlap and pick a proposed start slot.</li>
          <li>Open <strong>Locations</strong> to review and select location preference.</li>
          <li>Set confirmed meeting details when ready.</li>
        </ul>` : `<ul class="help-steps">
          <li>Open <strong>My availability</strong> and mark every time slot when you are free. Save when done.</li>
          <li>Open <strong>Locations</strong> — review proposed venues and select the ones that work for you.</li>
          <li>Open <strong>Set confirmed meeting details</strong> to see overlap and discuss best start times.</li>
          <li>Optionally open <strong>Attendees</strong> to review who is coming and add anyone missing.</li>
          <li>These steps can be done in any order and repeated as the meeting evolves.</li>
        </ul>`}
      </details>`;

    return `
      <section class="panel stack overview-panel">
        <h2 class="section-title">Overview</h2>
        <p class="meta">Tap or click headings to expand.</p>
        ${isOrg ? '<p class="meta"><strong>You are now in active meeting mode because all required setup steps are complete.</strong></p>' : ''}
        ${attendeePrompt}
        ${desc ? `<h3 class="section-title">Description for attendees</h3><div class="meet-intro-body">${sanitizeHtml(desc)}</div>` : '<h3 class="section-title">Description for attendees</h3><p class="meta">No description yet — add one in Meeting options.</p>'}
        <details class="overview-block"><summary class="section-title" title="Tap or click to expand/collapse">Agenda and decisions <button type="button" class="secondary compact-btn" data-action="edit-agenda-decisions" title="Modify agenda and/or decisions" style="margin-left:0.4rem">✎</button></summary>
          ${m.agenda.length ? `<p class="meta"><strong>Agenda:</strong></p><ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet — go to <strong>Notes &amp; agenda</strong> to set it.</p>'}
          ${m.decisions.length ? `<p class="meta"><strong>Decisions required:</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No decisions listed yet — go to <strong>Notes &amp; agenda</strong> to set them.</p>'}
          ${(m.notes || '').trim() ? `<div class="meet-intro-body">${sanitizeHtml(m.notes)}</div>` : ''}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click to expand/collapse">Attendees (${m.attendees.length})</summary>
          ${renderOverviewAttendeeTable(m)}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click to expand/collapse">Best overlap times</summary>
          ${sorted.length
            ? `<ul class="list-plain">${sorted.map((s) => `<li>${formatTimePair(s.slot)} — ${s.count} of ${m.attendees.length} available</li>`).join('')}</ul>`
            : '<p class="meta">No overlap times yet — go to Set confirmed meeting details to choose a start slot.</p>'}
        </details>
        <details class="overview-block"><summary class="section-title" title="Tap or click to expand/collapse">Proposed locations (by popularity)</summary>
          ${renderLocationPopularitySummary(m)}
        </details>
      </section>`;
  }

  function renderLocationPopularitySummary(m) {
    if (!m.locations.length) return '<p class="meta">No locations proposed yet.</p>';
    const prefs = m.location_preferences || {};
    const counts = new Map(m.locations.map((loc) => [loc.id, 0]));
    Object.values(prefs).forEach((ids) => {
      (ids || []).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    const ranked = m.locations
      .map((loc) => ({ loc, votes: counts.get(loc.id) || 0 }))
      .sort((a, b) => b.votes - a.votes || a.loc.label.localeCompare(b.loc.label));
    return `<ul class="list-plain">${ranked.map((item) => `<li>${escapeHtml(item.loc.label)} — ${item.votes} preference${item.votes === 1 ? '' : 's'}</li>`).join('')}</ul>`;
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
    const saveRow = renderSaveRow(state);
    const todayStr = meetingTodayStr(m);
    const canGoBack = calendarViewStart(state, m) > parseDateIsoLocal(todayStr);

    return `
      <section class="panel stack calendar-panel">
        <p class="meta">Mark when <strong>you</strong> are free. Drag or tap slots to select a range. Press <em>Save my availability</em> when done.</p>
        <div class="row meta-line">
          <span class="badge" title="Change recurrence in Meeting options">${escapeHtml(m.recurrence_label)}</span>
          <span>From ${escapeHtml(todayStr)} · Grid ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} <strong>${escapeHtml(mtz)}</strong></span>
        </div>
        ${!meetingEstablished(m) ? renderAttendeesSection(m, state, attendee) : ''}
        ${saveRow}
        <div class="calendar-toolbar">
          <button type="button" class="secondary" data-action="prev-days" title="Show previous days" ${canGoBack ? '' : 'disabled'}>←</button>
          <strong>${formatDayRangeLabel(days)}</strong>
          <button type="button" class="secondary" data-action="next-days" title="Show next days">→</button>
        </div>
        <div class="calendar" style="--cal-cols:${days.length || dayCount}">
          <div class="cal-header">
            <div class="time-gutter"></div>
            ${days.map((d) => {
              const dateStr = toDateIso(d);
              return `<div class="day-head${recurringSet.has(dateStr) ? ' recurring' : ''}">${formatDayHeadDateStr(dateStr, mtz)}${recurringSet.has(dateStr) ? '<br><small>recurring</small>' : ''}</div>`;
            }).join('')}
          </div>
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label" title="${escapeHtml(mtz)}">${formatWallHour(hm)}</div>
              ${days.map((day) => renderSlotCell(m, state, toDateIso(day), hm, attendee, mtz)).join('')}
            `).join('')}
          </div>
        </div>
        ${saveRow}
      </section>`;
  }

  function renderSaveRow(state) {
    if (!state.attendeeId) return '';
    const hint = isTouchUi ? 'tap slots to select' : 'drag or tap slots to select a range';
    return `<div class="row save-row calendar-save-row">
      <button type="button" data-action="save-availability" title="Save your currently selected availability slots">Save my availability</button>
      <span class="meta">${state.selectedSlots.size} slot(s) selected · ${hint}</span>
    </div>`;
  }

  function renderSlotCell(m, state, dateStr, hm, attendee, mtz) {
    const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    const ids = m.availability[slotIso] || [];
    const initials = ids.map((id) => attendeeInitials(m, id)).filter(Boolean);
    const label = initials.length ? initials.slice(0, 3).join(' ') + (initials.length > 3 ? '+' : '') : '';
    const names = ids.map((id) => attendeeName(m, id)).join(', ');
    const tip = names
      ? `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)} · ${names}`
      : `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)}`;
    return `<button type="button" class="slot${state.selectedSlots.has(slotIso) ? ' selected' : ''}${ids.length ? ' suggested' : ''}"
      data-action="toggle-slot" data-slot="${escapeHtml(slotIso)}" title="${escapeHtml(tip)}" ${attendee ? '' : 'disabled'}>
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
    const selected = state.pendingConfirmSlot || m.confirmed_slot || '';
    const selectedLocation = state.pendingConfirmLocation || m.confirmed_location || '';
    const isOrg = !!attendee?.is_organizer;
    const todayStr = meetingTodayStr(m);
    const canGoBack = calendarViewStart(state, m) > parseDateIsoLocal(todayStr);
    const fullMap = new Map((m.suggestions?.slots || []).map((s) => [s.slot, s]));
    const partialMap = new Map((m.suggestions?.partial_slots || []).map((s) => [s.slot, s]));
    const hours = state.showAllGroupHours
      ? allHours
      : allHours.filter((hm) => groupHourHasSignal(m, days, hm, mtz, selected, fullMap, partialMap));
    return `
      <section class="panel stack" id="meeting-availability-pane">
        <h2 class="section-title">Set confirmed meeting details</h2>
        <p class="meta"><strong>Viewed by anyone. Set/changed by organisers.</strong></p>
        <p class="meta"><strong>Current status:</strong> ${m.confirmed_slot ? `Agreed — ${formatTimePair(m.confirmed_slot)} · ${locationInlineHtml(m, m.confirmed_location)}` : 'Scheduling — not yet agreed'}</p>
        <p class="meta">Below is a visual analysis of full and partial availability. Mark your own slots on <strong>My availability</strong>, then choose a start slot here.</p>
        <div class="row group-legend">
          <span class="legend-chip full">All attendees + full meeting duration</span>
          <span class="legend-chip partial-full">All attendees at this start slot (duration not fully covered)</span>
          <span class="legend-chip partial">Some attendees or partial duration</span>
          <span class="legend-chip selected">Selected start</span>
        </div>
        <p class="meta">Click a slot to set the proposed meeting start time. You can change it by clicking another slot. Times shown in your timezone and UTC.</p>
        <div class="row">
          <p class="meta"><strong>Proposed start:</strong> ${selected ? formatTimePair(selected) : 'none selected yet — tap a slot above to set it'}</p>
          <button type="button" class="secondary compact-btn" data-action="toggle-group-hours" title="Toggle hidden empty hours">${state.showAllGroupHours ? 'Hide empty hours' : 'Show all hours'}</button>
        </div>
        ${!state.showAllGroupHours ? '<p class="meta">Empty time rows are hidden. Use "Show all hours" to display midnight-to-midnight.</p>' : ''}
        ${isOrg
          ? `<div class="row">
              <button type="button" data-action="confirm-details" title="Organiser only: set agreed time and location">Set confirmed meeting details</button>
            </div>`
          : '<p class="meta">Only organisers can set confirmed details.</p>'}
        <div class="calendar-toolbar">
          <button type="button" class="secondary" data-action="prev-days" title="Show previous days" ${canGoBack ? '' : 'disabled'}>←</button>
          <strong>${formatDayRangeLabel(days)}</strong>
          <button type="button" class="secondary" data-action="next-days" title="Show next days">→</button>
        </div>
        <div class="calendar group-calendar" style="--cal-cols:${days.length || dayCount}">
          <div class="cal-header">
            <div class="time-gutter"></div>
            ${days.map((d) => `<div class="day-head">${formatDayHeadDateStr(toDateIso(d), mtz)}</div>`).join('')}
          </div>
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label" title="${escapeHtml(mtz)}">${formatWallHour(hm)}</div>
              ${days.map((day) => renderGroupSlotCell(m, toDateIso(day), hm, mtz, selected, fullMap, partialMap)).join('')}
            `).join('')}
          </div>
        </div>
        <h3 class="section-title">Proposed locations</h3>
        <p class="meta">Organisers can click a location to set it as the confirmed location candidate. Attendees can see who marked each location as workable.</p>
        ${renderConfirmLocationChoices(m, state, isOrg, selectedLocation)}
        <div class="row">
          <p class="meta"><strong>Selected location:</strong> ${selectedLocation ? locationInlineHtml(m, selectedLocation) : 'none selected yet — choose a location above'}</p>
        </div>
        ${isOrg
          ? `<div class="row">
              <button type="button" data-action="confirm-details" title="Organiser only: set agreed time and location">Set confirmed meeting details</button>
            </div>`
          : ''}
      </section>`;
  }

  function groupHourHasSignal(m, days, hm, mtz, selected, fullMap, partialMap) {
    return days.some((day) => {
      const slotIso = slotIsoFromMeetingDate(toDateIso(day), hm, mtz);
      if (slotIso === selected) return true;
      if (fullMap.has(slotIso) || partialMap.has(slotIso)) return true;
      const ids = m.availability?.[slotIso] || [];
      return ids.length > 0;
    });
  }

  function renderConfirmLocationChoices(m, state, isOrg, selectedLocation) {
    if (!m.locations.length) return '<p class="meta">No proposed locations yet. Use the Locations tab to add one.</p>';
    return `<div class="chip-list">${m.locations.map((loc) => {
      const voters = attendeesForLocation(m, loc.id);
      const isSelected = selectedLocation === loc.id;
      const title = voters.length
        ? `Preferred by: ${voters.map((a) => attendeeLabel(a)).join(', ')}`
        : 'No attendee preferences saved yet';
      return `<button type="button" class="chip confirm-loc-chip${isSelected ? ' active selected-start' : ''}" data-action="pick-confirm-location" data-location-id="${escapeHtml(loc.id)}" ${isOrg ? '' : 'disabled'} title="${escapeHtml(title)}">${escapeHtml(loc.label)} (${voters.length})</button>`;
    }).join('')}</div>`;
  }

  function attendeesForLocation(m, locationId) {
    const prefs = m.location_preferences || {};
    return m.attendees.filter((a) => (prefs[a.id] || []).includes(locationId));
  }

  function renderGroupSlotCell(m, dateStr, hm, mtz, selected, fullMap, partialMap) {
    const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    let cls = 'partial';
    let tip = `${formatSlotLocal(slotIso)} · ${formatSlotUtc(slotIso)}`;
    let initials = '';
    const atSlotIds = m.availability?.[slotIso] || [];
    const allAtSlot = m.attendees.length > 0 && atSlotIds.length === m.attendees.length;
    if (fullMap.has(slotIso)) {
      const s = fullMap.get(slotIso);
      cls = 'full';
      tip += ` · all attendees free (${s.count}/${m.attendees.length})`;
      initials = (s.attendees || []).map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else if (allAtSlot) {
      cls = 'partial-full';
      tip += ' · all attendees marked at this start slot, but not all have full meeting duration';
      initials = atSlotIds.map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else if (partialMap.has(slotIso)) {
      const p = partialMap.get(slotIso);
      const fullCount = (p.attendees_full || []).length;
      cls = fullCount > 0 ? 'partial-full' : 'partial';
      tip += ` · ${fullCount}/${m.attendees.length} free for full meeting`;
      initials = (p.attendees_full || []).map((id) => attendeeInitials(m, id)).filter(Boolean).slice(0, 3).join(' ');
    } else {
      tip += ' · no marked overlap yet';
    }
    const selectedClass = selected === slotIso ? ' selected-start' : '';
    return `<button type="button" class="slot group-slot ${cls}${selectedClass}" data-action="use-slot" data-slot="${escapeHtml(slotIso)}" title="${escapeHtml(tip)}">${initials ? `<span class="slot-initials">${escapeHtml(initials)}</span>` : ''}</button>`;
  }

  // ─── Locations tab ───────────────────────────────────────────────────────────

  function renderLocationsTab(m, state, attendee) {
    return `
      <section class="panel stack" id="meeting-locations-pane">
        <h2 class="section-title">Locations</h2>
        <p class="meta"><strong>Select from locations proposed and save choice. Propose new location(s) if you need to.</strong></p>
        <h3 class="section-title">Proposed locations</h3>
        <p class="meta">Click a location to save it as workable for you (blue). Click again to remove it. You can select multiple.</p>
        <div class="chip-list">${m.locations.length ? m.locations.map((loc) => renderLocationItem(m, state, attendee, loc)).join('') : '<p class="meta">No locations proposed yet — use Propose a location above.</p>'}</div>
        ${attendee ? '<p class="meta">Preferences save automatically when you click a location.</p>' : '<p class="meta">Sign in on Attendees to save location preferences.</p>'}
        <details class="propose-location-block" open><summary>Propose a location</summary>
          <p class="meta">Anyone can propose a location. Add as many options as you like.</p>
          ${renderAddLocationForm()}
        </details>
      </section>`;
  }

  function renderLocationItem(m, state, attendee, loc) {
    const selected = state.selectedLocations.has(loc.id);
    return `<div class="location-item">
      <button type="button" class="chip${selected ? ' active' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}"
        title="${selected ? 'Click to deselect, then save preferences' : 'Click to select as workable, then save preferences'}">
        ${escapeHtml(locationChipLabel(loc))}
      </button>
      ${attendee?.is_organizer ? `<button type="button" class="secondary compact-btn" data-action="delete-location" data-location-id="${escapeHtml(loc.id)}" title="Remove this location proposal">Remove</button>` : ''}
    </div>`;
  }

  // ─── Agree time tab ──────────────────────────────────────────────────────────

  function renderConfirmTab(m, state, attendee) {
    const isOrg = !!attendee?.is_organizer;
    const slotVal = m.confirmed_slot || state.pendingConfirmSlot || '';

    if (m.confirmed_slot) {
      return `
        <section class="panel stack">
          <h2 class="section-title">Agreed time &amp; location</h2>
          <div class="agreed-display">
            <p><span class="badge good">Agreed</span></p>
            <p class="meta"><strong>Time:</strong> ${formatTimePair(m.confirmed_slot)}</p>
            <p class="meta"><strong>Location:</strong> ${locationInlineHtml(m, m.confirmed_location)}</p>
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
          : `<p class="meta">You can see proposed times on <strong>Group availability</strong>. The organiser will agree the final time and it will appear here.</p>`}
      </section>`;
  }

  function renderConfirmForm(m, state, slotVal, isUpdate) {
    return `
      <details${isUpdate ? '' : ' open'}><summary>${isUpdate ? 'Update agreed time &amp; location (organiser)' : 'Agree meeting time &amp; location (organiser)'}</summary>
        <p class="meta">Choose a time from <strong>Group availability</strong> by clicking a slot, or enter a UTC time directly below. Then pick the final location and press the button.</p>
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
          <label>Final location <span class="label-hint">(organiser chooses)</span>
            <select name="confirmed_location"><option value="">— none —</option>
              ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(locationChipLabel(l))}</option>`).join('')}
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
    return '<p class="meta">No time selected yet. Choose from Group availability or enter a UTC time below.</p>';
  }

  // ─── Notes tab ───────────────────────────────────────────────────────────────

  function renderNotesTab(m, state, attendee) {
    return `
      <section class="panel stack" id="meeting-notes-pane">
        <h2 class="section-title">Notes &amp; agenda</h2>
        <p class="meta">Agenda items, decisions needed before the meeting, and preparatory notes. After the meeting, use <strong>Records</strong> for transcripts and attachments.</p>
        <h3 class="section-title">Agenda</h3>
        ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
        ${m.decisions.length ? `<h3 class="section-title">Decisions required</h3><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
        ${(m.notes || '').trim() ? `<div class="meet-intro-body notes-display">${sanitizeHtml(m.notes)}</div>` : ''}
        <details class="notes-edit-details"${state.openNotesEditor ? ' open' : ''}><summary>Edit agenda / decisions / notes</summary>
          <form class="inline-form" data-form="update-meta">
            <label>Agenda <span class="label-hint">(plain text, each line is displayed as a bullet)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(plain text, each line is displayed as a bullet)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes <span class="label-hint">(simple HTML)</span>
              ${formatToolbar('notes', { withHelp: false })}
              <textarea name="notes" rows="3">${escapeHtml(m.notes || '')}</textarea>
            </label>
            <button type="submit">Save</button>
          </form>
        </details>
      </section>`;
  }

  // ─── Records tab ─────────────────────────────────────────────────────────────

  function renderRecordsTab(m, state) {
    return `
      <section class="panel stack">
        <h2 class="section-title">Records</h2>
        <p class="meta">After the meeting: recordings, transcripts, attachments, and summaries. Pre-meeting agenda and notes are on <strong>Notes &amp; agenda</strong>.</p>
        <h3 class="section-title">Recordings, transcripts &amp; AI summaries</h3>
        ${m.attachments.length ? m.attachments.map(renderAttachment).join('') : '<p class="meta">Nothing attached yet.</p>'}
        <details><summary>Add attachment</summary>
          <form class="inline-form" data-form="add-attachment">
            <input name="label" required placeholder="Label">
            <select name="type"><option value="url">URL</option><option value="text">Text summary</option></select>
            <input name="url" type="text" placeholder="https://example.com/...">
            <p class="meta">Use a full web address starting with https://</p>
            <textarea name="body" rows="3" placeholder="Paste summary (plain text)"></textarea>
            <button type="submit">Attach</button>
          </form>
        </details>
      </section>`;
  }

  // ─── Meeting options tab ─────────────────────────────────────────────────────

  function renderOptionsTab(m, state, attendee) {
    if (!canShowOptions(m, attendee)) {
      return `<section class="panel stack"><p class="meta">Only meeting organisers can access meeting options.</p></section>`;
    }
    const mtz = meetingTz(m);
    return `
      <section class="panel stack">
        <h2 class="section-title">Meeting options</h2>
        ${!m.attendees.length ? '<p class="meta"><strong>Setup step 1 of 5:</strong> Save your options below. Then return to Getting started or go straight to Attendees to add yourself as the first attendee.</p>' : ''}
        ${!m.attendees.length ? `<div class="row">
          <button type="button" class="secondary compact-btn" data-action="tab" data-tab="overview">Back to Getting started</button>
          <button type="button" class="secondary compact-btn" data-action="tab" data-tab="attendees">Next step: Attendees →</button>
        </div>` : ''}
        <form class="inline-form organizer-form" data-form="update-settings">
          <div class="form-grid">
            <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
            <label>Meeting length (minutes)<input type="number" name="duration_minutes" value="${m.duration_minutes}" min="15" step="15"></label>
            <label title="How finely attendees can mark when they are free — e.g. 15 means quarter-hour slots.">Grid step (minutes)<input type="number" name="slot_granularity_minutes" value="${m.slot_granularity_minutes}" min="15" step="15"></label>
            <label title="Earliest start time shown on the calendar grid.">Earliest start time <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
            <label title="Latest end time shown on the calendar grid.">Latest end time <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
            <label class="checkbox-label"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
          </div>
          <details class="timezone-block">
            <summary>Calendar hours timezone <span class="label-hint">(defaults to yours: ${escapeHtml(tz)})</span></summary>
            <p class="meta">Availability is stored in UTC. The grid "not before/after" hours use this timezone so everyone marks the same slots. Each person also sees times in their own local timezone.</p>
            <label>Timezone
              <select name="timezone">${timezoneOptions(m.timezone)}</select>
            </label>
          </details>
          <h3 class="section-title">Description for attendees</h3>
          <label><span class="label-hint">(simple HTML — shown on Overview)</span>
            ${formatToolbar('organizer_intro', { withHelp: true, helpTopic: 'meeting description' })}
            <textarea name="organizer_intro" rows="4" placeholder="${escapeHtml(INTRO_PLACEHOLDER)}">${escapeHtml(m.organizer_intro || '')}</textarea>
          </label>
          <details>
            <summary class="recurrence-summary">Recurrence: ${escapeHtml(m.recurrence_label || 'One-off')}</summary>
            <label>Recurrence type<select name="recurrence_type">${recurrenceOptions(m.recurrence.type)}</select></label>
            <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence, m.show_weekends)}</div>
          </details>
          <button type="submit">Save meeting options</button>
        </form>
      </section>`;
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
      : 'Press <strong>This is me</strong> on your row if you are already listed, or fill in the form below to add yourself.';
    const claiming = m.attendees.find((a) => a.id === state.claimingId);
    const showOrganiserCol = signedIn && attendee.is_organizer;
    const colCount = 5 + (showOrganiserCol ? 1 : 0);

    const body = `
        ${signedIn ? `<p class="meta signed-in-line">Signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>
          ${!attendee.has_pin ? '<span class="badge warn" title="No PIN set">No PIN</span>' : '<span class="badge" title="PIN set">PIN ✓</span>'}
          <button type="button" class="compact-btn" data-action="set-pin" title="Set a PIN so you can find this meeting later and protect your attendee identity">${attendee.has_pin ? 'Set new PIN' : 'Set PIN'}</button>
          <button type="button" class="compact-btn" data-action="switch-user" title="Sign out on this browser and choose another attendee">Switch user</button>
          <button type="button" class="compact-btn" data-action="edit-attendee" title="Edit your display name, initials, contact, and PIN">Edit my details</button>
        </p>` : ''}
        ${listHint ? `<p class="meta">${listHint}</p>` : ''}
        <div class="table-wrap table-wrap-compact">
          <table class="data-table attendee-table">
            <thead><tr><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th>${showOrganiserCol ? '<th>Organiser</th>' : ''}<th></th></tr></thead>
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
      <button type="button" data-action="tab" data-tab="calendar" title="Open My availability">Continue to My availability →</button>
      <p class="meta">${ready
        ? 'Mark your availability on <strong>My availability</strong>.'
        : 'Add yourself above, then go to <strong>My availability</strong>.'}</p>
    </div>`;
  }

  function renderAddAttendeeForm(signedIn, attendee) {
    const modeRow = signedIn ? '' : `
        <fieldset class="add-mode-row">
          <legend class="label-hint">Adding</legend>
          <div class="mode-options">
            <label class="mode-choice"><input type="radio" name="add_mode" value="self" checked><span>Myself</span></label>
            <label class="mode-choice"><input type="radio" name="add_mode" value="propose"><span>Someone else</span></label>
          </div>
        </fieldset>`;
    const pinRow = signedIn ? '' : `
          <label class="field-pin">PIN <span class="label-hint">(optional — helps find meetings from home and protects your attendee identity)</span>
            <input class="input-pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="12">
          </label>`;
    const extras = signedIn ? '' : `
        <p class="meta propose-hint" data-show-when="propose" hidden>They are not emailed — share the meeting link with them. They claim their row using <strong>This is me</strong>.</p>`;
    const intro = signedIn
      ? `<p class="meta">You are signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>. Use this form to add <strong>someone else</strong>.</p>`
      : '<p class="meta">Add yourself as an attendee, or propose someone else.</p>';
    return `
        <div class="add-attendee-block">
          <h3 class="section-title">Add new attendee</h3>
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
                <input class="input-contact" name="contact" maxlength="80" placeholder="email or phone" inputmode="email" autocomplete="email">
              </label>
              ${pinRow}
            </div>
            ${extras}
            <button type="submit">Add attendee</button>
          </form>
        </div>`;
  }

  function renderEditAttendeeForm(a, state) {
    const hasPinAlready = a.has_pin;
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
              <input class="input-contact" name="contact" maxlength="80" placeholder="email or phone" value="${escapeHtml(a.contact || '')}">
            </label>
          </div>
          <div class="pin-change-block">
            <h4 class="section-title">${hasPinAlready ? 'Change PIN' : 'Set PIN'}</h4>
            ${hasPinAlready ? `<label>Current PIN <input name="current_pin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="current-password"></label>` : ''}
            ${hasPinAlready ? `<label class="checkbox-label"><input type="checkbox" name="clear_pin" data-toggle="clear-pin"> Remove PIN instead of setting a new one</label>` : ''}
            <label class="field-new-pin"${hasPinAlready ? ' data-clear-pin-target' : ''}>${hasPinAlready ? 'New PIN' : 'PIN'} <span class="label-hint">(numeric)</span>
              <input name="new_pin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="new-password">
            </label>
          </div>
          <div class="row">
            <button type="submit">Save my details</button>
            <button type="button" class="secondary" data-action="cancel-edit-attendee" title="Cancel and return without saving">Cancel</button>
          </div>
        </form>`;
  }

  function renderAttendeeRow(m, state, current, a, { signedIn, showOrganiserCol }) {
    const isSelf = current?.id === a.id;
    const dupOfSelf = current && a.id !== current.id
      && a.display_name.trim().toLowerCase() === current.display_name.trim().toLowerCase();
    const pinBadge = a.has_pin
      ? '<span class="badge" title="PIN protected">PIN</span>'
      : '<span class="badge warn" title="No PIN set">No PIN</span>';
    const orgBadge = a.is_organizer ? '<span class="badge good">Org</span>' : '';
    const actions = [];

    // Row-level self edit is intentionally omitted to avoid duplicate edit actions.

    if (!signedIn) {
      actions.push(`<button type="button" class="secondary compact-btn" data-action="claim-row" data-attendee-id="${escapeHtml(a.id)}" title="Sign in as this attendee row">${isSelf ? 'You' : 'This is me'}</button>`);
    } else if (current && a.id !== current.id && dupOfSelf) {
      actions.push(`<button type="button" class="secondary compact-btn" data-action="merge-into-me" data-remove-id="${escapeHtml(a.id)}" title="Merge duplicate row into your attendee row">Remove duplicate (keep me)</button>`);
    }

    const organiserCell = showOrganiserCol
      ? `<td><input type="checkbox" data-action="toggle-organizer" data-attendee-id="${escapeHtml(a.id)}" ${a.is_organizer ? 'checked' : ''} aria-label="Meeting organiser for ${escapeHtml(a.display_name)}"></td>`
      : '';

    return `<tr class="attendee-row${isSelf ? ' is-self' : ''}${!signedIn ? ' is-selectable' : ''}">
      <td>${escapeHtml(a.display_name)} ${pinBadge} ${orgBadge}</td>
      <td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
      <td>${renderContactCell(a)}</td>
      <td>${countSlotsFor(m, a.id)}</td>
      ${organiserCell}
      <td class="attendee-actions">${actions.join(' ') || (isSelf ? '<span class="meta">You</span>' : '')}</td>
    </tr>`;
  }

  function renderClaimPinForm(target) {
    const needsPin = target.has_pin;
    return `
      <form class="inline-form claim-form" data-form="claim">
        <input type="hidden" name="attendee_id" value="${escapeHtml(target.id)}">
        <p class="meta"><strong>${escapeHtml(target.display_name)}</strong> — ${needsPin ? 'enter your PIN to sign in' : 'optionally set a numeric PIN, then press Continue'}</p>
        <label>${needsPin ? 'PIN' : 'PIN (optional)'}
          <input name="pin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" ${needsPin ? 'required' : ''} maxlength="12">
        </label>
        <div class="row">
          <button type="submit">Continue</button>
          <button type="button" class="secondary" data-action="cancel-claim" title="Cancel and return">Cancel</button>
        </div>
      </form>`;
  }

  function renderOrganiserMergePanel(m) {
    const opts = m.attendees.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(attendeeLabel(a))}</option>`).join('');
    return `
      <details class="merge-organiser-panel help-toggle">
        <summary><span class="help-q">?</span> Merge duplicate attendees (organiser)</summary>
        <form class="inline-form row" data-form="merge-organiser">
          <label>Keep this row <select name="keep_id" required>${opts}</select></label>
          <label>Remove this row <select name="remove_id" required>${opts}</select></label>
          <button type="submit">Merge</button>
        </form>
        <p class="meta help-body">Availability from the removed row is combined into the kept row. You do not need their PIN as organiser.</p>
      </details>`;
  }

  // ─── Location helpers ────────────────────────────────────────────────────────

  function locationChipLabel(loc) {
    const kind = { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[loc.kind] || loc.kind;
    const detail = loc.detail ? ` — ${loc.detail}` : '';
    return `${loc.label} (${kind})${detail}`;
  }

  function locationInlineHtml(m, locationId) {
    if (!locationId) return '<span class="label-hint">No location agreed yet.</span>';
    const loc = m.locations.find((l) => l.id === locationId);
    if (!loc) return escapeHtml(locationId);
    const url = extractUrlFromDetail(loc.detail);
    const kind = { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[loc.kind] || loc.kind;
    let html = `${escapeHtml(loc.label)} <span class="label-hint">(${escapeHtml(kind)})</span>`;
    if (url && isWellFormedUrl(url)) {
      html += ` — <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    } else if (loc.detail) {
      html += ` <span class="label-hint">(${escapeHtml(loc.detail)})</span>`;
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

  function renderAddLocationForm() {
    return `
      <form class="inline-form add-location-form" data-form="add-location">
        <label>Type
          <select name="location_mode">
            <option value="online">Online</option>
            <option value="physical">Physical</option>
          </select>
        </label>
        <div data-loc-fields="online" class="loc-fields">
          <label>Service
            <select name="online_service">
              <option value="Zoom">Zoom</option>
              <option value="Microsoft Teams">Microsoft Teams</option>
              <option value="Google Meet">Google Meet</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>Meeting link (optional) <input name="online_url" placeholder="https://..."></label>
        </div>
        <div data-loc-fields="physical" class="loc-fields" hidden>
          <label>Location details <input name="physical_address" placeholder="Venue name, address, room, phone, or joining note"></label>
        </div>
        <p class="meta span-full">Save adds another option to the list — you can propose several.</p>
        <button type="submit">Save location</button>
      </form>`;
  }

  function buildLocationPayload(fd) {
    const mode = fd.get('location_mode') || 'online';
    if (mode === 'physical') {
      const addr = String(fd.get('physical_address') || '').trim();
      if (!addr) throw new Error('Enter physical location details before saving');
      return { label: 'Physical location', kind: 'physical', detail: addr };
    }
    const rawUrl = String(fd.get('online_url') || '').trim();
    const url = rawUrl ? normalizeExternalUrl(rawUrl) : '';
    if (url && !isWellFormedUrl(url)) throw new Error('Please enter a validly formatted link starting with https://');
    return { label: String(fd.get('online_service') || 'Online').trim() || 'Online', kind: 'video', detail: url || 'Link to be added' };
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
            <button type="button" class="secondary" data-action="cancel-intro">Cancel</button>
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
    const btn = (fmt, label) => `<button type="button" class="secondary fmt-btn" data-fmt="${fmt}" title="${escapeHtml(FMT_TITLES[fmt])}">${label}</button>`;
    return `
      ${help}
      <div class="fmt-toolbar" data-field="${field}">
        ${btn('strong', 'Bold')}${btn('em', 'Italic')}${btn('p', 'Paragraph')}${btn('br', 'Line break')}${btn('a', 'Link')}${btn('ul', 'List')}
      </div>`;
  }

  function renderAttachment(att) {
    if (att.type === 'text') return `<div class="attachment"><strong>${escapeHtml(att.label)}</strong><pre class="attachment-body">${escapeHtml(att.body || '')}</pre></div>`;
    const href = normalizeExternalUrl(att.url);
    return `<div class="attachment"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a> <span class="label-hint">(opens in a new window)</span></div>`;
  }

  function formatTimePair(iso) {
    return `<strong>${escapeHtml(formatSlotLocal(iso))}</strong> equals ${escapeHtml(formatSlotUtc(iso))}`;
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
          payload.pin = fd.get('pin') || undefined;
          data = await apiPost(payload);
          state.attendeeId = data.attendee_id;
          localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        } else {
          data = await apiPost(payload);
        }
        form.reset();
      } else if (kind === 'claim') {
        data = await apiPost({ action: 'claim', slug: state.slug, attendee_id: fd.get('attendee_id'), pin: fd.get('pin') || undefined });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        state.claimingId = null;
      } else if (kind === 'update-settings') {
        data = await apiPost({
          action: 'update_meta', slug: state.slug, acting_attendee_id: state.attendeeId,
          title: fd.get('title'),
          duration_minutes: Number(fd.get('duration_minutes')),
          slot_granularity_minutes: Number(fd.get('slot_granularity_minutes')),
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          timezone: normalizeTimezone(fd.get('timezone')),
          show_weekends: fd.get('show_weekends') === 'on',
          organizer_intro: fd.get('organizer_intro'),
          recurrence: buildRecurrenceFromForm(fd),
        });
      } else if (kind === 'update-meta') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes') });
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
      } else if (kind === 'add-attachment') {
        const type = fd.get('type');
        const rawUrl = String(fd.get('url') || '').trim();
        const url = type === 'url' ? normalizeExternalUrl(rawUrl) : undefined;
        if (type === 'url' && (!rawUrl || !isWellFormedUrl(url))) {
          throw new Error('Please enter a validly formatted link starting with https://');
        }
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type, url, body: fd.get('body') });
      } else if (kind === 'confirm') {
        if (!fd.get('confirmed_location')) {
          throw new Error('Select a location before agreeing meeting details');
        }
        data = await apiPost({ action: 'confirm', slug: state.slug, acting_attendee_id: state.attendeeId, confirmed_slot: fd.get('confirmed_slot'), confirmed_location: fd.get('confirmed_location') });
        state.pendingConfirmSlot = null;
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
        const newPin = String(fd.get('new_pin') || '').trim();
        const currentPin = String(fd.get('current_pin') || '').trim();
        const clearPin = fd.get('clear_pin') === 'on';
        const hasPinFlow = !!form.querySelector('[name="current_pin"]');
        if (hasPinFlow && clearPin && !currentPin) {
          throw new Error('Enter your current PIN to remove it');
        }
        if (hasPinFlow && !clearPin && newPin === '') {
          throw new Error('Enter a new PIN, or tick "Remove PIN instead of setting a new one"');
        }
        const payload = {
          action: 'update_attendee', slug: state.slug,
          acting_attendee_id: state.attendeeId,
          attendee_id: fd.get('attendee_id'),
          display_name: fd.get('display_name'),
          contact,
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
        };
        if (newPin !== '' || clearPin || hasPinFlow) {
          payload.new_pin = newPin;
          payload.current_pin = currentPin;
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
      else if (kind === 'edit-attendee') toast(fd.get('clear_pin') === 'on' ? 'PIN removed' : 'Your details were updated');
      else if (kind === 'confirm') toast('Meeting time agreed — status updated');
      else if (kind === 'update-settings') toast('Meeting options saved. Next: add yourself as attendee (or return to Getting started).');
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

    if (action === 'toggle-help') { state.helpOpen = !state.helpOpen; render(root, state); return; }
    if (action === 'edit-agenda-decisions') {
      state.openNotesEditor = true;
      setTab(state, 'notes');
      state.scrollAfterRender = 'notes-edit-details';
      render(root, state);
      return;
    }
    if (action === 'toggle-header') { state.headerExpanded = !state.headerExpanded; render(root, state); return; }

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

    if (action === 'toggle-slot') { toggleSlot(state, btn.dataset.slot); render(root, state); return; }

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
        render(root, state);
        toast('Location removed');
      } catch (err) { toast(err.message, true); }
      return;
    }

    if (action === 'prev-days') {
      const min = calendarMinStart(state.meet);
      const step = visibleDayCount();
      state.viewStart = addDays(state.viewStart, -step);
      if (state.viewStart < min) state.viewStart = min;
      render(root, state);
      return;
    }
    if (action === 'next-days') { state.viewStart = addDays(state.viewStart, visibleDayCount()); render(root, state); return; }

    if (action === 'jump-slot') {
      state.viewStart = startOfDay(new Date(btn.dataset.slot));
      setTab(state, 'calendar');
      render(root, state);
      return;
    }

    if (action === 'use-slot') {
      state.pendingConfirmSlot = btn.dataset.slot;
      render(root, state);
      toast('Proposed meeting start updated');
      return;
    }
    if (action === 'pick-confirm-location') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can set the confirmed location candidate', true);
        return;
      }
      state.pendingConfirmLocation = btn.dataset.locationId;
      render(root, state);
      toast('Confirmed location candidate updated');
      return;
    }
    if (action === 'confirm-details') {
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (!me?.is_organizer) {
        toast('Only organisers can set confirmed meeting details', true);
        return;
      }
      const slot = state.pendingConfirmSlot || state.meet.confirmed_slot || '';
      const location = state.pendingConfirmLocation || state.meet.confirmed_location || '';
      if (!slot) {
        toast('Choose a start slot first on the calendar above', true);
        return;
      }
      if (!location) {
        toast('Select a location before setting confirmed meeting details', true);
        return;
      }
      try {
        const data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          acting_attendee_id: state.attendeeId,
          confirmed_slot: slot,
          confirmed_location: location,
        });
        state.meet = data.meet;
        state.pendingConfirmSlot = null;
        state.pendingConfirmLocation = null;
        render(root, state);
        toast('Meeting confirmed');
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
        pin = window.prompt('Enter the PIN for the duplicate row you are removing:') || '';
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
      state.attendeePanelOpen = true;
      render(root, state);
      requestAnimationFrame(() => {
        const current = root.querySelector('.edit-attendee-form input[name="current_pin"]');
        if (current) current.focus();
        else root.querySelector('.edit-attendee-form input[name="new_pin"]')?.focus();
      });
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
    if (e.target.name === 'location_mode') {
      const form = e.target.closest('form');
      if (form) form.querySelectorAll('[data-loc-fields]').forEach((el) => { el.hidden = el.dataset.locFields !== e.target.value; });
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
    state.dragSelect = !state.selectedSlots.has(slot.dataset.slot);
    if (state.dragSelect) state.selectedSlots.add(slot.dataset.slot);
    else state.selectedSlots.delete(slot.dataset.slot);
    render(root, state);
  }

  function handlePointerOver(e, root, state) {
    if (!state.dragging) return;
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
      ['none', 'One-off (find one time, then agree)'],
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
    if (v.includes('@') && !isWellFormedEmail(v)) throw new Error('Contact must be a valid email or a phone number without @');
    return v;
  }
  function contactHref(c) {
    const v = String(c || '').trim();
    if (!v) return '#';
    if (v.includes('@')) return isWellFormedEmail(v) ? `mailto:${v}` : '#';
    return `tel:${v}`;
  }
  function renderContactCell(a) {
    if (!a.contact) return '—';
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
