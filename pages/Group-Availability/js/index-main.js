import { isSupabaseConfigured } from '../supabase-config.js';
import { recoverOAuthRedirectFromSiteRoot } from './oauth-recover.js';
import { getSession, signInWithGoogle, signOut, onAuthStateChange, profileFromSession, applyAvatarImage } from './auth.js';
import { fetchDashboardEvents, deleteEvent } from './api.js';
import { APP_BASE, eventUrl, showToast, formatDbError, navigateToEvent } from './utils.js';
import { confirmAction } from './confirm-modal.js';

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
    els.dashboard.innerHTML = '<p class="muted">No events yet. Create one to get started.</p>';
    return;
  }

  els.dashboard.innerHTML = events
    .map((ev) => {
      const isOrganizer = ev.organizer_id === userId;
      const title = escapeHtml(ev.title);
      const slug = ev.slug || '';
      return `
    <div class="dashboard-item glass-card">
      <a class="dashboard-item-main" href="${slug ? eventUrl(slug) : `${APP_BASE}/event?id=${encodeURIComponent(ev.id)}`}" data-event-slug="${escapeHtml(slug)}" data-event-id="${escapeHtml(ev.id)}">
        <div>
          <strong>${title}</strong>
          <span class="muted">${escapeHtml(ev.start_date)} → ${escapeHtml(ev.end_date)}</span>
          ${isOrganizer ? '<span class="dashboard-badge">Organizer</span>' : ''}
        </div>
        <span class="chevron">→</span>
      </a>
      ${
        isOrganizer
          ? `<button type="button" class="btn btn-ghost dashboard-delete" data-event-id="${escapeHtml(ev.id)}" data-event-title="${title}">Delete</button>`
          : ''
      }
    </div>`;
    })
    .join('');

  els.dashboard.querySelectorAll('.dashboard-item-main').forEach((link) => {
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
