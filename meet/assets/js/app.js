(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const INTRO_PLACEHOLDER = 'Add a short description for attendees — click the pencil or use Set meeting options.';
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
          box.innerHTML = '<p class="meta">No meetings found for that name and PIN. Check spelling, PIN, and that you joined as organiser with a PIN set.</p>';
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
      headerExpanded: !isTouchUi,
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
      state.activeTab = explicit || (state.meet.attendees.length ? 'calendar' : 'organiser');
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
    state.activeTab = tab;
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
                ${m.confirmed_slot ? '<span class="badge good">Confirmed</span>' : ''}
                ${isTouchUi ? `<button type="button" class="secondary compact-btn" data-action="toggle-header">${state.headerExpanded ? 'Less ▲' : 'Info ▼'}</button>` : ''}
                <button type="button" class="secondary compact-btn" data-action="copy-link" title="Copy meeting link">Copy meeting link</button>
              </div>
            </div>
            <div class="sticky-extras${state.headerExpanded ? ' is-open' : ''}">
              ${renderIntroBlock(m, state, 'organizer_intro', m.organizer_intro, INTRO_PLACEHOLDER)}
              ${tabPageIntro(m, state)}
              <p class="meta tz-banner">Hours in <strong>${escapeHtml(meetingTz(m))}</strong> · You: <strong>${escapeHtml(tz)}</strong></p>
              ${m.confirmed_slot ? `<div class="confirmed compact">Confirmed: ${escapeHtml(formatSlotInTz(m.confirmed_slot, meetingTz(m)))}${m.confirmed_location ? ` · ${escapeHtml(locationLabel(m, m.confirmed_location))}` : ''}</div>` : ''}
              <div class="share-row row desktop-share">
                <input class="share-input" type="text" readonly value="${escapeHtml(url)}" id="share-url-input">
                <button type="button" class="secondary" data-action="copy-link">Copy meeting link</button>
              </div>
            </div>
            <nav class="tab-nav" role="tablist">
              ${tabBtn('calendar', 'Calendar', state)}
              ${tabBtn('times', 'Meeting details', state)}
              ${tabBtn('after', 'After meeting', state)}
              ${tabBtn('organiser', 'Set meeting options', state)}
            </nav>
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
  }

  function tabBtn(id, label, state) {
    return `<button type="button" class="tab${state.activeTab === id ? ' active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`;
  }

  function tabPageIntro(m, state) {
    if (state.activeTab === 'times') {
      return renderIntroBlock(m, state, 'page_times_intro', m.page_times_intro, 'Optional intro for the Meeting details page.', 'Page intro');
    }
    if (state.activeTab === 'after') {
      return renderIntroBlock(m, state, 'page_after_intro', m.page_after_intro, 'Optional intro for recordings and summaries.', 'Page intro');
    }
    return '';
  }

  function renderIntroBlock(m, state, field, text, placeholder, editLabel = 'Meeting text') {
    if (state.editingIntro === field) {
      return `
        <div class="meet-intro-edit">
          <label>${escapeHtml(editLabel)} <span class="label-hint">(simple HTML)</span></label>
          ${formatToolbar(field)}
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
        <button type="button" class="icon-btn" data-action="edit-intro" data-field="${field}" title="Edit meeting text">✎</button>
      </div>`;
  }

  function textEntryHelp() {
    return `
      <details class="fmt-help">
        <summary>Help — meeting text</summary>
        <p class="meta">Enter plain text here. Line breaks in the box will show as breaks on the page. Use the buttons to insert formatting: highlighted text is wrapped when you click Bold, Italic, Paragraph, or Line break. Allowed tags: paragraph, line break, bold, italic, links, and lists. Other HTML is removed for safety.</p>
      </details>`;
  }

  function formatToolbar(field) {
    return `
      ${textEntryHelp()}
      <div class="fmt-toolbar" data-field="${field}">
        <button type="button" class="secondary fmt-btn" data-fmt="strong" title="Bold">Bold</button>
        <button type="button" class="secondary fmt-btn" data-fmt="em" title="Italic">Italic</button>
        <button type="button" class="secondary fmt-btn" data-fmt="p" title="Paragraph">Paragraph</button>
        <button type="button" class="secondary fmt-btn" data-fmt="br" title="Line break">Line break</button>
        <button type="button" class="secondary fmt-btn" data-fmt="a" title="Link">Link</button>
        <button type="button" class="secondary fmt-btn" data-fmt="ul" title="Bullet list">List</button>
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
            <label>Grid step (minutes)<input type="number" name="slot_granularity_minutes" value="${m.slot_granularity_minutes}" min="15" step="15"></label>
            <details class="field-help"><summary>Help — calendar times</summary>
              <p class="meta">Attendees select time in <strong>grid step</strong> chunks (e.g. every 15 minutes). A full meeting needs enough consecutive chunks to cover <strong>meeting length</strong> (e.g. four 15-minute chunks for one hour). Someone can mark only part of that window — partial availability is shown on the Meeting details tab.</p>
            </details>
            <label>Not before <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
            <label>Not after <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
            <label class="checkbox-label"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
          </div>
          <label>Meeting text <span class="label-hint">(simple HTML)</span>
            ${formatToolbar('organizer_intro')}
            <textarea name="organizer_intro" rows="4">${escapeHtml(m.organizer_intro || '')}</textarea>
          </label>
          <details>
            <summary>Recurrence</summary>
            <label>Recurrence type<select name="recurrence_type">${recurrenceOptions(m.recurrence.type)}</select></label>
            <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence, m.show_weekends)}</div>
          </details>
          <button type="submit">Save meeting options</button>
        </form>
      </section>`;
  }

  function renderCalendarTab(m, state, attendee) {
    const dayCount = visibleDayCount();
    const days = getVisibleDays(calendarViewStart(state, m), dayCount, m.show_weekends);
    const mtz = meetingTz(m);
    const hours = buildHours(m.day_start, m.day_end, m.slot_granularity_minutes);
    const recurringSet = new Set(m.recurrence_dates || []);
    const saveRow = attendee ? renderSaveRow(state) : '';
    const todayStr = meetingTodayStr(m);
    const canGoBack = calendarViewStart(state, m) > parseDateIsoLocal(todayStr);

    return `
      <section class="panel stack calendar-panel">
        <div class="row meta-line">
          <span class="badge">${escapeHtml(m.recurrence_label)}</span>
          <span>From ${escapeHtml(todayStr)} · Grid ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} <strong>${escapeHtml(mtz)}</strong></span>
        </div>
        ${renderAttendeesSection(m, state, attendee, { mode: 'picker' })}
        ${attendee ? `
          <p class="meta">Signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>
            <button type="button" class="secondary" data-action="switch-user">Switch</button>
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
        ${saveRow}
      </section>`;
  }

  function renderSaveRow(state) {
    const hint = isTouchUi
      ? 'tap slots to select'
      : 'drag across slots to select a range';
    return `<div class="row save-row">
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

  function renderFullSuggestion(m, s, mtz) {
    return `
      <div class="suggestion">
        <strong>${escapeHtml(formatSlotInTz(s.slot, mtz))}</strong>
        <span class="meta">${escapeHtml(formatSlotLocal(s.slot))} · ${escapeHtml(formatSlotUtc(s.slot))}</span>
        <span class="meta">${s.count} · ${escapeHtml(s.attendees.map((id) => attendeeLabelById(m, id)).join(', '))}</span>
        <div class="row suggestion-actions">
          <button type="button" data-action="jump-slot" data-slot="${escapeHtml(s.slot)}">Show on calendar</button>
          <button type="button" class="secondary" data-action="use-slot" data-slot="${escapeHtml(s.slot)}">Use as confirmed time</button>
        </div>
      </div>`;
  }

  function renderPartialSuggestion(m, p, mtz) {
    const lines = [];
    if (p.attendees_full?.length) {
      lines.push(`Full for whole meeting: ${p.attendees_full.map((id) => attendeeLabelById(m, id)).join(', ')}`);
    }
    (p.attendees_partial || []).forEach((a) => {
      lines.push(`${attendeeLabelById(m, a.id)}: ${a.slots_marked} of ${a.slots_needed} time chunks`);
    });
    return `
      <div class="suggestion partial">
        <strong>${escapeHtml(formatSlotInTz(p.slot, mtz))}</strong>
        <span class="meta">${escapeHtml(formatSlotLocal(p.slot))} · ${escapeHtml(formatSlotUtc(p.slot))}</span>
        <span class="meta">${escapeHtml(lines.join(' · '))}</span>
        <div class="row suggestion-actions">
          <button type="button" data-action="jump-slot" data-slot="${escapeHtml(p.slot)}">Show on calendar</button>
        </div>
      </div>`;
  }

  function renderTimesTab(m, state, attendee) {
    const sorted = sortSuggestions(m, state.sortOrder);
    const partial = sortPartialSuggestions(m, state.sortOrder);
    const mtz = meetingTz(m);
    const slotVal = m.confirmed_slot || state.pendingConfirmSlot || '';
    return `
      <section class="panel stack">
        <div class="row" style="justify-content:space-between">
          <h2 class="section-title" style="margin:0">Meeting details</h2>
          <label class="sort-label">Sort
            <select data-action="sort-order">
              <option value="date"${state.sortOrder === 'date' ? ' selected' : ''}>Soonest first</option>
              <option value="count"${state.sortOrder === 'count' ? ' selected' : ''}>Most matches</option>
              <option value="names"${state.sortOrder === 'names' ? ' selected' : ''}>By names</option>
            </select>
          </label>
        </div>
        <p class="meta">Full overlaps need everyone free for the whole meeting length. Partial overlaps are noted below.</p>
        <h3 class="section-title">Everyone free (full meeting)</h3>
        <div class="suggestions-scroll">
          ${sorted.length ? sorted.map((s) => renderFullSuggestion(m, s, mtz)).join('') : '<p class="meta">No full overlaps yet.</p>'}
        </div>
        <h3 class="section-title">Partial availability</h3>
        <div class="suggestions-scroll">
          ${partial.length ? partial.map((p) => renderPartialSuggestion(m, p, mtz)).join('') : '<p class="meta">No partial overlaps yet.</p>'}
        </div>
      </section>
      ${renderAttendeesSection(m, state, attendee, { mode: 'details' })}
      <section class="panel stack">
        <h2 class="section-title">Locations</h2>
        <div class="chip-list">${m.locations.map((loc) => `
          <button type="button" class="chip${state.selectedLocations.has(loc.id) ? ' active' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}">
            ${escapeHtml(loc.label)} <small>(${escapeHtml(loc.kind)})</small>
          </button>`).join('') || '<p class="meta">No locations yet.</p>'}</div>
        ${attendee ? '<button type="button" class="secondary" data-action="save-locations">Save location preferences</button>' : ''}
        <details><summary>Propose a location</summary>
          <form class="inline-form" data-form="add-location">
            <input name="label" placeholder="e.g. Zoom" required>
            <select name="kind"><option value="video">Video</option><option value="physical">Physical</option><option value="phone">Phone</option><option value="other">Other</option></select>
            <input name="detail" placeholder="URL or address">
            <button type="submit">Add</button>
          </form>
        </details>
        <details open><summary>Confirm final time &amp; location</summary>
          <form class="inline-form" data-form="confirm" id="confirm-form">
            <label>Slot <span class="label-hint">(stored as UTC; shown below in meeting &amp; your time)</span>
              <input name="confirmed_slot" value="${escapeHtml(slotVal)}">
            </label>
            ${slotVal ? `<p class="meta">Meeting time (${escapeHtml(mtz)}): <strong>${escapeHtml(formatSlotInTz(slotVal, mtz))}</strong>${mtz !== tz ? ` · Your time: <strong>${escapeHtml(formatSlotLocal(slotVal))}</strong>` : ''}</p>` : ''}
            <label>Location<select name="confirmed_location"><option value="">—</option>
              ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
            </select></label>
            <button type="submit">Confirm meeting</button>
          </form>
        </details>
      </section>
      <section class="panel stack">
        <h2 class="section-title">Agenda &amp; decisions required</h2>
        ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
        ${m.decisions.length ? `<p><strong>Decisions required</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
        <details><summary>Edit agenda / decisions</summary>
          <form class="inline-form" data-form="update-meta">
            <label>Agenda <span class="label-hint">(plain text, one item per line)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(plain text, one per line)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes <span class="label-hint">(plain text)</span><textarea name="notes" rows="2">${escapeHtml(m.notes || '')}</textarea></label>
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
            <input name="url" placeholder="https://...">
            <textarea name="body" rows="3" placeholder="Paste summary (plain text)"></textarea>
            <button type="submit">Attach</button>
          </form>
        </details>
      </section>`;
  }

  function renderJoinForm() {
    return `<form class="inline-form join-form" data-form="join">
      <div class="form-grid">
        <label>Your name<input name="display_name" required></label>
        <label>Initials (optional)<input name="initials" maxlength="4"></label>
        <label>Contact (optional)<input name="contact" placeholder="email or phone"></label>
        <label>PIN (optional) <span class="label-hint">(numbers only)</span>
          <input name="pin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="12" placeholder="Optional">
        </label>
        <p class="meta">If you may need to recover this meeting from the home page later, <strong>set a PIN now</strong>. You will need this <strong>name and PIN</strong> on the home page under List my meetings if you lose the link. No PIN means link-only access.</p>
      </div>
      <button type="submit">Register as new attendee</button>
    </form>`;
  }

  function renderAttendeesSection(m, state, attendee, { mode = 'details' } = {}) {
    const isPicker = mode === 'picker';
    const title = isPicker ? 'Who are you?' : 'Attendees';
    const hint = isPicker && !attendee
      ? 'Click your name if you are already listed. Otherwise register as a new attendee below.'
      : (!isPicker && attendee
        ? (attendee.is_organizer
          ? 'As meeting organiser you can merge any two rows or grant organiser to others.'
          : 'If you appear more than once, sign in on the calendar tab, then merge the duplicate here.')
        : '');
    const claiming = m.attendees.find((a) => a.id === state.claimingId);
    const showOrganiserCol = !isPicker && attendee?.is_organizer;
    const colCount = 5 + (showOrganiserCol ? 1 : 0);

    return `
      <section class="panel stack attendee-section">
        <h2 class="section-title">${title}</h2>
        ${hint ? `<p class="meta">${hint}</p>` : ''}
        <div class="table-wrap">
          <table class="data-table attendee-table">
            <thead><tr><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th>${showOrganiserCol ? '<th>Organiser</th>' : ''}<th></th></tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => renderAttendeeRow(m, state, attendee, a, { mode, showOrganiserCol })).join('') : `<tr><td colspan="${colCount}">No one has joined yet.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${claiming ? renderClaimPinForm(claiming) : ''}
        ${!isPicker && attendee?.is_organizer ? renderOrganiserMergePanel(m) : ''}
        ${isPicker && !attendee ? `
          <details class="register-block" open>
            <summary>Register as new attendee</summary>
            ${renderJoinForm()}
          </details>` : ''}
      </section>`;
  }

  function renderOrganiserMergePanel(m) {
    const opts = m.attendees.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(attendeeLabel(a))}</option>`).join('');
    return `
      <details class="merge-organiser-panel">
        <summary>Merge any two attendees (organiser)</summary>
        <form class="inline-form row" data-form="merge-organiser">
          <label>Keep <select name="keep_id" required>${opts}</select></label>
          <label>Remove <select name="remove_id" required>${opts}</select></label>
          <button type="submit">Merge</button>
        </form>
        <p class="meta">Combines availability and removes the second row. You do not need their PIN as organiser.</p>
      </details>`;
  }

  function renderAttendeeRow(m, state, current, a, { mode, showOrganiserCol }) {
    const isSelf = current?.id === a.id;
    const isPicker = mode === 'picker';
    const dupOfSelf = current && a.id !== current.id
      && a.display_name.trim().toLowerCase() === current.display_name.trim().toLowerCase();
    const pinBadge = a.has_pin ? '<span class="badge" title="PIN protected">PIN</span>' : '';
    const orgBadge = a.is_organizer ? '<span class="badge good">Org</span>' : '';
    const actions = [];

    if (isPicker) {
      if (!current || isSelf) {
        actions.push(`<button type="button" class="secondary compact-btn" data-action="claim-row" data-attendee-id="${escapeHtml(a.id)}">${isSelf ? 'You' : 'This is me'}</button>`);
      }
    } else if (current && a.id !== current.id && (dupOfSelf || current.is_organizer)) {
      actions.push(`<button type="button" class="secondary compact-btn" data-action="merge-into-me" data-remove-id="${escapeHtml(a.id)}">Merge into me</button>`);
    }

    const organiserCell = showOrganiserCol
      ? `<td><input type="checkbox" data-action="toggle-organizer" data-attendee-id="${escapeHtml(a.id)}" ${a.is_organizer ? 'checked' : ''} aria-label="Meeting organiser for ${escapeHtml(a.display_name)}"></td>`
      : '';

    return `<tr class="attendee-row${isSelf ? ' is-self' : ''}${isPicker && !current ? ' is-selectable' : ''}">
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
    return `<div class="attachment"><a href="${escapeHtml(att.url || '#')}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a></div>`;
  }

  async function handleSubmit(e, root, state) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = new FormData(form);
    try {
      let data;
      if (kind === 'join') {
        data = await apiPost({ action: 'join', slug: state.slug, display_name: fd.get('display_name'), contact: fd.get('contact'),
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
          pin: fd.get('pin') || undefined, attendee_id: state.attendeeId || undefined });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
      } else if (kind === 'claim') {
        data = await apiPost({ action: 'claim', slug: state.slug, attendee_id: fd.get('attendee_id'), pin: fd.get('pin') || undefined });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        state.claimingId = null;
      } else if (kind === 'update-settings') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, title: fd.get('title'),
          duration_minutes: Number(fd.get('duration_minutes')), slot_granularity_minutes: Number(fd.get('slot_granularity_minutes')),
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          timezone: String(fd.get('timezone') || '').trim() || tz,
          show_weekends: fd.get('show_weekends') === 'on',
          organizer_intro: fd.get('organizer_intro'), recurrence: buildRecurrenceFromForm(fd) });
      } else if (kind === 'update-meta') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes') });
      } else if (kind === 'add-location') {
        data = await apiPost({ action: 'add_location', slug: state.slug, label: fd.get('label'), kind: fd.get('kind'), detail: fd.get('detail') });
      } else if (kind === 'add-attachment') {
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type: fd.get('type'), url: fd.get('url'), body: fd.get('body') });
      } else if (kind === 'confirm') {
        data = await apiPost({ action: 'confirm', slug: state.slug, confirmed_slot: fd.get('confirmed_slot'), confirmed_location: fd.get('confirmed_location') });
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
      if (kind === 'join' || kind === 'claim') restoreAttendeeSelections(state);
      render(root, state);
      toast('Saved');
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
      const payload = { action: 'update_meta', slug: state.slug };
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
      return;
    }
    if (action === 'cancel-claim') {
      state.claimingId = null;
      render(root, state);
      return;
    }
    if (action === 'merge-into-me') {
      const removeId = btn.dataset.removeId;
      const target = state.meet.attendees.find((a) => a.id === removeId);
      let pin = '';
      if (target?.has_pin) {
        pin = window.prompt('Enter the PIN for the duplicate row you are merging away:') || '';
        if (!pin) return;
      } else if (!window.confirm('Merge this duplicate row into your attendee record? Their availability will be combined.')) {
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
        toast('Duplicate merged');
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
      insert = `<a href="${href}">${sel || 'link text'}</a>`;
    } else if (fmt === 'ul') insert = `<ul>\n<li>${sel || 'item'}</li>\n</ul>`;
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.focus();
  }

  function handleChange(e, root, state) {
    if (e.target.matches('[data-action="sort-order"]')) { state.sortOrder = e.target.value; render(root, state); return; }
    if (e.target.name === 'recurrence_type') {
      const extra = root.querySelector('#recurrence-extra');
      const showWeekends = root.querySelector('[name="show_weekends"]')?.checked ?? false;
      if (extra) extra.innerHTML = recurrenceExtraFields({ type: e.target.value }, showWeekends);
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
      return `
        <label>Date in the month <input type="number" name="day" value="${rec.day || 1}" min="1" max="31" required> (1–31)</label>
        <label>Repeat every <input type="number" name="interval" value="${rec.interval || 1}" min="1" max="24"> month(s)</label>
        <p class="meta">Example: the 19th of every month. Shorter months use the last day if needed.</p>`;
    }
    if (type === 'monthly_nth_weekday') {
      return `
        <label>Which in the month? ${nthSelect('nth', rec.nth ?? 3)}</label>
        <label>Day of the week ${weekdaySelect('weekday', rec.weekday ?? 1)}</label>
        <label>Repeat every <input type="number" name="interval" value="${rec.interval || 1}" min="1" max="24"> month(s)</label>
        <p class="meta">Example: 3rd + Monday + every 2 months = every second month’s third Monday. The first slot everyone agrees is the pattern for future meetings.</p>`;
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
