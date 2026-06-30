import { isSupabaseConfigured } from '../supabase-config.js';
import { recoverOAuthRedirectFromSiteRoot } from './oauth-recover.js';
import { getSession, signInWithGoogle, signOut, onAuthStateChange, profileFromSession, applyAvatarImage } from './auth.js';
import { fetchDashboardEvents, deleteEvent } from './api.js';
import { APP_BASE, eventUrl, showToast, formatDbError, navigateToEvent, copyToClipboard, buildShareUrl } from './utils.js';
import { navigateToGuestPreview } from './guest-preview.js';
import { confirmAction } from './confirm-modal.js';
import { initChrome } from './theme.js';

const els = {
  configWarning: document.getElementById('config-warning'),
  signedOut: document.getElementById('signed-out'),
  signedIn: document.getElementById('signed-in'),
  googleBtn: document.getElementById('google-signin'),
  signoutBtn: document.getElementById('signout-btn'),
  createBtn: document.getElementById('create-event-btn'),
  userName: document.getElementById('user-name'),
  userAvatar: document.getElementById('user-avatar'),
  dashboard: document.getElementById('dashboard-list'),
};

let currentUserId = null;

function renderDashboard(events, userId) {
  if (!events.length) {
    els.dashboard.innerHTML = `
      <div class="empty-dashboard panel">
        <h2 class="empty-dashboard-title">No events yet</h2>
        <p class="muted empty-dashboard-lead">Create an event, share the link, and everyone marks when they're free.</p>
        <button type="button" id="empty-create-btn" class="btn btn-primary">Create your first event</button>
      </div>`;
    document.getElementById('empty-create-btn')?.addEventListener('click', () => {
      window.location.href = `${APP_BASE}/create.html`;
    });
    return;
  }

  els.dashboard.innerHTML = events
    .map((ev) => {
      const isOrganizer = ev.organizer_id === userId;
      const title = escapeHtml(ev.title);
      const slug = ev.slug || '';
      const slugAttr = escapeHtml(slug);
      const idAttr = escapeHtml(ev.id);

      if (isOrganizer) {
        return `
    <div class="dashboard-item panel dashboard-item--organizer">
      <div class="dashboard-item-main dashboard-item-main--static">
        <div>
          <strong>${title}</strong>
          <span class="muted">${escapeHtml(ev.start_date)} → ${escapeHtml(ev.end_date)}</span>
          <span class="dashboard-badge">Organizer</span>
        </div>
      </div>
      <div class="dashboard-view-actions">
        <button type="button" class="btn btn-ghost dashboard-view-admin" data-event-slug="${slugAttr}" data-event-id="${idAttr}">View as admin</button>
        <button type="button" class="btn btn-ghost dashboard-preview-guest" data-event-slug="${slugAttr}" data-event-id="${idAttr}">Preview as guest</button>
        <button type="button" class="btn btn-ghost dashboard-copy-link" data-event-slug="${slugAttr}">Copy link</button>
      </div>
      <div class="dashboard-item-actions">
        <button type="button" class="btn btn-ghost dashboard-delete" data-event-id="${idAttr}" data-event-title="${title}">Delete</button>
      </div>
    </div>`;
      }

      return `
    <div class="dashboard-item panel">
      <a class="dashboard-item-main" href="${slug ? eventUrl(slug) : `${APP_BASE}/event?id=${encodeURIComponent(ev.id)}`}" data-event-slug="${slugAttr}" data-event-id="${idAttr}">
        <div>
          <strong>${title}</strong>
          <span class="muted">${escapeHtml(ev.start_date)} → ${escapeHtml(ev.end_date)}</span>
        </div>
        <span class="chevron">→</span>
      </a>
    </div>`;
    })
    .join('');

  els.dashboard.querySelectorAll('a.dashboard-item-main').forEach((link) => {
    link.addEventListener('click', (e) => {
      const s = link.dataset.eventSlug;
      const id = link.dataset.eventId;
      if (!s && !id) return;
      e.preventDefault();
      navigateToEvent(s || null, s ? null : id);
    });
  });

  els.dashboard.querySelectorAll('.dashboard-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const eventId = btn.dataset.eventId;
      const eventTitle = btn.dataset.eventTitle || 'this event';
      const confirmed = await confirmAction({
        title: 'Delete event?',
        message: `${eventTitle} will be permanently removed along with everyone's availability. This cannot be undone.`,
        highlight: eventTitle,
        confirmLabel: 'Delete event',
        cancelLabel: 'Keep event',
      });
      if (!confirmed) return;
      btn.disabled = true;
      try {
        await deleteEvent(eventId);
        showToast('Event deleted');
        const session = await getSession();
        if (session) await refresh(session);
      } catch (err) {
        console.error(err);
        showToast(formatDbError(err), 'error');
        btn.disabled = false;
      }
    });
  });

  els.dashboard.querySelectorAll('.dashboard-view-admin').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const eventSlug = btn.dataset.eventSlug || null;
      const eventId = btn.dataset.eventId || null;
      navigateToEvent(eventSlug, eventSlug ? null : eventId);
    });
  });

  els.dashboard.querySelectorAll('.dashboard-preview-guest').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const eventSlug = btn.dataset.eventSlug || null;
      const eventId = btn.dataset.eventId || null;
      navigateToGuestPreview(eventSlug, eventSlug ? null : eventId);
    });
  });

  els.dashboard.querySelectorAll('.dashboard-copy-link').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const eventSlug = btn.dataset.eventSlug;
      if (!eventSlug) {
        showToast('No share link for this event', 'error');
        return;
      }
      const ok = await copyToClipboard(buildShareUrl(eventSlug));
      if (ok) showToast('Link copied');
      else showToast('Could not copy link', 'error');
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refresh(session) {
  if (!session) {
    els.signedOut.hidden = false;
    els.signedIn.hidden = true;
    currentUserId = null;
    return;
  }
  const profile = profileFromSession(session);
  currentUserId = profile.id;
  els.signedOut.hidden = true;
  els.signedIn.hidden = false;
  els.userName.textContent = profile.displayName;
  applyAvatarImage(els.userAvatar, profile.avatarUrl);

  try {
    const { all } = await fetchDashboardEvents(profile.id);
    renderDashboard(all, profile.id);
  } catch (err) {
    console.error(err);
    showToast('Could not load your events', 'error');
  }
}

function init() {
  initChrome();
  if (recoverOAuthRedirectFromSiteRoot()) return;

  if (!isSupabaseConfigured()) {
    els.configWarning.hidden = false;
    els.googleBtn.disabled = true;
    els.createBtn.disabled = true;
    return;
  }

  els.googleBtn?.addEventListener('click', async () => {
    try {
      await signInWithGoogle(`${APP_BASE}/index.html`);
    } catch (err) {
      showToast(err.message || 'Sign-in failed', 'error');
    }
  });

  els.signoutBtn?.addEventListener('click', async () => {
    await signOut();
  });

  els.createBtn?.addEventListener('click', () => {
    window.location.href = `${APP_BASE}/create.html`;
  });

  getSession().then(refresh);
  onAuthStateChange(refresh);
}

init();
