// auth.js and api.js are loaded via html script tags now

const ui = {
  authView: document.getElementById('auth-view'),
  dashboardView: document.getElementById('dashboard-view'),
  userInfo: document.getElementById('user-info'),
  userEmail: document.getElementById('user-email'),
  emailInput: document.getElementById('email'),
  pwdInput: document.getElementById('password'),
  authSubmitBtn: document.getElementById('auth-submit-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  authError: document.getElementById('auth-error'),
  authToggleLink: document.getElementById('auth-toggle-link'),
  authTitle: document.getElementById('auth-title'),
  authSubtitle: document.getElementById('auth-subtitle'),
  authSwitchText: document.getElementById('auth-switch-text'),
  anilistBtn: document.getElementById('anilist-btn'),
  anilistLoginBtn: document.getElementById('anilist-login-btn'),
  malBtn: document.getElementById('mal-btn'),

  loading: document.getElementById('loading'),
  progressList: document.getElementById('progress-list'),
  emptyState: document.getElementById('empty-state'),
  
  searchInput: document.getElementById('search-input'),
  filterBtns: document.querySelectorAll('.filter-btn'),

  statAnime: document.getElementById('stat-anime'),
  statManga: document.getElementById('stat-manga'),
  statEps: document.getElementById('stat-eps')
};

let isSignUp = false;
let globalDataSet = []; // Store the fetched array

async function checkAuth() {
  const session = await getSession(); // also checks token validity
  const token = await getAccessToken(); // Refreshes if needed
  if (token && session && session.user) {
    showDashboard(session.user);
  } else {
    showLogin();
  }
}

function showLogin() {
  ui.authView.classList.remove('hidden');
  ui.dashboardView.classList.add('hidden');
  ui.userInfo.classList.add('hidden');
}

function showDashboard(user) {
  ui.authView.classList.add('hidden');
  ui.dashboardView.classList.remove('hidden');
  ui.userInfo.classList.remove('hidden');
  ui.userEmail.textContent = user.email.split('@')[0];
  loadProgress();
  checkAniListStatus();
  checkMalStatus();
}

async function checkAniListStatus() {
  try {
    const { linked, username } = await getAniListStatus();
    if (linked) {
      ui.anilistBtn.classList.add('linked');
      ui.anilistBtn.title = `AniList: Connected as ${username}`;
    } else {
      ui.anilistBtn.classList.remove('linked');
      ui.anilistBtn.title = 'AniList: Not connected (click to link)';
    }
  } catch (e) {
    console.log('AniList status check failed (non-critical)');
  }
}

async function checkMalStatus() {
  try {
    const { linked, username } = await getMalStatus();
    if (linked) {
      ui.malBtn.classList.add('linked');
      ui.malBtn.title = `MyAnimeList: Connected as ${username}`;
    } else {
      ui.malBtn.classList.remove('linked');
      ui.malBtn.title = 'MyAnimeList: Not connected (click to link)';
    }
  } catch (e) {
    console.log('MAL status check failed (non-critical)');
  }
}

async function loadProgress() {
  ui.loading.classList.remove('hidden');
  ui.progressList.innerHTML = '';
  ui.emptyState.classList.add('hidden');

  try {
    globalDataSet = await getProgress(); // from Vercel API
    ui.loading.classList.add('hidden');
    renderList();
  } catch (err) {
    ui.loading.classList.add('hidden');
    console.error(err);
    if (err.message.includes('authenticated') || err.message.includes('token') || err.message.includes('JWT')) {
        signOut().then(showLogin);
    }
  }
}

function animateCount(el, target) {
  const duration = 500;
  const start = parseInt(el.textContent) || 0;
  const step = (timestamp) => {
    if (!step.startTime) step.startTime = timestamp;
    const progress = Math.min((timestamp - step.startTime) / duration, 1);
    el.textContent = Math.round(start + (target - start) * progress);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateStats() {
  const animeCount = globalDataSet.filter(i => i.media_type === 'ANIME').length;
  const mangaCount = globalDataSet.filter(i => i.media_type === 'MANGA').length;
  const totalEps = globalDataSet
    .filter(i => i.media_type === 'ANIME')
    .reduce((sum, i) => sum + (i.latest_chapter_episode || 0), 0);
  animateCount(ui.statAnime, animeCount);
  animateCount(ui.statManga, mangaCount);
  animateCount(ui.statEps, totalEps);
}

function formatAiringCountdown(airingAt) {
  if (!airingAt) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = airingAt - now;

  if (diff <= 0) {
    return { text: 'Airing now / soon', urgent: true };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);

  if (days > 0) {
    return { text: `${days}d ${hours}h`, urgent: false };
  } else if (hours > 0) {
    return { text: `${hours}h ${mins}m`, urgent: hours < 12 };
  } else {
    return { text: `${mins}m`, urgent: true };
  }
}

function updateAiringTimers() {
  document.querySelectorAll('.airing-badge[data-airing-at]').forEach(el => {
    const airingAt = parseInt(el.dataset.airingAt);
    const ep = el.dataset.ep;
    const cd = formatAiringCountdown(airingAt);
    if (cd) {
      const textEl = el.querySelector('.airing-text');
      if (textEl) textEl.textContent = `Ep ${ep} in ${cd.text}`;
      const pulseEl = el.querySelector('.airing-pulse');
      if (pulseEl) {
        if (cd.urgent) {
          pulseEl.classList.add('urgent');
          el.classList.add('urgent');
        } else {
          pulseEl.classList.remove('urgent');
          el.classList.remove('urgent');
        }
      }
    }
  });
}

function renderList() {
  const searchTerm = ui.searchInput.value.toLowerCase();
  const activeTab = document.querySelector('.filter-btn.active').dataset.filter;
  
  // Filter by search and type
  const list = globalDataSet.filter(item => {
     const meta = item.media_metadata;
     const title = meta?.canonical_title?.toLowerCase() || '';
     const matchType = activeTab === 'ALL' || item.media_type === activeTab;
     const matchTerm = title.includes(searchTerm);
     return matchType && matchTerm;
  });

  ui.progressList.innerHTML = '';
  if (!list || list.length === 0) {
    ui.emptyState.classList.remove('hidden');
    return;
  }
  
  ui.emptyState.classList.add('hidden');
  updateStats();

  list.forEach(item => {
    const meta = item.media_metadata;
    const typeLabel = item.media_type === 'ANIME' ? 'EP' : 'CH';
    const badgeClass = item.media_type.toLowerCase();
    
    // Airing countdown badge for ongoing anime (AniChart integration)
    let airingBadgeHtml = '';
    if (item.media_type === 'ANIME' && meta?.next_airing_at && meta?.next_airing_episode) {
      const cd = formatAiringCountdown(meta.next_airing_at);
      if (cd) {
        const urgentClass = cd.urgent ? ' urgent' : '';
        airingBadgeHtml = `
          <a href="https://anichart.net" target="_blank" class="airing-badge${urgentClass}" data-airing-at="${meta.next_airing_at}" data-ep="${meta.next_airing_episode}" title="Jadwal tayang AniChart (Klik untuk buka)">
            <span class="airing-pulse${urgentClass}"></span>
            <span class="airing-text">Ep ${meta.next_airing_episode} in ${cd.text}</span>
          </a>
        `;
      }
    } else if (item.media_type === 'ANIME' && meta?.status === 'RELEASING') {
      airingBadgeHtml = `
        <a href="https://anichart.net" target="_blank" class="airing-badge" title="Anime ongoing di AniChart">
          <span class="airing-pulse"></span>
          <span class="airing-text">Ongoing</span>
        </a>
      `;
    }

    const li = document.createElement('li');
    li.className = 'progress-item';
    li.innerHTML = `
      <img src="${meta?.cover_image_url || ''}" class="cover" alt="Cover">
      <div class="item-details">
        <h4 class="item-title" title="${meta?.canonical_title || ''}">${meta?.canonical_title || 'Unknown'}</h4>
        <p class="item-meta">
           <span class="badge ${badgeClass}">${item.media_type}</span>
           <span class="progress-text">${typeLabel} ${item.latest_chapter_episode}</span> 
           ${meta?.total_episodes_chapters ? `<span style="opacity:0.5">/ ${meta.total_episodes_chapters}</span>` : ''}
        </p>
        ${airingBadgeHtml}
      </div>
      <button class="delete-btn" data-id="${item.id}" title="Delete">&times;</button>
      ${item.source_url ? `<a href="${item.source_url}" class="resume-btn" target="_blank">Resume →</a>` : ''}
    `;

    // Fallback cover (CSP-safe, no inline onerror)
    const img = li.querySelector('.cover');
    img.addEventListener('error', () => { img.style.display = 'none'; });

    // Add delete functionality
    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.target;
        btn.innerHTML = '...';
        btn.disabled = true;
        try {
            await deleteProgress(item.id);
            globalDataSet = globalDataSet.filter(d => d.id !== item.id);
            renderList();
        } catch (err) {
            console.error("Delete failed", err);
            btn.innerHTML = '&times;';
            btn.disabled = false;
            alert("Failed to delete item: " + err.message);
        }
    });

    ui.progressList.appendChild(li);
  });
}

// DOM Setup
ui.searchInput.addEventListener('input', renderList);

ui.filterBtns.forEach(btn => {
   btn.addEventListener('click', (e) => {
      ui.filterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderList();
   });
});

ui.authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    ui.authTitle.textContent = isSignUp ? "Create Account" : "Welcome Back";
    ui.authSubtitle.textContent = isSignUp ? "Start syncing your anime and manga easily." : "Sign in to sync your library across devices.";
    ui.authSubmitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
    ui.authSwitchText.textContent = isSignUp ? "Already have an account?" : "Don't have an account?";
    ui.authToggleLink.textContent = isSignUp ? "Sign In" : "Sign Up";
    ui.authError.classList.add('hidden');
});

