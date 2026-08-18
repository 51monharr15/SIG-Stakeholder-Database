(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const INTRO_PLACEHOLDER = 'Add a short description for attendees — use Set meeting options.';
  const isTouchUi = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  const page = document.body.dataset.page;

  document.getElementById('footer-tz')?.replaceChildren(document.createTextNode(tz));

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  function initHome() {
    document.getElementById('create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      try {
        const res = await apiPost({ action: 'create', title: String(data.get('title') || '').trim() });
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
          res.meetings.map((m) => `<li><a href="${escapeHtml(meetingUrl(m.slug))}">${escapeHtml(m.title)}</a> <span class="meta">(${escapeHtml(m.slug)})</span></li>`).join('')
        }</ul>`;
      } catch (err) {
        if (box) {
          box.hidden = false;
          box.innerHTML = `<p class="meta">${escapeHtml(err.message)}</p>`;
        }
      }
    });
  }

  async function initScheduler(slug) {
    const root = document.getElementById('app');
    const state = {
      slug,
      meet: null,
      attendeeId: localStorage.getItem(attendeeKey(slug)) || '',
      selectedSlots: new Set(),
      selectedLocations: new Set(),
      viewStart: startOfDay(new Date()),
      activeTab: 'calendar',
      sortOrder: 'date',
      dragging: false,
      dragSelect: true,
      editingIntro: null,
      headerExpanded: false,
      claimingId: null,
      lastDayCount: visibleDayCount(),
    };

    try {
      state.meet = await fetchMeet(slug);
      if (state.attendeeId && !state.meet.attendees.some((a) => a.id === state.attendeeId)) {
        state.attendeeId = '';
        localStorage.removeItem(attendeeKey(slug));
      }
      const explicit = tabFromUrl();
      let activeTab = explicit || (state.meet.attendees.length ? 'calendar' : 'organiser');
      const signedIn = state.meet.attendees.find((a) => a.id === state.attendeeId);
      if (activeTab === 'organiser' && state.meet.attendees.length && !signedIn?.is_organizer) {
        activeTab = 'calendar';
      }
      state.activeTab = activeTab;
      if (activeTab === 'calendar') state.scrollCalendarOnRender = true;
      restoreAttendeeSelections(state);
      state.viewStart = calendarMinStart(state.meet);
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
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        return;
      }
      const dc = visibleDayCount();
      if (dc === state.lastDayCount) return;
      state.lastDayCount = dc;
      render(root, state);
    });
  }

  function visibleDayCount() {
    if (window.innerWidth >= 1200) return 7;
    if (window.innerWidth >= 900) return 5;
    return 3;
  }

  function tabFromUrl() {
    const t = new URLSearchParams(window.location.search).get('view');
    return ['calendar', 'times', 'after', 'organiser'].includes(t) ? t : null;
  }

  function meetingTz(m) {
    return (m.timezone && m.timezone.trim()) ? m.timezone.trim() : tz;
  }

  /** Wall clock in meeting TZ → UTC ISO (for slot keys). */
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
    if (tab === 'organiser' && state.meet?.attendees.length && !signedIn?.is_organizer) {
      toast('Only meeting organisers can change meeting options', true);
      tab = 'calendar';
    }
    state.activeTab = tab;
    if (tab === 'calendar') state.scrollCalendarOnRender = true;
    history.replaceState(null, '', meetingUrl(state.slug, tab));
  }

  function meetingUrl(slug, view) {
    const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
    const v = view && view !== 'calendar' ? `&view=${encodeURIComponent(view)}` : '';
    return `${base}/?=${encodeURIComponent(slug)}${v}`;
  }

  function attendeeKey(slug) { return `meet_attendee_${slug}`; }
  function slotsKey(slug, id) { return `meet_slots_${slug}_${id}`; }

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

  function render(root, state) {
    const m = state.meet;
    const attendee = m.attendees.find((a) => a.id === state.attendeeId);
    const url = shareUrl(state.slug);

    root.innerHTML = `
      <div class="meet-shell">
        <div class="sticky-top">
          <div class="sticky-top-inner">
            <div class="sticky-head row">
              <h1 class="meet-title">${escapeHtml(m.title)}</h1>
              <div class="row">
                ${isTouchUi ? `<button type="button" class="secondary compact-btn" data-action="toggle-header">${state.headerExpanded ? 'Less ▲' : 'Info ▼'}</button>` : `<button type="button" class="secondary compact-btn" data-action="toggle-header">${state.headerExpanded ? 'Less ▲' : 'More ▼'}</button>`}
                <button type="button" class="secondary compact-btn" data-action="copy-link" title="Copy meeting link">Copy meeting link</button>
              </div>
            </div>
            ${renderMeetingStatus(m)}
            <nav class="tab-nav tab-nav-primary" role="tablist">
              ${renderTabNav(m, state, attendee)}
            </nav>
            <div class="sticky-extras${state.headerExpanded ? ' is-open' : ''}">
              ${renderIntroBlock(m, state, 'organizer_intro', m.organizer_intro, INTRO_PLACEHOLDER, 'Add a short description for attendees', { withTextHelp: true })}
              ${tabPageIntro(m, state)}
              <p class="meta tz-banner">Hours in <strong>${escapeHtml(meetingTz(m))}</strong> · You: <strong>${escapeHtml(tz)}</strong></p>
              <div class="share-row row desktop-share">
                <input class="share-input" type="text" readonly value="${escapeHtml(url)}" id="share-url-input">
                <button type="button" class="secondary" data-action="copy-link">Copy meeting link</button>
              </div>
            </div>
          </div>
        </div>
        <div class="meet-content">
          ${state.activeTab === 'calendar' ? renderCalendarTab(m, state, attendee) : ''}
          ${state.activeTab === 'times' ? renderTimesTab(m, state, attendee) : ''}
          ${state.activeTab === 'after' ? renderAfterTab(m, state) : ''}
          ${state.activeTab === 'organiser' ? renderOrganiserTab(m, state) : ''}
        </div>
      </div>
      <div class="toast" id="toast"></div>
    `;
    afterRenderScroll(root, state);
  }

  function afterRenderScroll(root, state) {
    if (!state.scrollCalendarOnRender || state.activeTab !== 'calendar') return;
    state.scrollCalendarOnRender = false;
    requestAnimationFrame(() => {
      const signedIn = state.meet.attendees.some((a) => a.id === state.attendeeId);
      const target = signedIn
        ? root.querySelector('.calendar-save-row')
        : root.querySelector('.attendee-section');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function tabBtn(id, label, state, tip = '') {
    const title = tip ? ` title="${escapeHtml(tip)}"` : '';
    return `<button type="button" class="tab${state.activeTab === id ? ' active' : ''}" data-action="tab" data-tab="${id}"${title}>${label}</button>`;
  }

  const TAB_TIPS = {
    organiser: 'Meeting length, grid step, timezone, recurrence, and description for attendees. Optional: add a known location here.',
    calendar: 'Register attendees and mark when each person is free.\nDoes not set the final meeting time.',
    times: 'See overlaps, propose locations, finalise time and location (organiser), agenda and decisions.',
    after: 'Recordings, links, and text summaries after the meeting.',
  };

  function meetingEstablished(m) {
    return (m.attendees?.length || 0) > 0;
  }

  function canShowOrganiserTab(m, attendee) {
    return !m.attendees.length || !!attendee?.is_organizer;
  }

  function tabNavItems(m, attendee) {
    const established = meetingEstablished(m);
    const showOrg = canShowOrganiserTab(m, attendee);
    if (!established) {
      const items = [];
      if (showOrg) items.push({ id: 'organiser', label: '1. Set meeting options', tip: TAB_TIPS.organiser });
      items.push(
        { id: 'calendar', label: '2. Choose calendar times', tip: TAB_TIPS.calendar },
        { id: 'times', label: '3. Availability, location & agenda', tip: TAB_TIPS.times },
        { id: 'after', label: '4. After meeting', tip: TAB_TIPS.after },
      );
      return items;
    }
    const items = [
      { id: 'calendar', label: '1. Add users & choose times', tip: TAB_TIPS.calendar },
      { id: 'times', label: '2. Availability, location & agenda', tip: TAB_TIPS.times },
      { id: 'after', label: '3. After meeting', tip: TAB_TIPS.after },
    ];
    if (showOrg) items.push({ id: 'organiser', label: 'Reset meeting options', tip: TAB_TIPS.organiser });
    return items;
  }

  function renderTabNav(m, state, attendee) {
    return tabNavItems(m, attendee).map(({ id, label, tip }) => tabBtn(id, label, state, tip)).join('');
  }

  function tabPageIntro(m, state) {
    if (state.activeTab === 'times') {
      return renderIntroBlock(m, state, 'page_times_intro', m.page_times_intro, 'Optional intro for the Meeting availability page.', 'Page intro', { withTextHelp: false });
    }
    if (state.activeTab === 'after') {
      return renderIntroBlock(m, state, 'page_after_intro', m.page_after_intro, 'Optional intro for recordings and summaries.', 'Page intro', { withTextHelp: false });
    }
    return '';
  }

  function helpToggle(topic, bodyHtml) {
    return `
      <details class="help-toggle">
        <summary><span class="help-q">?</span> Help for ${escapeHtml(topic)}</summary>
        <div class="help-body meta">${bodyHtml}</div>
      </details>`;
  }

  const FMT_TITLES = {
    strong: 'Wrap selected text in bold tags, or insert bold tags at the cursor',
    em: 'Wrap selected text in italic tags, or insert italic tags at the cursor',
    p: 'Wrap selected text in a paragraph, or insert an empty paragraph at the cursor',
    br: 'Insert a line break (<br>) at the cursor',
    a: 'Wrap selected text as a link (opens in a new tab), or insert a link and enter the URL. target="_blank" is added automatically — do not type it in the editor',
    ul: 'Wrap selected text in one bullet item, or insert a one-item list (line breaks stay inside the same bullet)',
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
        <button type="button" class="icon-btn" data-action="edit-intro" data-field="${field}" title="Edit description for attendees">✎</button>
      </div>`;
  }

  function textEntryHelp(topic) {
    return helpToggle(topic, 'Enter plain text or simple HTML. Tags not in the allowed list are stripped on save. Line breaks in the box show as breaks on the page. <strong>Highlight text first</strong> to wrap it with a button, or click with nothing selected to insert empty tags at the cursor. Allowed: paragraphs, line breaks, bold, italic, links, and lists.');
  }

  function formatToolbar(field, { withHelp = true, helpTopic = 'meeting text' } = {}) {
    const help = withHelp ? textEntryHelp(helpTopic) : '';
    const btn = (fmt, label) => `<button type="button" class="secondary fmt-btn" data-fmt="${fmt}" title="${escapeHtml(FMT_TITLES[fmt])}">${label}</button>`;
    return `
      ${help}
      <div class="fmt-toolbar" data-field="${field}">
        ${btn('strong', 'Bold')}
        ${btn('em', 'Italic')}
        ${btn('p', 'Paragraph')}
        ${btn('br', 'Line break')}
        ${btn('a', 'Link')}
        ${btn('ul', 'List')}
      </div>`;
  }

  function renderOrganiserTab(m) {
    const mtz = meetingTz(m);
    return `
      <section class="panel stack">
        <h2 class="section-title">Set meeting options</h2>
        <form class="inline-form organizer-form" data-form="update-settings">
          <div class="form-grid">
            <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
            <label>Meeting timezone <span class="label-hint">(IANA name)</span>
              <input name="timezone" value="${escapeHtml(m.timezone || mtz)}" placeholder="e.g. America/Sao_Paulo" required>
            </label>
            <label>Meeting length (minutes)<input type="number" name="duration_minutes" value="${m.duration_minutes}" min="15" step="15"></label>
            <label title="How finely attendees can mark when they are free — e.g. 15 means quarter-hour slots on the calendar.">Grid step (minutes)<input type="number" name="slot_granularity_minutes" value="${m.slot_granularity_minutes}" min="15" step="15"></label>
            ${helpToggle('calendar times', 'Set the <strong>meeting length</strong> and <strong>grid step</strong> (how finely people mark availability). On the calendar, attendees tap every slot when they are free — if someone is only free for part of a meeting window, they should mark just those slots.')}
            <label>Not before <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
            <label>Not after <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
            <label class="checkbox-label"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
          </div>
          <label>Add a short description for attendees <span class="label-hint">(simple HTML)</span>
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
        <details class="propose-location-block" open>
          <summary>Meeting location (optional)</summary>
          <p class="meta">If you already know the online link or venue, add it here — use <strong>Save location</strong> below (separate from Save meeting options). Proposed locations are not final until you confirm on <strong>Availability, location &amp; agenda</strong>.</p>
          ${renderAddLocationForm()}
        </details>
      </section>`;
  }

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
        <p class="meta">Mark when <strong>you</strong> are free. This saves <strong>your availability</strong> only — it does not set the final meeting time. Organisers set the final time on <strong>Availability, location &amp; agenda</strong>.</p>
        <div class="row meta-line">
          <span class="badge">${escapeHtml(m.recurrence_label)}</span>
          <span>From ${escapeHtml(todayStr)} · Grid ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} <strong>${escapeHtml(mtz)}</strong></span>
        </div>
        ${renderAttendeesSection(m, state, attendee)}
        ${attendee ? `
          <p class="meta signed-in-line">Signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>
            ${!attendee.has_pin ? `<button type="button" class="secondary compact-btn" data-action="set-pin">Set PIN</button>` : ''}
            <button type="button" class="secondary compact-btn" data-action="switch-user">Switch / add attendee</button>
          </p>` : ''}
        ${saveRow}
        <div class="calendar-toolbar">
          <button type="button" class="secondary" data-action="prev-days" ${canGoBack ? '' : 'disabled'}>←</button>
          <strong>${formatDayRangeLabel(days)}</strong>
          <button type="button" class="secondary" data-action="next-days">→</button>
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
      </section>`;
  }

  function renderSaveRow(state) {
    if (!state.attendeeId) {
      return '';
    }
    const hint = isTouchUi
      ? 'tap slots to select'
      : 'drag across slots to select a range';
    return `<div class="row save-row calendar-save-row">
      <button type="button" data-action="save-availability">Save my availability</button>
      <span class="meta">${state.selectedSlots.size} slot(s) · ${hint}</span>
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

  function formatTimePair(iso) {
    return `<strong>${escapeHtml(formatSlotLocal(iso))}</strong> / ${escapeHtml(formatSlotUtc(iso))}`;
  }

  function bestProposedSlot(m) {
    const everyone = m.suggestions?.slots?.[0];
    if (everyone) {
      return {
        slot: everyone.slot,
        count: everyone.count,
        kind: 'everyone',
      };
    }
    const orgIds = new Set(m.attendees.filter((a) => a.is_organizer).map((a) => a.id));
    for (const p of m.suggestions?.partial_slots || []) {
      const full = p.attendees_full || [];
      const hasOrg = full.some((id) => orgIds.has(id));
      const hasOther = full.some((id) => !orgIds.has(id));
      if (hasOrg && hasOther) {
        return {
          slot: p.slot,
          count: full.length,
          kind: 'organiser_plus_one',
        };
      }
    }
    return null;
  }

  function isWellFormedUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function extractUrlFromDetail(detail) {
    const raw = String(detail || '').trim();
    if (!raw) return '';
    const match = raw.match(/https?:\/\/[^\s·]+/i);
    if (match) return match[0];
    if (isWellFormedUrl(normalizeExternalUrl(raw))) return normalizeExternalUrl(raw);
    return '';
  }

  function locationDisplayHtml(m, locationId) {
    if (!locationId) {
      return '<span class="label-hint">No location agreed — propose or select on <strong>Availability, location &amp; agenda</strong>.</span>';
    }
    const loc = m.locations.find((l) => l.id === locationId);
    if (!loc) return escapeHtml(locationId);
    const url = extractUrlFromDetail(loc.detail);
    let html = escapeHtml(loc.label);
    const kind = { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[loc.kind] || loc.kind;
    html += ` <span class="label-hint">(${escapeHtml(kind)})</span>`;
    if (url && isWellFormedUrl(url)) {
      html += ` — <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    } else if (loc.detail) {
      html += ` <span class="label-hint">(${escapeHtml(loc.detail)})</span>`;
    }
    return html;
  }

  function confirmedLocationText(m) {
    return locationDisplayHtml(m, m.confirmed_location);
  }

  function renderMeetingStatus(m) {
    const finalisedTip = 'To change the final time or location: open Availability, location & agenda and use Update final meeting time / location (organiser only).';
    if (m.confirmed_slot) {
      return `<div class="meeting-status">
        <p class="status-head"><span class="status-label">Current status:</span> <span class="badge good" title="${escapeHtml(finalisedTip)}">Finalised</span></p>
        <p class="meta">Time: ${formatTimePair(m.confirmed_slot)}</p>
        <p class="meta">Location: ${locationDisplayHtml(m, m.confirmed_location)}</p>
      </div>`;
    }
    const proposed = bestProposedSlot(m);
    let timeHint = 'No agreed time yet — mark availability on <strong>Choose calendar times</strong>.';
    if (proposed?.kind === 'everyone') {
      timeHint = `Earliest where <strong>everyone</strong> is available: ${formatTimePair(proposed.slot)} <span class="label-hint">(${proposed.count} of ${m.attendees.length})</span>`;
    } else if (proposed?.kind === 'organiser_plus_one') {
      timeHint = `Earliest where <strong>organiser and another attendee</strong> overlap: ${formatTimePair(proposed.slot)} <span class="label-hint">(${proposed.count} of ${m.attendees.length} free for the full meeting)</span>`;
    }
    const locHint = m.confirmed_location
      ? locationDisplayHtml(m, m.confirmed_location)
      : (m.locations?.length
        ? `<span class="label-hint">${m.locations.length} location(s) proposed — not finalised. Agree one on <strong>Availability, location &amp; agenda</strong>.</span>`
        : '<span class="label-hint">No location agreed — propose or select on <strong>Availability, location &amp; agenda</strong>.</span>');
    return `<div class="meeting-status">
      <p class="status-head"><span class="status-label">Current status:</span> <span class="badge">Scheduling</span></p>
      <p class="meta">Time: ${timeHint}</p>
      <p class="meta">Location: ${locHint}</p>
    </div>`;
  }

  function locationDetailSuffix(m, id) {
    const loc = m.locations.find((l) => l.id === id);
    if (!loc?.detail) return '';
    const short = String(loc.detail).length > 48 ? `${String(loc.detail).slice(0, 45)}…` : loc.detail;
    return ` (${escapeHtml(short)})`;
  }

  function locationChipLabel(loc) {
    const kind = { video: 'Online', physical: 'Physical', phone: 'Phone', hybrid: 'Hybrid', other: 'Other' }[loc.kind] || loc.kind;
    const detail = loc.detail ? ` — ${loc.detail}` : '';
    return `${loc.label} (${kind})${detail}`;
  }

  function renderFullSuggestion(m, s, mtz) {
    return `
      <div class="suggestion">
        <p class="suggestion-time">${formatTimePair(s.slot)}</p>
        <span class="meta">${s.count} of ${m.attendees.length} · ${escapeHtml(s.attendees.map((id) => attendeeLabelById(m, id)).join(', '))}</span>
        <div class="row suggestion-actions">
          <button type="button" data-action="jump-slot" data-slot="${escapeHtml(s.slot)}">Show on calendar</button>
          <button type="button" class="secondary" data-action="use-slot" data-slot="${escapeHtml(s.slot)}">Use as meeting start</button>
        </div>
      </div>`;
  }

  function renderPartialSuggestion(m, p, mtz) {
    const lines = [];
    if (p.attendees_full?.length) {
      lines.push(`Free for whole ${m.duration_minutes}-minute meeting: ${p.attendees_full.map((id) => attendeeLabelById(m, id)).join(', ')}`);
    }
    (p.attendees_partial || []).forEach((a) => {
      lines.push(`${attendeeLabelById(m, a.id)} marked only ${a.slots_marked} of ${a.slots_needed} grid steps needed for this start time`);
    });
    if (p.attendees_absent?.length) {
      lines.push(`No slots marked yet: ${p.attendees_absent.map((id) => attendeeLabelById(m, id)).join(', ')}`);
    }
    return `
      <div class="suggestion partial">
        <p class="suggestion-time">${formatTimePair(p.slot)}</p>
        <span class="meta">${escapeHtml(lines.join(' · '))}</span>
        <div class="row suggestion-actions">
          <button type="button" data-action="jump-slot" data-slot="${escapeHtml(p.slot)}">Show on calendar</button>
          ${p.attendees_full?.length ? `<button type="button" class="secondary" data-action="use-slot" data-slot="${escapeHtml(p.slot)}">Use as meeting start</button>` : ''}
        </div>
      </div>`;
  }

  function renderProposedStartBlock(m, slotVal) {
    if (m.confirmed_slot) {
      return `<p class="confirmed-time-display"><span class="label-hint">Currently selected as final meeting time:</span> ${formatTimePair(m.confirmed_slot)}</p>`;
    }
    if (slotVal) {
      return `<p class="confirmed-time-display"><span class="label-hint">Proposed (not yet final):</span> ${formatTimePair(slotVal)}</p>`;
    }
    return '<p class="meta">Choose a time from the <strong>Meeting availability</strong> pane above using &ldquo;Use as meeting start&rdquo;.</p>';
  }

  function renderFinaliseSection(m, state, attendee, slotVal) {
    if (!attendee?.is_organizer) {
      return `<p class="meta">Only <strong>organisers</strong> can lock in the final meeting time and location. Choose a location in the dropdown below when you are an organiser, or ask the organiser to finalise. Anyone can propose locations above.</p>`;
    }
    return `
      <details open><summary>Finalise meeting time &amp; location (organiser only)</summary>
        <p class="meta">Pick the <strong>final location</strong> from the dropdown, then press the button below. You can change these later.</p>
        <form class="inline-form" data-form="confirm" id="confirm-form">
          <label>Currently proposed meeting start time
            ${renderProposedStartBlock(m, slotVal)}
            <input type="hidden" name="confirmed_slot" id="confirmed-slot-hidden" value="${escapeHtml(slotVal)}">
            <details class="technical-slot-details">
              <summary>Technical UTC format (optional)</summary>
              <p class="meta">Stored as one UTC instant. <strong>T</strong> separates date and time; <strong>Z</strong> means UTC.</p>
              <input class="mono" data-action="edit-confirmed-slot" value="${escapeHtml(slotVal)}" placeholder="2026-08-18T13:00:00.000Z">
            </details>
          </label>
          <label>Final location <span class="label-hint">(organiser chooses)</span>
            <select name="confirmed_location"><option value="">— none —</option>
              ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(locationChipLabel(l))}</option>`).join('')}
            </select>
          </label>
          <button type="submit">${m.confirmed_slot ? 'Update final meeting time / location' : 'Finalise meeting time & location'}</button>
        </form>
      </details>`;
  }

  function renderTimesTab(m, state, attendee) {
    const sorted = sortSuggestions(m, state.sortOrder);
    const partial = sortPartialSuggestions(m, state.sortOrder);
    const mtz = meetingTz(m);
    const slotVal = m.confirmed_slot || state.pendingConfirmSlot || '';
    return `
      <section class="panel stack" id="meeting-availability-pane">
        <div class="row" style="justify-content:space-between">
          <h2 class="section-title" style="margin:0">Meeting availability</h2>
          <label class="sort-label">Sort
            <select data-action="sort-order">
              <option value="date"${state.sortOrder === 'date' ? ' selected' : ''}>Soonest first</option>
              <option value="count"${state.sortOrder === 'count' ? ' selected' : ''}>Most matches</option>
              <option value="names"${state.sortOrder === 'names' ? ' selected' : ''}>By names</option>
            </select>
          </label>
        </div>
        <p class="meta">Everyone available lists start times where <strong>every attendee</strong> marked enough consecutive grid steps for the full <strong>${m.duration_minutes}-minute</strong> meeting. Times shown as <strong>${escapeHtml(tz)}</strong> / UTC. Organisers: use <strong>Use as meeting start</strong> then finalise below.</p>
        <h3 class="section-title">Everyone available (full meeting)</h3>
        <div class="suggestions-scroll">
          ${sorted.length ? sorted.map((s) => renderFullSuggestion(m, s, mtz)).join('') : '<p class="meta">No times where everyone is free for the whole meeting yet.</p>'}
        </div>
        <h3 class="section-title">Not everyone available</h3>
        <p class="meta">Each row is a possible <strong>meeting start</strong> (not a single grid cell). Someone may be free for the whole meeting, have marked only part of the window, or not have responded yet.</p>
        <div class="suggestions-scroll">
          ${partial.length ? partial.map((p) => renderPartialSuggestion(m, p, mtz)).join('') : '<p class="meta">No partial overlaps yet.</p>'}
        </div>
      </section>
      <p class="meta attendee-tab-hint">Manage attendees on <strong>Choose calendar times</strong> — registered list and <strong>Add attendee</strong> are there only.</p>
      <section class="panel stack">
        <h2 class="section-title">Locations &amp; final time</h2>
        <details class="propose-location-block" open><summary>Propose a location</summary>
          <p class="meta">Anyone can propose a location. Add as many options as you need.</p>
          ${renderAddLocationForm()}
        </details>
        <h3 class="section-title">Proposed locations</h3>
        <p class="meta">Select/deselect locations that are OK for you by tap or click (light blue = selected), then <strong>Save location preferences</strong>. Propose alternatives above.</p>
        <div class="chip-list">${m.locations.length ? m.locations.map((loc) => renderLocationItem(m, state, attendee, loc)).join('') : '<p class="meta">No locations proposed yet — use Propose a location above.</p>'}</div>
        ${attendee ? '<button type="button" class="secondary" data-action="save-locations">Save location preferences</button>' : '<p class="meta">Sign in to mark location preferences.</p>'}
        ${renderFinaliseSection(m, state, attendee, slotVal)}
      </section>
      <section class="panel stack">
        <h2 class="section-title">Agenda &amp; decisions required</h2>
        <p class="meta">Agenda and decisions are plain-text lines (one item per line). Notes support simple HTML. Special file markers (<code>@@</code> at the start of a line) are neutralised automatically on save.</p>
        ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
        ${m.decisions.length ? `<p><strong>Decisions required</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
        ${(m.notes || '').trim() ? `<div class="meet-intro-body notes-display">${sanitizeHtml(m.notes)}</div>` : ''}
        <details><summary>Edit agenda / decisions / notes</summary>
          <form class="inline-form" data-form="update-meta">
            <label>Agenda <span class="label-hint">(one item per line)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(one per line)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes <span class="label-hint">(simple HTML)</span>
              ${formatToolbar('notes', { withHelp: false })}
              <textarea name="notes" rows="3">${escapeHtml(m.notes || '')}</textarea>
            </label>
            <button type="submit">Save</button>
          </form>
        </details>
      </section>`;
  }

  function renderAfterTab(m, state) {
    return `
      <section class="panel stack">
        <h2 class="section-title">Recordings, transcripts &amp; AI summaries</h2>
        ${m.attachments.length ? m.attachments.map(renderAttachment).join('') : '<p class="meta">Nothing attached yet.</p>'}
        <details><summary>Add attachment</summary>
          <form class="inline-form" data-form="add-attachment">
            <input name="label" required placeholder="Label">
            <select name="type"><option value="url">URL</option><option value="text">Text summary</option></select>
            <input name="url" type="url" placeholder="https://example.com/...">
            <p class="meta">Use a full web address starting with https:// (not a page on this site).</p>
            <textarea name="body" rows="3" placeholder="Paste summary (plain text)"></textarea>
            <button type="submit">Attach</button>
          </form>
        </details>
      </section>`;
  }

  function renderAddAttendeeForm(signedIn) {
    const modeField = signedIn
      ? `<input type="hidden" name="add_mode" value="propose">
         <p class="meta span-full">Adds someone to the list. Share the meeting link with them — no email is sent.</p>`
      : `<fieldset class="add-mode-fieldset">
          <legend class="label-hint">Who are you adding?</legend>
          <label class="radio-label"><input type="radio" name="add_mode" value="self" checked> This is me — I will mark my availability</label>
          <label class="radio-label"><input type="radio" name="add_mode" value="propose"> Someone else — propose them for this meeting</label>
        </fieldset>`;
    const extras = signedIn ? '' : `
        <div class="pin-fields" data-show-when="self">
          <label>PIN (optional) <span class="label-hint">(numbers only)</span>
            <input name="pin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="12" placeholder="For Find my meetings on the home page">
          </label>
        </div>
        <p class="meta span-full propose-hint" data-show-when="propose" hidden>They are not notified — share the meeting link. They use <strong>This is me</strong> on their row to claim it.</p>`;
    return `
      <details class="register-block"${signedIn ? '' : ' open'}>
        <summary>Add attendee</summary>
        <form class="inline-form add-attendee-form" data-form="add-attendee">
          ${modeField}
          <div class="form-grid">
            <label>Display name<input name="display_name" required placeholder="Name as shown in the list"></label>
            <label>Initials (optional)<input name="initials" maxlength="4"></label>
            <label>Contact (optional)<input name="contact" placeholder="email or phone"></label>
          </div>
          ${extras}
          <button type="submit">Add attendee</button>
        </form>
      </details>`;
  }

  function renderAttendeesSection(m, state, attendee) {
    const signedIn = !!attendee;
    let hint = '';
    if (!signedIn) {
      hint = 'If your name is already listed, click <strong>This is me</strong> on that row. Otherwise use <strong>Add attendee</strong> below.';
    } else if (attendee.is_organizer) {
      hint = 'Use Remove duplicate (keep me) on same-name rows, or Merge any two attendees below.';
    } else {
      hint = 'If you appear more than once, use Remove duplicate (keep me) on the extra row.';
    }
    const claiming = m.attendees.find((a) => a.id === state.claimingId);
    const showOrganiserCol = signedIn && attendee.is_organizer;
    const colCount = 5 + (showOrganiserCol ? 1 : 0);

    return `
      <section class="panel stack attendee-section">
        <h2 class="section-title">Registered attendees</h2>
        ${hint ? `<p class="meta">${hint}</p>` : ''}
        <div class="table-wrap">
          <table class="data-table attendee-table">
            <thead><tr><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th>${showOrganiserCol ? '<th>Organiser</th>' : ''}<th></th></tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => renderAttendeeRow(m, state, attendee, a, { signedIn, showOrganiserCol })).join('') : `<tr><td colspan="${colCount}">No attendees yet — add one below.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${claiming ? renderClaimPinForm(claiming) : ''}
        ${signedIn && attendee.is_organizer ? renderOrganiserMergePanel(m) : ''}
        ${renderAddAttendeeForm(signedIn)}
      </section>`;
  }

  function renderLocationItem(m, state, attendee, loc) {
    const selected = state.selectedLocations.has(loc.id);
    return `<div class="location-item">
      <button type="button" class="chip${selected ? ' active' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}"
        title="${selected ? 'Click to deselect, then Save location preferences' : 'Click to select, then Save location preferences'}">
        ${escapeHtml(locationChipLabel(loc))}
      </button>
      ${attendee?.is_organizer ? `<button type="button" class="secondary compact-btn" data-action="delete-location" data-location-id="${escapeHtml(loc.id)}" title="Remove this location proposal">Remove</button>` : ''}
    </div>`;
  }

  function renderAddLocationForm() {
    return `
      <form class="inline-form add-location-form" data-form="add-location">
        <label>Type
          <select name="location_mode">
            <option value="online">Online</option>
            <option value="physical">Physical</option>
            <option value="hybrid">Hybrid</option>
            <option value="phone">Phone / dial-in</option>
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
          <label>Meeting link <input name="online_url" placeholder="https://..."></label>
        </div>
        <div data-loc-fields="physical" class="loc-fields" hidden>
          <label>Name <input name="physical_label" placeholder="e.g. Main office"></label>
          <label>Address <input name="physical_address" placeholder="Street, city"></label>
        </div>
        <div data-loc-fields="hybrid" class="loc-fields" hidden>
          <label>Name <input name="hybrid_label" placeholder="e.g. Office + Zoom"></label>
          <label>Online link <input name="hybrid_url" placeholder="https://..."></label>
          <label>Address <input name="hybrid_address" placeholder="Street, city"></label>
        </div>
        <div data-loc-fields="phone" class="loc-fields" hidden>
          <label>Label <input name="phone_label" placeholder="e.g. Conference line"></label>
          <label>Dial-in <input name="phone_detail" placeholder="Phone number or instructions"></label>
        </div>
        <p class="meta span-full">Save adds another option to the list above — you can propose several.</p>
        <button type="submit">Save location</button>
      </form>`;
  }

  function buildLocationPayload(fd) {
    const mode = fd.get('location_mode') || 'online';
    let built;
    if (mode === 'physical') {
      const label = String(fd.get('physical_label') || '').trim();
      const addr = String(fd.get('physical_address') || '').trim();
      if (!label && !addr) throw new Error('Enter a venue name or address before saving');
      built = {
        label: label || 'Physical location',
        kind: 'physical',
        detail: addr,
      };
    } else if (mode === 'hybrid') {
      const rawUrl = String(fd.get('hybrid_url') || '').trim();
      const url = rawUrl ? normalizeExternalUrl(rawUrl) : '';
      const addr = String(fd.get('hybrid_address') || '').trim();
      if (!url && !addr) throw new Error('Enter an online link and/or a physical address before saving');
      if (url && !isWellFormedUrl(url)) throw new Error('Online link must be a valid URL starting with https://');
      built = {
        label: String(fd.get('hybrid_label') || 'Hybrid').trim() || 'Hybrid',
        kind: 'hybrid',
        detail: [url, addr].filter(Boolean).join(' · '),
      };
    } else if (mode === 'phone') {
      const detail = String(fd.get('phone_detail') || '').trim();
      if (!detail) throw new Error('Enter dial-in details before saving');
      built = {
        label: String(fd.get('phone_label') || 'Phone').trim() || 'Phone',
        kind: 'phone',
        detail,
      };
    } else {
      const rawUrl = String(fd.get('online_url') || '').trim();
      if (!rawUrl) throw new Error('Enter a meeting link URL before saving');
      const url = normalizeExternalUrl(rawUrl);
      if (!isWellFormedUrl(url)) throw new Error('Meeting link must be a valid URL starting with https://');
      built = {
        label: String(fd.get('online_service') || 'Online').trim() || 'Online',
        kind: 'video',
        detail: url,
      };
    }
    return built;
  }

  function renderOrganiserMergePanel(m) {
    const opts = m.attendees.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(attendeeLabel(a))}</option>`).join('');
    return `
      <details class="merge-organiser-panel help-toggle">
        <summary><span class="help-q">?</span> Merge any two attendees (organiser)</summary>
        <form class="inline-form row" data-form="merge-organiser">
          <label>Merge into (keep this row) <select name="keep_id" required>${opts}</select></label>
          <label>Merge from (delete this row) <select name="remove_id" required>${opts}</select></label>
          <button type="submit">Merge</button>
        </form>
        <p class="meta help-body">Availability from the second person is combined into the first; the second row is removed. You do not need their PIN as organiser.</p>
      </details>`;
  }

  function renderAttendeeRow(m, state, current, a, { signedIn, showOrganiserCol }) {
    const isSelf = current?.id === a.id;
    const dupOfSelf = current && a.id !== current.id
      && a.display_name.trim().toLowerCase() === current.display_name.trim().toLowerCase();
    const pinBadge = a.has_pin ? '<span class="badge" title="PIN protected">PIN</span>' : '';
    const orgBadge = a.is_organizer ? '<span class="badge good">Org</span>' : '';
    const actions = [];

    if (!signedIn) {
      if (!current || isSelf) {
        actions.push(`<button type="button" class="secondary compact-btn" data-action="claim-row" data-attendee-id="${escapeHtml(a.id)}">${isSelf ? 'You' : 'This is me'}</button>`);
      }
    } else if (current && a.id !== current.id && dupOfSelf) {
      actions.push(`<button type="button" class="secondary compact-btn" data-action="merge-into-me" data-remove-id="${escapeHtml(a.id)}">Remove duplicate (keep me)</button>`);
    }

    const organiserCell = showOrganiserCol
      ? `<td><input type="checkbox" data-action="toggle-organizer" data-attendee-id="${escapeHtml(a.id)}" ${a.is_organizer ? 'checked' : ''} aria-label="Meeting organiser for ${escapeHtml(a.display_name)}"></td>`
      : '';

    return `<tr class="attendee-row${isSelf ? ' is-self' : ''}${!signedIn ? ' is-selectable' : ''}">
      <td>${escapeHtml(a.display_name)} ${pinBadge} ${orgBadge}</td>
      <td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
      <td>${a.contact ? `<a href="${contactHref(a.contact)}">${escapeHtml(a.contact)}</a>` : '—'}</td>
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
        <p class="meta"><strong>${escapeHtml(target.display_name)}</strong> — ${needsPin ? 'enter your PIN, then press Enter or click Continue' : 'optional: set a numeric PIN, then press Enter or click Continue'}</p>
        <label>${needsPin ? 'PIN' : 'PIN (optional)'}
          <input name="pin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" ${needsPin ? 'required' : ''} maxlength="12">
        </label>
        <div class="row">
          <button type="submit">${needsPin ? 'Continue' : 'Continue'}</button>
          <button type="button" class="secondary" data-action="cancel-claim">Cancel</button>
        </div>
      </form>`;
  }

  function renderAttachment(att) {
    if (att.type === 'text') return `<div class="attachment"><strong>${escapeHtml(att.label)}</strong><pre class="attachment-body">${escapeHtml(att.body || '')}</pre></div>`;
    const href = normalizeExternalUrl(att.url);
    return `<div class="attachment"><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a></div>`;
  }

  function normalizeExternalUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '#';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    return `https://${raw.replace(/^\/+/, '')}`;
  }

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
        const payload = {
          action: 'join', slug: state.slug,
          display_name: fd.get('display_name'), contact: fd.get('contact'),
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
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
        data = await apiPost({ action: 'update_meta', slug: state.slug, acting_attendee_id: state.attendeeId, title: fd.get('title'),
          duration_minutes: Number(fd.get('duration_minutes')), slot_granularity_minutes: Number(fd.get('slot_granularity_minutes')),
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          timezone: String(fd.get('timezone') || '').trim() || tz,
          show_weekends: fd.get('show_weekends') === 'on',
          organizer_intro: fd.get('organizer_intro'), recurrence: buildRecurrenceFromForm(fd) });
      } else if (kind === 'update-meta') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes') });
      } else if (kind === 'add-location') {
        const built = buildLocationPayload(fd);
        if (!built.label) throw new Error('Location label required');
        data = await apiPost({ action: 'add_location', slug: state.slug, label: built.label, kind: built.kind, detail: built.detail });
        form.reset();
      } else if (kind === 'add-attachment') {
        const type = fd.get('type');
        const url = type === 'url' ? normalizeExternalUrl(fd.get('url')) : undefined;
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type, url, body: fd.get('body') });
      } else if (kind === 'confirm') {
        data = await apiPost({ action: 'confirm', slug: state.slug, acting_attendee_id: state.attendeeId, confirmed_slot: fd.get('confirmed_slot'), confirmed_location: fd.get('confirmed_location') });
        state.pendingConfirmSlot = null;
      } else if (kind === 'merge-organiser') {
        const keepId = fd.get('keep_id');
        const removeId = fd.get('remove_id');
        if (keepId === removeId) throw new Error('Choose two different attendees');
        data = await apiPost({
          action: 'merge_attendees', slug: state.slug, keep_id: keepId, remove_id: removeId,
          acting_attendee_id: state.attendeeId,
        });
        if (state.attendeeId === removeId) {
          state.attendeeId = keepId;
          localStorage.setItem(attendeeKey(state.slug), keepId);
        }
      } else return;
      state.meet = data.meet;
      if (kind === 'add-attendee' && (fd.get('add_mode') || 'self') === 'self') restoreAttendeeSelections(state);
      else if (kind === 'claim') restoreAttendeeSelections(state);
      render(root, state);
      if (kind === 'add-location') toast('Location added — finalise it on Availability, location & agenda');
      else if (kind === 'add-attendee') {
        const mode = fd.get('add_mode') || 'self';
        toast(mode === 'self' ? 'You are signed in — mark your availability on the calendar' : 'Attendee added — share the meeting link with them');
      }
      else if (kind === 'confirm') toast('Final time saved — see summary under the meeting title');
      else if (kind === 'update-settings') toast('Meeting options saved');
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
    if (action === 'tab') { setTab(state, btn.dataset.tab); render(root, state); return; }
    if (action === 'copy-link') {
      const input = document.getElementById('share-url-input');
      const link = input?.value || shareUrl(state.slug);
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copied');
      } catch (_) { if (input) { input.value = link; input.select(); } document.execCommand('copy'); toast('Link copied'); }
      return;
    }
    if (action === 'toggle-header') {
      state.headerExpanded = !state.headerExpanded;
      render(root, state);
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
    if (action === 'toggle-slot') { toggleSlot(state, btn.dataset.slot); render(root, state); return; }
    if (action === 'toggle-location') {
      const id = btn.dataset.location;
      state.selectedLocations.has(id) ? state.selectedLocations.delete(id) : state.selectedLocations.add(id);
      render(root, state);
      toast(state.selectedLocations.has(id) ? 'Location selected — press Save location preferences' : 'Location deselected — press Save location preferences');
      return;
    }
    if (action === 'delete-location') {
      if (!window.confirm('Remove this location proposal from the meeting?')) return;
      try {
        const data = await apiPost({
          action: 'remove_location', slug: state.slug,
          acting_attendee_id: state.attendeeId, location_id: btn.dataset.locationId,
        });
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
      setTab(state, 'times');
      render(root, state);
      document.getElementById('confirm-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      if (state.attendeeId === btn.dataset.attendeeId) {
        toast('Already signed in as this attendee');
        return;
      }
      state.claimingId = btn.dataset.attendeeId;
      render(root, state);
      requestAnimationFrame(() => root.querySelector('.claim-form input[name="pin"]')?.focus());
      return;
    }
    if (action === 'cancel-claim') {
      state.claimingId = null;
      render(root, state);
      return;
    }
    if (action === 'merge-into-me') {
      const removeId = btn.dataset.removeId;
      const me = state.meet.attendees.find((a) => a.id === state.attendeeId);
      const target = state.meet.attendees.find((a) => a.id === removeId);
      if (!me || !target) return;
      let pin = '';
      const confirmMsg = `Keep your row (${attendeeLabel(me)}) and delete the duplicate (${attendeeLabel(target)})?\n\nAvailability from the removed row will be combined into yours. Your attendee ID stays the same.`;
      if (target.has_pin) {
        pin = window.prompt('Enter the PIN for the duplicate row you are removing:') || '';
        if (!pin) return;
      } else if (!window.confirm(confirmMsg)) {
        return;
      }
      try {
        const data = await apiPost({
          action: 'merge_attendees', slug: state.slug, keep_id: state.attendeeId, remove_id: removeId,
          acting_attendee_id: state.attendeeId, pin: pin || undefined,
        });
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
      const pin = window.prompt('Choose a numeric PIN (for List my meetings on the home page):');
      if (!pin) return;
      try {
        const data = await apiPost({ action: 'claim', slug: state.slug, attendee_id: state.attendeeId, pin });
        state.meet = data.meet;
        render(root, state);
        toast('PIN saved');
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
    else if (fmt === 'a') {
      const href = prompt('Link URL:', 'https://');
      if (!href) return;
      insert = `<a href="${href}" target="_blank" rel="noopener noreferrer">${sel || 'link text'}</a>`;
    } else if (fmt === 'ul') insert = `<ul>\n<li>${sel || 'item'}</li>\n</ul>`;
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.focus();
  }

  function handleChange(e, root, state) {
    if (e.target.matches('[data-action="edit-confirmed-slot"]')) {
      const hidden = document.getElementById('confirmed-slot-hidden');
      if (hidden) hidden.value = e.target.value;
      return;
    }
    if (e.target.name === 'location_mode') {
      const form = e.target.closest('form');
      if (form) {
        form.querySelectorAll('[data-loc-fields]').forEach((el) => {
          el.hidden = el.dataset.locFields !== e.target.value;
        });
      }
      return;
    }
    if (e.target.matches('[data-action="sort-order"]')) { state.sortOrder = e.target.value; render(root, state); return; }
    if (e.target.name === 'add_mode') {
      const form = e.target.closest('form');
      if (!form) return;
      const isSelf = e.target.value === 'self';
      form.querySelector('[data-show-when="self"]')?.toggleAttribute('hidden', !isSelf);
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
        if (weekend) {
          cb.disabled = !e.target.checked;
          if (!e.target.checked) cb.checked = false;
        }
      });
      return;
    }
    if (e.target.matches('[data-action="toggle-organizer"]')) {
      const targetId = e.target.dataset.attendeeId;
      const checked = e.target.checked;
      apiPost({
        action: 'set_organizer', slug: state.slug,
        acting_attendee_id: state.attendeeId, attendee_id: targetId, organizer: checked,
      }).then((data) => {
        state.meet = data.meet;
        render(root, state);
        toast('Organiser updated');
      }).catch((err) => {
        e.target.checked = !checked;
        toast(err.message, true);
      });
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

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function weekdaySelect(name, value) {
    return `<select name="${name}">${WEEKDAYS.map((d, i) =>
      `<option value="${i}"${Number(value) === i ? ' selected' : ''}>${d}</option>`).join('')}</select>`;
  }

  function nthSelect(name, value) {
    return `<select name="${name}">${[[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [-1, 'last (e.g. last Friday)']].map(([v, l]) =>
      `<option value="${v}"${Number(value) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function recurrenceOptions(current) {
    return [
      ['none', 'One-off (find one time, then confirm)'],
      ['weekly', 'Weekly on chosen day(s)'],
      ['monthly_day', 'Same date each month (e.g. the 19th)'],
      ['monthly_nth_weekday', 'Same weekday each month (e.g. 3rd Monday)'],
      ['friday_13th', 'Friday 13th only (rare)'],
    ].map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
  }

  function recurrenceExtraFields(rec, showWeekends = false) {
    const type = rec.type || 'none';
    if (type === 'weekly') {
      return `
        <label>Repeat every <input type="number" name="interval" value="${rec.interval || 1}" min="1" max="52"> week(s)</label>
        ${weekdayCheckboxes(rec, showWeekends)}`;
    }
    if (type === 'monthly_day') {
      const day = Number(rec.day || 1);
      const interval = Number(rec.interval || 1);
      const dayOpts = Array.from({ length: 31 }, (_, i) => {
        const v = i + 1;
        return `<option value="${v}"${day === v ? ' selected' : ''}>${v}</option>`;
      }).join('');
      const intOpts = Array.from({ length: 24 }, (_, i) => {
        const v = i + 1;
        return `<option value="${v}"${interval === v ? ' selected' : ''}>${v}</option>`;
      }).join('');
      return `
        <p class="meta">Same calendar date each month (e.g. the 19th). Shorter months use the last day if needed.</p>
        <div class="recurrence-inline">
          <label>Day <select name="day">${dayOpts}</select></label>
          <label>every <select name="interval">${intOpts}</select> month(s)</label>
        </div>`;
    }
    if (type === 'monthly_nth_weekday') {
      const interval = Number(rec.interval || 1);
      const intOpts = Array.from({ length: 24 }, (_, i) => {
        const v = i + 1;
        return `<option value="${v}"${interval === v ? ' selected' : ''}>${v}</option>`;
      }).join('');
      return `
        <p class="meta">Example: 3rd Monday every 2 months.</p>
        <div class="recurrence-inline">
          <label>${nthSelect('nth', rec.nth ?? 3)}</label>
          <label>${weekdaySelect('weekday', rec.weekday ?? 1)}</label>
          <label>every <select name="interval">${intOpts}</select> month(s)</label>
        </div>`;
    }
    if (type === 'friday_13th') {
      return '<p class="meta">Highlights dates that are both the <strong>13th</strong> and a <strong>Friday</strong>. Rare — usually leave as One-off.</p>';
    }
    return '<p class="meta">Pick a time everyone can make, then confirm it. Recurrence marks similar future dates on the calendar.</p>';
  }

  function weekdayCheckboxes(rec, showWeekends) {
    const selected = new Set(rec.weekdays || [1]);
    return `
      <label>On these days</label>
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
    for (let i = 0; i < 7; i++) {
      if (fd.get(`weekday_${i}`) !== null) weekdays.push(i);
    }
    return weekdays;
  }

  function weekdaysToNames(nums) {
    return (nums || [1]).map((n) => WEEKDAYS[Number(n)] || n).join(', ');
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

  function slotIsoFromLocal(day, hm) {
    const d = new Date(day);
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toISOString();
  }

  function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function meetingTodayStr(m) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: meetingTz(m) }).format(new Date());
  }
  function parseDateIsoLocal(iso) {
    const [y, mo, d] = iso.split('-').map(Number);
    return startOfDay(new Date(y, mo - 1, d));
  }
  function calendarMinStart(m) {
    return parseDateIsoLocal(m.calendar_start || meetingTodayStr(m));
  }
  function calendarViewStart(state, m) {
    const min = calendarMinStart(m);
    return state.viewStart < min ? min : state.viewStart;
  }
  function toDateIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function formatDayHead(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function formatDayRangeLabel(days) {
    if (!days.length) return '';
    return days.length === 1 ? formatDayHead(days[0]) : `${formatDayHead(days[0])} – ${formatDayHead(days[days.length - 1])}`;
  }
  function formatHour(hm) { const d = new Date(); d.setHours(hm.hour, hm.minute, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function formatSlotLocal(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function attendeeName(m, id) { return m.attendees.find((a) => a.id === id)?.display_name || id; }
  function attendeeLabel(a) { return a.initials ? `${a.display_name} (${a.initials})` : a.display_name; }
  function attendeeLabelById(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? attendeeLabel(a) : id; }
  function attendeeInitials(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? (a.initials || deriveInitials(a.display_name)) : ''; }
  function deriveInitials(name) { return String(name).trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase(); }
  function countSlotsFor(m, id) { return Object.values(m.availability).filter((ids) => ids.includes(id)).length; }
  function locationLabel(m, id) { return m.locations.find((l) => l.id === id)?.label || id; }
  function contactHref(c) { return String(c).includes('@') ? `mailto:${c}` : `tel:${c}`; }
  function lines(v) { return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean); }
  function shareUrl(slug) { return meetingUrl(slug); }
  function slugify(v) { return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meet'; }

  function formatSlotUtc(iso) {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
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
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
})();
