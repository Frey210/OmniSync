import { signIn, signOut, getSession } from '../utils/auth.js';
import { getProgress } from '../utils/api.js';

const ui = {
  authView: document.getElementById('auth-view'),
  dashboardView: document.getElementById('dashboard-view'),
  userInfo: document.getElementById('user-info'),
  userEmail: document.getElementById('user-email'),
  emailInput: document.getElementById('email'),
  pwdInput: document.getElementById('password'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  authError: document.getElementById('auth-error'),
  loading: document.getElementById('loading'),
  progressList: document.getElementById('progress-list'),
  emptyState: document.getElementById('empty-state'),
};

async function checkAuth() {
  const session = await getSession();
  if (session && session.user) {
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
  ui.userEmail.textContent = user.email;
  loadProgress();
}

async function loadProgress() {
  ui.loading.classList.remove('hidden');
  ui.progressList.innerHTML = '';
  ui.emptyState.classList.add('hidden');

  try {
    const list = await getProgress();
    ui.loading.classList.add('hidden');

    if (!list || list.length === 0) {
      ui.emptyState.classList.remove('hidden');
      return;
    }

    list.forEach(item => {
      const meta = item.media_metadata;
      const typeLabel = item.media_type === 'ANIME' ? 'EP' : 'CH';
      const badgeClass = item.media_type.toLowerCase();
      
      const li = document.createElement('li');
      li.className = 'progress-item';
      li.innerHTML = `
        <img src="${meta.cover_image_url || ''}" class="cover" alt="Cover" onerror="this.src='../icons/icon48.png'">
        <div class="item-details">
          <h4 class="item-title" title="${meta.canonical_title}">${meta.canonical_title}</h4>
          <p class="item-meta">
             <span class="badge ${badgeClass}">${item.media_type}</span>
             ${typeLabel} ${item.latest_chapter_episode} 
             ${meta.total_episodes_chapters ? `/ ${meta.total_episodes_chapters}` : ''}
          </p>
        </div>
        ${item.source_url ? `<a href="${item.source_url}" class="resume-btn" target="_blank">Resume</a>` : ''}
      `;
      ui.progressList.appendChild(li);
    });

  } catch (err) {
    ui.loading.classList.add('hidden');
    console.error(err);
    if (err.message.includes('authenticated') || err.message.includes('token')) {
        signOut().then(showLogin);
    }
  }
}

ui.loginBtn.addEventListener('click', async () => {
  const email = ui.emailInput.value.trim();
  const pwd = ui.pwdInput.value;
  if (!email || !pwd) return;

  ui.loginBtn.textContent = "Signing In...";
  ui.authError.classList.add('hidden');

  try {
    const user = await signIn(email, pwd);
    showDashboard(user);
  } catch (err) {
    ui.authError.textContent = err.message;
    ui.authError.classList.remove('hidden');
  } finally {
    ui.loginBtn.textContent = "Sign In";
  }
});

ui.logoutBtn.addEventListener('click', async () => {
  await signOut();
  ui.emailInput.value = '';
  ui.pwdInput.value = '';
  showLogin();
});

// Init
document.addEventListener('DOMContentLoaded', checkAuth);