ui.authSubmitBtn.addEventListener('click', async () => {
  const email = ui.emailInput.value.trim();
  const pwd = ui.pwdInput.value;
  if (!email || !pwd) return;

  ui.authSubmitBtn.textContent = isSignUp ? "Creating Account..." : "Signing In...";
  ui.authError.classList.add('hidden');

  try {
    if (isSignUp) {
      await signUp(email, pwd);
      // After signup Supabase may require email confirm — checkAuth handles both cases
      await checkAuth();
    } else {
      const user = await signIn(email, pwd);
      showDashboard(user);
    }
  } catch (err) {
    ui.authError.textContent = err.message;
    ui.authError.classList.remove('hidden');
  } finally {
    ui.authSubmitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
  }
});

ui.anilistLoginBtn.addEventListener('click', () => {
  const url = 'https://api.farlabs.my.id/api/anilist-auth?mode=login';
  ui.anilistLoginBtn.disabled = true;
  ui.anilistLoginBtn.textContent = 'Opening AniList...';
  chrome.tabs.create({ url });
  // Popup will close when tab opens. Background worker detects callback URL,
  // reads session from page localStorage, and saves to chrome.storage.
  // Next time user opens popup, checkAuth() will find the session.
});

ui.logoutBtn.addEventListener('click', async () => {
  await signOut();
  ui.emailInput.value = '';
  ui.pwdInput.value = '';
  showLogin();
});

ui.anilistBtn.addEventListener('click', async () => {
  if (ui.anilistBtn.classList.contains('linked')) return; // already linked
  const session = await getSession();
  if (!session?.user?.id) return;
  const url = `https://api.farlabs.my.id/api/anilist-auth?user_id=${session.user.id}`;
  chrome.tabs.create({ url });
});

ui.malBtn.addEventListener('click', async () => {
  if (ui.malBtn.classList.contains('linked')) return; // already linked
  const session = await getSession();
  if (!session?.user?.id) return;
  const url = `https://api.farlabs.my.id/api/mal-auth?user_id=${session.user.id}`;
  chrome.tabs.create({ url });
});

document.addEventListener('DOMContentLoaded', checkAuth);
setInterval(updateAiringTimers, 60000);
