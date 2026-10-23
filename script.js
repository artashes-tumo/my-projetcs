// script.js
const GITHUB_USERNAME = 'artashes-tumo';

// GitHub's API allows cross-origin requests from browsers, so no proxy is needed
const API_URL = `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&sort=created`;

const PAGES_BASE = `https://${GITHUB_USERNAME}.github.io/`;
let allRepos = [];

// Theme toggle
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-toggle').textContent = savedTheme === 'dark' ? 'Light Mode' : 'Dark Mode';

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  document.getElementById('theme-toggle').textContent = newTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
});

// Visitor counter placeholder (needs an external counter service for real numbers)
document.getElementById('visitor-count').textContent = 'Many';

// Back to top
const backToTop = document.getElementById('back-to-top');
window.addEventListener('scroll', () => backToTop.classList.toggle('visible', window.scrollY > 500));
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

async function fetchRepos() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      if (response.status === 403) throw new Error('GitHub rate limit reached (60 requests/hour). Try again later.');
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const repos = await response.json();

    const checks = repos.map(async repo => {
      if (repo.fork) return null;
      const pagesLink = await checkPages(repo.name);
      return { repo, pagesLink };
    });

    const results = await Promise.all(checks);
    allRepos = results.filter(Boolean);

    displayRepos(allRepos);
    updateStats(allRepos);
    setupSearchAndFilters();
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById("repo-container").innerHTML = `
      <div class="loading" style="color:#ff6b6b; text-align:center; padding:80px;">
        <h3>Failed to load projects</h3>
        <p>${err.message}</p>
        <small>Or visit <a href="https://github.com/${GITHUB_USERNAME}?tab=repositories" target="_blank" style="color:#79c8ff;">GitHub directly</a></small>
      </div>`;
  }
}

async function checkPages(name) {
  try {
    const res = await fetch(`${PAGES_BASE}${name}/`, { method: "HEAD" });
    return res.ok ? `${PAGES_BASE}${name}/` : null;
  } catch { return null; }
}

function toTitleCase(str) {
  return str.replace(/-/g, ' ').replace(/_/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

const LANG_COLORS = {
  javascript: '#f1e05a', typescript: '#2b7489', html: '#e34c26', css: '#563d7c',
  python: '#3572A5', java: '#b07219', rust: '#dea584', go: '#00ADD8',
  react: '#61dafb', vue: '#41b883', svelte: '#ff3e00', default: '#8b8b8b'
};

// Badges are cached so searching/filtering doesn't re-request GitHub
const badgeCache = {};

async function getLanguageBadge(repo) {
  if (!repo.language) return '';
  if (badgeCache[repo.name]) return badgeCache[repo.name];
  let html;
  try {
    const res = await fetch(repo.languages_url);
    if (!res.ok) throw new Error('Lang fetch failed');
    const langData = await res.json();
    const total = Object.values(langData).reduce((a, b) => a + b, 0);
    const [[lang, bytes]] = Object.entries(langData).sort(([, a], [, b]) => b - a);
    const percent = Math.round((bytes / total) * 100);
    const color = LANG_COLORS[lang.toLowerCase()] || LANG_COLORS.default;
    html = `<div class="lang-badge" style="--lang-color:${color};--percent:${percent}%">
      <span class="lang-name">${lang}</span>
      <span class="lang-percent">${percent}%</span>
      <div class="lang-bar"><div class="lang-fill"></div></div>
    </div>`;
  } catch {
    const color = LANG_COLORS[repo.language.toLowerCase()] || LANG_COLORS.default;
    html = `<div class="lang-badge simple" style="--lang-color:${color}">
      <span class="lang-name">${repo.language}</span>
    </div>`;
  }
  return (badgeCache[repo.name] = html);
}

async function repoCardHtml(item) {
  const { repo, pagesLink } = item;
  const badge = await getLanguageBadge(repo);
  return `
    <article class="repo-card" data-name="${repo.name}" data-lang="${repo.language || ''}">
      <div class="card-header">
        <h2>${toTitleCase(repo.name)}</h2>
        <button class="copy-btn" title="Copy GitHub link">Copy</button>
        ${badge}
      </div>
      <p>${repo.description || "No description."}</p>
      <div class="links">
        <a href="${repo.html_url}" target="_blank">GitHub Repo</a>
        ${pagesLink ? `<a class="pages-link" href="${pagesLink}" target="_blank">Live Demo</a>` : ""}
      </div>
    </article>
  `;
}

// Tracks the latest render so fast typing can't show stale results
let renderId = 0;

async function displayRepos(items) {
  const container = document.getElementById("repo-container");
  const id = ++renderId;
  if (!items.length) {
    container.innerHTML = "<div class='loading'>No projects match your search.</div>";
    return;
  }
  const html = await Promise.all(items.map(repoCardHtml));
  if (id !== renderId) return;
  container.innerHTML = html.join('');
  container.querySelectorAll('.repo-card').forEach((c, i) => c.style.animationDelay = `${i * 0.08}s`);
}

function updateStats(repos) {
  const live = repos.filter(r => r.pagesLink).length;
  const languages = new Set(repos.map(r => r.repo.language).filter(Boolean)).size;
  document.getElementById('total-projects').textContent = repos.length;
  document.getElementById('live-projects').textContent = live;
  document.getElementById('total-languages').textContent = languages;
}

function setupSearchAndFilters() {
  const search = document.getElementById('search');
  const apply = () => {
    let list = [...allRepos];
    const q = search.value.toLowerCase().trim();
    if (q) list = list.filter(i =>
      i.repo.name.toLowerCase().includes(q) ||
      (i.repo.description || '').toLowerCase().includes(q) ||
      (i.repo.language || '').toLowerCase().includes(q)
    );
    const filter = document.querySelector('[data-filter].active')?.dataset.filter;
    if (filter === 'with-pages') list = list.filter(i => i.pagesLink);
    const sort = document.querySelector('[data-sort].active')?.dataset.sort;
    if (sort === 'newest') list.sort((a, b) => new Date(b.repo.created_at) - new Date(a.repo.created_at));
    if (sort === 'oldest') list.sort((a, b) => new Date(a.repo.created_at) - new Date(b.repo.created_at));
    displayRepos(list);
  };
  search.addEventListener('input', apply);
  document.querySelector('.filter-controls').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    // Sort and filter buttons are separate groups, so one doesn't cancel the other
    const group = btn.dataset.sort ? '[data-sort]' : '[data-filter]';
    document.querySelectorAll(group).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    apply();
  });
}

// Copy link
document.addEventListener('click', async e => {
  if (e.target.classList.contains('copy-btn')) {
    const url = e.target.closest('.repo-card').querySelector('a').href;
    await navigator.clipboard.writeText(url);
    e.target.classList.add('copy-success');
    setTimeout(() => e.target.classList.remove('copy-success'), 2000);
  }
});

document.addEventListener("DOMContentLoaded", fetchRepos);