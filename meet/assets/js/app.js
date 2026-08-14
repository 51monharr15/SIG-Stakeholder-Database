(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const page = document.body.dataset.page;

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  function initHome() {
    const form = document.getElementById('create-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const slug = slugify(data.get('slug'));
      const title = String(data.get('title') || '').trim();
      try {
        await apiPost({ action: 'create', slug, title });
        window.location.href = `./?${encodeURIComponent(slug)}`;
      } catch (err) {
        alert(err.message);
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
      weekStart: startOfWeek(new Date()),
    };

    try {
      state.meet = await fetchMeet(slug);
      restoreAttendeeSelections(state);
      render(root, state);
    } catch (err) {
      root.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }

    root.addEventListener('click', (e) => handleClick(e, root, state));
    root.addEventListener('change', (e) => handleChange(e, root, state));
    root.addEventListener('submit', (e) => handleSubmit(e, root, state));
  }

  function attendeeKey(slug) {
    return `meet_attendee_${slug}`;
  }

  function slotsKey(slug, attendeeId) {
    return `meet_slots_${slug}_${attendeeId}`;
  }

  function restoreAttendeeSelections(state) {
    if (!state.attendeeId) return;
    const saved = localStorage.getItem(slotsKey(state.slug, state.attendeeId));
    if (saved) {
      try {
        JSON.parse(saved).forEach((s) => state.selectedSlots.add(s));
      } catch (_) {}
    }
    const prefs = state.meet.location_preferences[state.attendeeId] || [];
    prefs.forEach((id) => state.selectedLocations.add(id));
  }

  async function fetchMeet(slug) {
    const res = await fetch(`api.php?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load meeting');
    return data.meet;
  }

  async function apiPost(body) {
    const res = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function render(root, state) {
    const m = state.meet;
    const attendee = m.attendees.find((a) => a.id === state.attendeeId);
    const days = buildWeekDays(state.weekStart);
    const hours = buildHours(8, 20, m.slot_granularity_minutes);
    const recurringSet = new Set(m.recurrence_dates || []);

    root.innerHTML = `
      <div class="app-grid">
        <section class="panel stack">
          <div class="row" style="justify-content:space-between">
            <div>
              <h1 style="margin:0">${escapeHtml(m.title)}</h1>
              <p class="meta">ID: <code>${escapeHtml(m.id)}</code> · Times shown in <strong>${escapeHtml(tz)}</strong></p>
            </div>
            ${m.confirmed_slot ? `<span class="badge good">Confirmed</span>` : ''}
          </div>

          ${m.confirmed_slot ? `
            <div class="confirmed">
              <strong>Confirmed time:</strong> ${escapeHtml(formatSlotLocal(m.confirmed_slot))}
              ${m.confirmed_location ? `<br><strong>Location:</strong> ${escapeHtml(locationLabel(m, m.confirmed_location))}` : ''}
            </div>
          ` : ''}

          <div class="row">
            <span class="badge">${escapeHtml(m.recurrence_label)}</span>
            <span class="meta">${escapeHtml(m.range_start)} → ${escapeHtml(m.range_end)} · ${m.duration_minutes} min slots</span>
          </div>

          ${!attendee ? renderJoinForm() : `
            <p class="meta">Signed in as <strong>${escapeHtml(attendee.display_name)}</strong>
              <button type="button" class="secondary" data-action="switch-user">Switch</button>
            </p>
          `}

          <div class="calendar-wrap">
            <div class="row" style="justify-content:space-between;margin-bottom:.5rem">
              <button type="button" class="secondary" data-action="prev-week">← Previous week</button>
              <strong>${formatWeekLabel(state.weekStart)}</strong>
              <button type="button" class="secondary" data-action="next-week">Next week →</button>
            </div>
            <div class="calendar">
              <div class="cal-header">
                <div></div>
                ${days.map((d) => {
                  const iso = toDateIso(d);
                  const rec = recurringSet.has(iso);
                  return `<div class="day-head${rec ? ' recurring' : ''}">${formatDayHead(d)}${rec ? '<br><small>recurring</small>' : ''}</div>`;
                }).join('')}
              </div>
              <div class="cal-body">
                ${hours.map((hour) => `
                  <div class="time-label">${formatHour(hour)}</div>
                  ${days.map((day) => {
                    const slotIso = slotIsoFromLocal(day, hour, m.slot_granularity_minutes);
                    const count = (m.availability[slotIso] || []).length;
                    const selected = state.selectedSlots.has(slotIso);
                    const suggested = count > 0;
                    const names = (m.availability[slotIso] || [])
                      .map((id) => m.attendees.find((a) => a.id === id)?.display_name || id)
                      .join(', ');
                    return `<button type="button" class="slot${selected ? ' selected' : ''}${suggested ? ' suggested' : ''}"
                      data-action="toggle-slot" data-slot="${escapeHtml(slotIso)}"
                      title="${escapeHtml(names || 'No one yet')}" ${attendee ? '' : 'disabled'}>
                      ${count ? `<span class="count">${count}</span>` : ''}
                    </button>`;
                  }).join('')}
                `).join('')}
              </div>
            </div>
          </div>

          ${attendee ? `
            <div class="row">
              <button type="button" data-action="save-availability">Save my availability</button>
              <span class="meta">${state.selectedSlots.size} slot(s) selected</span>
            </div>
          ` : ''}
        </section>

        <aside class="stack">
          <section class="panel">
            <h2 class="section-title">Suggested times</h2>
            <p class="meta">Based on overlaps so far. You can pick any slot — not limited to these.</p>
            <div class="suggestions">
              ${(m.suggestions.slots.length ? m.suggestions.slots : []).map((s) => `
                <div class="suggestion" data-action="jump-slot" data-slot="${escapeHtml(s.slot)}">
                  <strong>${escapeHtml(formatSlotLocal(s.slot))}</strong>
                  <span class="meta">${s.count} attendee(s): ${escapeHtml(s.attendees.map(id => attendeeName(m, id)).join(', '))}</span>
                </div>
              `).join('') || '<p class="meta">No suggestions yet — be the first to add availability.</p>'}
            </div>
          </section>

          <section class="panel stack">
            <h2 class="section-title">Locations</h2>
            <div class="chip-list" id="location-chips">
              ${m.locations.map((loc) => `
                <button type="button" class="chip${state.selectedLocations.has(loc.id) ? ' active' : ''}"
                  data-action="toggle-location" data-location="${escapeHtml(loc.id)}">
                  ${escapeHtml(loc.label)} <small>(${escapeHtml(loc.kind)})</small>
                </button>
              `).join('') || '<p class="meta">No locations proposed yet.</p>'}
            </div>
            ${attendee ? `
              <button type="button" class="secondary" data-action="save-locations">Save location preferences</button>
            ` : ''}
            <details>
              <summary>Propose a location</summary>
              <form class="inline-form" data-form="add-location">
                <input name="label" placeholder="e.g. Zoom, Room 4B" required>
                <select name="kind">
                  <option value="video">Video</option>
                  <option value="physical">Physical</option>
                  <option value="phone">Phone</option>
                  <option value="other">Other</option>
                </select>
                <input name="detail" placeholder="URL, address, or dial-in">
                <button type="submit">Add location</button>
              </form>
            </details>
            ${m.suggestions.locations.length ? `
              <p class="meta">Popular: ${m.suggestions.locations.map((l) => `${escapeHtml(l.label)} (${l.count})`).join(', ')}</p>
            ` : ''}
          </section>

          <section class="panel stack">
            <h2 class="section-title">Agenda & decisions</h2>
            ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
            ${m.decisions.length ? `<p><strong>Decisions needed</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
            <details>
              <summary>Edit agenda / decisions</summary>
              <form class="inline-form" data-form="update-meta">
                <label>Agenda (one item per line)<textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
                <label>Decisions needed<textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
                <label>Notes<textarea name="notes" rows="2">${escapeHtml(m.notes || '')}</textarea></label>
                <button type="submit">Save</button>
              </form>
            </details>
          </section>

          <section class="panel stack">
            <h2 class="section-title">AI / transcripts / recordings</h2>
            ${m.attachments.length ? m.attachments.map(renderAttachment).join('') : '<p class="meta">Nothing attached yet.</p>'}
            <details>
              <summary>Add attachment</summary>
              <form class="inline-form" data-form="add-attachment">
                <input name="label" placeholder="Label" required>
                <select name="type">
                  <option value="url">URL (recording, transcript service)</option>
                  <option value="text">Text (AI summary)</option>
                </select>
                <input name="url" placeholder="https://...">
                <textarea name="body" rows="3" placeholder="Paste AI summary text"></textarea>
                <button type="submit">Attach</button>
              </form>
            </details>
          </section>

          <section class="panel stack">
            <h2 class="section-title">Organizer settings</h2>
            <details>
              <summary>Recurrence & date range</summary>
              <form class="inline-form" data-form="update-settings">
                <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
                <label>Range start<input type="date" name="range_start" value="${escapeHtml(m.range_start)}"></label>
                <label>Range end<input type="date" name="range_end" value="${escapeHtml(m.range_end)}"></label>
                <label>Duration (minutes)<input type="number" name="duration_minutes" value="${m.duration_minutes}" min="15" step="15"></label>
                <label>Recurrence type
                  <select name="recurrence_type">
                    ${recurrenceOptions(m.recurrence.type)}
                  </select>
                </label>
                <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence)}</div>
                <button type="submit">Save settings</button>
              </form>
            </details>
            <details>
              <summary>Confirm final time & location</summary>
              <form class="inline-form" data-form="confirm">
                <label>Slot (ISO)<input name="confirmed_slot" value="${escapeHtml(m.confirmed_slot || '')}" placeholder="auto-filled when you click a suggestion"></label>
                <label>Location
                  <select name="confirmed_location">
                    <option value="">—</option>
                    ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
                  </select>
                </label>
                <button type="submit">Confirm meeting</button>
              </form>
            </details>
            <p class="meta">Share link: <code>${escapeHtml(shareUrl(state.slug))}</code></p>
          </section>
        </aside>
      </div>
      <div class="toast" id="toast"></div>
    `;
  }

  function renderJoinForm() {
    return `
      <form class="inline-form" data-form="join">
        <label>Your name or ID
          <input name="display_name" required placeholder="Alice or alice@org">
        </label>
        <label>Optional alias (shown only to you)
          <input name="alias" placeholder="How you want to be remembered">
        </label>
        <button type="submit">Join this meeting</button>
      </form>
    `;
  }

  function renderAttachment(att) {
    if (att.type === 'text') {
      return `<div><strong>${escapeHtml(att.label)}</strong><pre style="white-space:pre-wrap;font-size:.85rem">${escapeHtml(att.body || '')}</pre></div>`;
    }
    return `<div><a href="${escapeHtml(att.url || '#')}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a></div>`;
  }

  function recurrenceOptions(current) {
    const types = [
      ['none', 'One-off'],
      ['weekly', 'Weekly'],
      ['monthly_day', 'Day of month (e.g. 19th)'],
      ['monthly_nth_weekday', 'Nth weekday (e.g. 3rd Monday)'],
      ['friday_13th', 'Every Friday the 13th'],
    ];
    return types.map(([v, label]) => `<option value="${v}"${v === current ? ' selected' : ''}>${label}</option>`).join('');
  }

  function recurrenceExtraFields(rec) {
    const type = rec.type || 'none';
    if (type === 'weekly') {
      return `
        <label>Every N weeks<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label>
        <label>Weekdays (0=Sun … 6=Sat, comma-separated)<input name="weekdays" value="${(rec.weekdays || [1]).join(',')}"></label>
      `;
    }
    if (type === 'monthly_day') {
      return `
        <label>Day of month<input type="number" name="day" value="${rec.day || 1}" min="1" max="31"></label>
        <label>Every N months<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label>
      `;
    }
    if (type === 'monthly_nth_weekday') {
      return `
        <label>Nth (1-5, or -1 for last)<input type="number" name="nth" value="${rec.nth || 3}"></label>
        <label>Weekday (0=Sun … 6=Sat)<input type="number" name="weekday" value="${rec.weekday ?? 1}" min="0" max="6"></label>
        <label>Every N months<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label>
      `;
    }
    return '<p class="meta">No extra fields for this recurrence type.</p>';
  }

  async function handleSubmit(e, root, state) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = new FormData(form);

    try {
      if (kind === 'join') {
        const data = await apiPost({
          action: 'join',
          slug: state.slug,
          display_name: fd.get('display_name'),
          alias: fd.get('alias'),
          attendee_id: state.attendeeId || undefined,
        });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
        state.meet = data.meet;
        restoreAttendeeSelections(state);
      } else if (kind === 'add-location') {
        const data = await apiPost({
          action: 'add_location',
          slug: state.slug,
          label: fd.get('label'),
          kind: fd.get('kind'),
          detail: fd.get('detail'),
        });
        state.meet = data.meet;
      } else if (kind === 'update-meta') {
        const data = await apiPost({
          action: 'update_meta',
          slug: state.slug,
          agenda: String(fd.get('agenda') || '').split('\n').map((s) => s.trim()).filter(Boolean),
          decisions: String(fd.get('decisions') || '').split('\n').map((s) => s.trim()).filter(Boolean),
          notes: fd.get('notes'),
        });
        state.meet = data.meet;
      } else if (kind === 'update-settings') {
        const recurrence = buildRecurrenceFromForm(fd);
        const data = await apiPost({
          action: 'update_meta',
          slug: state.slug,
          title: fd.get('title'),
          range_start: fd.get('range_start'),
          range_end: fd.get('range_end'),
          duration_minutes: Number(fd.get('duration_minutes')),
          recurrence,
        });
        state.meet = data.meet;
      } else if (kind === 'add-attachment') {
        const type = fd.get('type');
        const data = await apiPost({
          action: 'add_attachment',
          slug: state.slug,
          label: fd.get('label'),
          type,
          url: fd.get('url'),
          body: fd.get('body'),
        });
        state.meet = data.meet;
      } else if (kind === 'confirm') {
        const data = await apiPost({
          action: 'confirm',
          slug: state.slug,
          confirmed_slot: fd.get('confirmed_slot'),
          confirmed_location: fd.get('confirmed_location'),
        });
        state.meet = data.meet;
      }
      render(root, state);
      toast('Saved');
    } catch (err) {
      toast(err.message, true);
    }
  }

  function buildRecurrenceFromForm(fd) {
    const type = fd.get('recurrence_type');
    const base = { type };
    if (type === 'weekly') {
      base.interval = Number(fd.get('interval') || 1);
      base.weekdays = String(fd.get('weekdays') || '1').split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    } else if (type === 'monthly_day') {
      base.day = Number(fd.get('day') || 1);
      base.interval = Number(fd.get('interval') || 1);
    } else if (type === 'monthly_nth_weekday') {
      base.nth = Number(fd.get('nth') || 3);
      base.weekday = Number(fd.get('weekday') ?? 1);
      base.interval = Number(fd.get('interval') || 1);
    }
    return base;
  }

  async function handleClick(e, root, state) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle-slot') {
      const slot = btn.dataset.slot;
      if (state.selectedSlots.has(slot)) state.selectedSlots.delete(slot);
      else state.selectedSlots.add(slot);
      render(root, state);
      return;
    }

    if (action === 'toggle-location') {
      const id = btn.dataset.location;
      if (state.selectedLocations.has(id)) state.selectedLocations.delete(id);
      else state.selectedLocations.add(id);
      render(root, state);
      return;
    }

    if (action === 'prev-week') {
      state.weekStart = addDays(state.weekStart, -7);
      render(root, state);
      return;
    }

    if (action === 'next-week') {
      state.weekStart = addDays(state.weekStart, 7);
      render(root, state);
      return;
    }

    if (action === 'jump-slot') {
      const slot = btn.dataset.slot;
      const d = new Date(slot);
      state.weekStart = startOfWeek(d);
      state.selectedSlots.add(slot);
      render(root, state);
      return;
    }

    if (action === 'switch-user') {
      state.attendeeId = '';
      localStorage.removeItem(attendeeKey(state.slug));
      state.selectedSlots.clear();
      state.selectedLocations.clear();
      render(root, state);
      return;
    }

    if (action === 'save-availability') {
      try {
        const data = await apiPost({
          action: 'save_availability',
          slug: state.slug,
          attendee_id: state.attendeeId,
          slots: [...state.selectedSlots],
        });
        localStorage.setItem(slotsKey(state.slug, state.attendeeId), JSON.stringify([...state.selectedSlots]));
        state.meet = data.meet;
        render(root, state);
        toast('Availability saved');
      } catch (err) {
        toast(err.message, true);
      }
      return;
    }

    if (action === 'save-locations') {
      try {
        const data = await apiPost({
          action: 'save_location_prefs',
          slug: state.slug,
          attendee_id: state.attendeeId,
          location_ids: [...state.selectedLocations],
        });
        state.meet = data.meet;
        render(root, state);
        toast('Location preferences saved');
      } catch (err) {
        toast(err.message, true);
      }
    }
  }

  function handleChange(e, root, state) {
    if (e.target.name === 'recurrence_type') {
      const extra = root.querySelector('#recurrence-extra');
      if (extra) {
        extra.innerHTML = recurrenceExtraFields({ type: e.target.value });
      }
    }
  }

  function buildWeekDays(weekStart) {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }

  function buildHours(startHour, endHour, granularity) {
    const slots = [];
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += granularity) {
        slots.push({ hour: h, minute: m });
      }
    }
    return slots;
  }

  function slotIsoFromLocal(day, hm, granularity) {
    const d = new Date(day);
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toISOString();
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toDateIso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDayHead(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatWeekLabel(weekStart) {
    const end = addDays(weekStart, 6);
    return `${weekStart.toLocaleDateString()} – ${end.toLocaleDateString()}`;
  }

  function formatHour(hm) {
    const d = new Date();
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatSlotLocal(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function attendeeName(m, id) {
    return m.attendees.find((a) => a.id === id)?.display_name || id;
  }

  function locationLabel(m, id) {
    return m.locations.find((l) => l.id === id)?.label || id;
  }

  function shareUrl(slug) {
    const base = window.location.pathname.replace(/\/$/, '');
    return `${window.location.origin}${base}/?${encodeURIComponent(slug)}`;
  }

  function slugify(value) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meet';
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

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
