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
  
  loading: document.getElementById('loading'),
  progressList: document.getElementById('progress-list'),
  emptyState: document.getElementById('empty-state'),
  
  searchInput: document.getElementById('search-input'),
  filterBtns: document.querySelectorAll('.filter-btn')
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
  ui.userEmail.textContent = user.email.split('@')[0]; // neat shorten
  loadProgress();
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

  list.forEach(item => {
    const meta = item.media_metadata;
    const typeLabel = item.media_type === 'ANIME' ? 'EP' : 'CH';
    const badgeClass = item.media_type.toLowerCase();
    
    // Sort logic is implicitly "Recent" because Vercel returns `order by updated_at DESC`
    
    const li = document.createElement('li');
    li.className = 'progress-item';
    li.innerHTML = `
      <img src="${meta.cover_image_url || ''}" class="cover" alt="Cover" onerror="this.src='../icons/icon48.png'">
      <div class="item-details">
        <h4 class="item-title" title="${meta.canonical_title}">${meta.canonical_title}</h4>
        <p class="item-meta">
           <span class="badge ${badgeClass}">${item.media_type}</span>
           <span class="progress-text">${typeLabel} ${item.latest_chapter_episode}</span> 
           ${meta.total_episodes_chapters ? `<span style="opacity:0.5">/ ${meta.total_episodes_chapters}</span>` : ''}
        </p>
      </div>
      ${item.source_url ? `<a href="${item.source_url}" class="resume-btn" target="_blank">Resume →</a>` : ''}
    `;
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
    const user = isSignUp ? await signUp(email, pwd) : await signIn(email, pwd);
    showDashboard(user);
  } catch (err) {
    ui.authError.textContent = err.message;
    ui.authError.classList.remove('hidden');
  } finally {
    ui.authSubmitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
  }
});

ui.logoutBtn.addEventListener('click', async () => {
  await signOut();
  ui.emailInput.value = '';
  ui.pwdInput.value = '';
  showLogin();
});

document.addEventListener('DOMContentLoaded', checkAuth);
