<template>
  <div class="shell">
    <aside class="sidebar">
      <BrandLogo variant="nav" />
      <nav class="nav">
        <RouterLink class="nav-home" to="/">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke-linejoin="round" />
            </svg>
          </span>
          Сегодня
        </RouterLink>
        <RouterLink to="/calendar">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M8 3.5v3M16 3.5v3M3.5 10h17" stroke-linecap="round" />
            </svg>
          </span>
          Календарь
        </RouterLink>
        <RouterLink to="/purchases">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M6 6h15l-1.4 8.4a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.5L5 4H3" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          Покупки
        </RouterLink>
        <RouterLink to="/chat">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3v-3.2A2.5 2.5 0 0 1 5 13.5v-7Z" stroke-linejoin="round" />
            </svg>
          </span>
          Чат
        </RouterLink>
        <div class="nav-divider" />
        <p class="nav-label">Ещё</p>
        <RouterLink to="/tasks">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M8 9.5h8M8 13h5" stroke-linecap="round" />
            </svg>
          </span>
          {{ auth.isAdult ? "Дела" : "Мои дела" }}
        </RouterLink>
        <RouterLink to="/documents">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M7 4.5h7.5L18.5 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
              <path d="M14.5 4.5V9h4.5" />
            </svg>
          </span>
          {{ auth.isAdult ? "Документы" : "Мои документы" }}
        </RouterLink>
        <RouterLink to="/health">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M9 3.5h6v5.5h5.5v6H15V21H9v-6H3.5V9H9V3.5Z" stroke-linejoin="round" />
            </svg>
          </span>
          {{ auth.isAdult ? "Здоровье" : "Моё здоровье" }}
        </RouterLink>
        <template v-if="auth.isAdult">
          <RouterLink to="/family">
            <span class="nav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="9" cy="8" r="3" />
                <circle cx="16.5" cy="9.5" r="2.5" />
                <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5" stroke-linecap="round" />
                <path d="M14 14.2c1.5-.5 3.2-.3 4.8 1.3.6.6 1 1.4 1.2 2.5" stroke-linecap="round" />
              </svg>
            </span>
            Настройка семьи
          </RouterLink>
        </template>
        <RouterLink to="/profile">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5 19.5c1.2-3.2 3.5-4.8 7-4.8s5.8 1.6 7 4.8" stroke-linecap="round" />
            </svg>
          </span>
          Профиль
        </RouterLink>
      </nav>
    </aside>

    <div class="main">
      <RouterView />
    </div>

    <nav class="tabbar" aria-label="Основное меню">
      <RouterLink class="nav-home" to="/">
        <span class="tab-pill">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke-linejoin="round" />
            </svg>
          </span>
          Сегодня
        </span>
      </RouterLink>
      <RouterLink to="/calendar">
        <span class="tab-pill">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M8 3.5v3M16 3.5v3M3.5 10h17" stroke-linecap="round" />
            </svg>
          </span>
          Календарь
        </span>
      </RouterLink>
      <RouterLink to="/purchases">
        <span class="tab-pill">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M6 6h15l-1.4 8.4a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.5L5 4H3" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          Покупки
        </span>
      </RouterLink>
      <RouterLink to="/chat">
        <span class="tab-pill">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3v-3.2A2.5 2.5 0 0 1 5 13.5v-7Z" stroke-linejoin="round" />
            </svg>
          </span>
          Чат
        </span>
      </RouterLink>
      <button type="button" :class="{ active: moreOpen }" @click="moreOpen = !moreOpen">
        <span class="tab-pill">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </span>
          Ещё
        </span>
      </button>
    </nav>

    <div v-if="moreOpen" class="sheet" @click.self="moreOpen = false">
      <div class="card sheet-card">
        <p class="sheet-title">Ещё</p>
        <RouterLink to="/tasks" @click="moreOpen = false">
          {{ auth.isAdult ? "Дела" : "Мои дела" }}
        </RouterLink>
        <RouterLink to="/documents" @click="moreOpen = false">
          {{ auth.isAdult ? "Документы" : "Мои документы" }}
        </RouterLink>
        <RouterLink to="/health" @click="moreOpen = false">
          {{ auth.isAdult ? "Здоровье" : "Моё здоровье" }}
        </RouterLink>
        <template v-if="auth.isAdult">
          <RouterLink to="/family" @click="moreOpen = false">Настройка семьи</RouterLink>
        </template>
        <RouterLink to="/profile" @click="moreOpen = false">Профиль</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BrandLogo from "@/components/BrandLogo.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const moreOpen = ref(false);
</script>

<style scoped lang="scss">
.shell {
  min-height: 100vh;
}

.sidebar {
  display: none;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav-icon {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.nav-icon svg {
  width: 22px;
  height: 22px;
}

.nav a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-pill);
  color: var(--text);
  font-weight: 600;
}

.nav a.router-link-active:not(.nav-home),
.nav a.nav-home.router-link-exact-active {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.nav-divider {
  height: 1px;
  background: var(--line);
  margin: 12px 8px;
}

.nav-label {
  margin: 0 0 4px 16px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.tabbar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  height: calc(var(--nav-h) - 8px);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 6px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
  z-index: 20;
}

.tabbar a,
.tabbar button {
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  color: var(--muted);
  font: inherit;
  font-size: 0.64rem;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
}

.tab-pill {
  display: grid;
  justify-items: center;
  gap: 2px;
  width: 100%;
  padding: 8px 6px;
  border-radius: var(--radius-pill);
}

.tabbar a.router-link-active:not(.nav-home) .tab-pill,
.tabbar a.nav-home.router-link-exact-active .tab-pill,
.tabbar button.active .tab-pill {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.sheet {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: grid;
  align-items: end;
  padding: 16px;
  padding-bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
}

.sheet-card {
  display: grid;
  gap: 4px;
  padding: 18px;
}

.sheet-title {
  margin: 0 8px 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.1rem;
}

.sheet-card a {
  display: block;
  padding: 14px 12px;
  border-radius: var(--radius-sm);
  color: inherit;
  font-weight: 600;
}

.sheet-card a:hover {
  background: var(--accent-soft);
  color: var(--accent-text);
}

@media (min-width: 900px) {
  .shell {
    display: grid;
    grid-template-columns: 248px 1fr;
  }

  .sidebar {
    display: block;
    position: sticky;
    top: 0;
    height: 100vh;
    padding: 28px 18px;
    border-right: 1px solid var(--line);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter: blur(8px);
  }

  .tabbar,
  .sheet {
    display: none;
  }

  .main {
    min-width: 0;
  }
}
</style>
