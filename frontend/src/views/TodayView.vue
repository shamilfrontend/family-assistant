<template>
  <div class="page stack today">
    <header class="hero">
      <p class="hero-kicker muted">{{ weekday }}</p>
      <h1 class="hero-title">{{ heroDate }}</h1>
      <p class="hero-sub muted">{{ heroSub }}</p>
    </header>

    <div v-if="auth.isAdult" class="actions-grid">
      <RouterLink class="action-card action-card--primary" to="/calendar/events/new">
        <div>
          <p class="action-title">Добавить событие</p>
          <p class="action-sub">В календарь семьи</p>
        </div>
        <span class="action-arrow" aria-hidden="true">→</span>
      </RouterLink>
      <RouterLink class="action-card action-card--secondary" to="/calendar">
        <div>
          <p class="action-title">Открыть календарь</p>
          <p class="action-sub">Месяц и список</p>
        </div>
        <span class="action-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </div>

    <section class="card stack">
      <div class="section-head">
        <h2>Сегодня</h2>
        <RouterLink v-if="auth.isAdult" to="/calendar/events/new">Добавить</RouterLink>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <div v-else-if="today.length === 0" class="empty">
        <p class="muted">На сегодня событий нет.</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in today" :key="item.id + item.occurrenceStart" :to="eventLink(item)">
          <span>{{ item.title }}</span>
          <span class="muted meta">{{ item.allDay ? "весь день" : formatTime(item.occurrenceStart, tz) }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="card stack">
      <div class="section-head">
        <h2>Дела на сегодня</h2>
        <RouterLink to="/tasks">Все</RouterLink>
      </div>
      <div v-if="todayTasks.length === 0" class="empty">
        <p class="muted">Открытых дел на сегодня нет.</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in todayTasks" :key="item.id" :to="`/tasks/${item.id}`">
          <span>{{ item.title }}</span>
          <span class="muted meta">{{ formatTime(item.dueAt, tz) }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="card stack">
      <div class="section-head">
        <h2>Скоро</h2>
        <RouterLink to="/calendar">Все</RouterLink>
      </div>
      <div v-if="soon.length === 0" class="empty">
        <p class="muted">Нет напоминаний на ближайшие дни.</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in soon" :key="item.id + item.occurrenceStart" :to="eventLink(item)">
          <span>{{ item.title }}</span>
          <span class="muted meta">{{ whenSoon(item) }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="card stack">
      <div class="section-head">
        <h2>Документы скоро истекают</h2>
        <RouterLink to="/documents">Все</RouterLink>
      </div>
      <div v-if="soonDocs.length === 0" class="empty">
        <p class="muted">Нет документов с истечением в ближайшие 30 дней.</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in soonDocs" :key="item.id" :to="`/documents/${item.id}`">
          <span>{{ documentTypeLabel(item.type) }}</span>
          <span class="muted meta">{{ item.expiresAt }}</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, getApiError } from "@/api/client";
import { documentTypeLabel, type FamilyDocument } from "@/lib/documents";
import { eventLink, type Occurrence } from "@/lib/events";
import type { Task } from "@/lib/tasks";
import { familyNow, formatDate, formatTime, fromIso, ymd } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const error = ref("");
const today = ref<Occurrence[]>([]);
const soon = ref<Occurrence[]>([]);
const todayTasks = ref<Task[]>([]);
const soonDocs = ref<FamilyDocument[]>([]);

const now = computed(() => familyNow(tz.value));

const weekday = computed(() =>
  now.value.setLocale("ru").toFormat("cccc").replace(/^./, (c) => c.toUpperCase()),
);

const heroDate = computed(() => now.value.setLocale("ru").toFormat("d MMMM"));

const heroSub = computed(() => {
  if (error.value) return "Не удалось загрузить день";
  const n = today.value.length;
  if (n === 0) return "Свободный день — можно выдохнуть";
  if (n === 1) return "1 событие на сегодня";
  if (n < 5) return `${n} события на сегодня`;
  return `${n} событий на сегодня`;
});

function whenSoon(item: Occurrence): string {
  const date = formatDate(item.occurrenceStart, tz.value);
  return item.allDay ? date : `${date} ${formatTime(item.occurrenceStart, tz.value)}`;
}

onMounted(async () => {
  try {
    const { data } = await api.get<{
      today: { events: Occurrence[]; tasks: Task[] };
      soon: { events: Occurrence[]; documents: FamilyDocument[] };
    }>("/reminders");
    today.value = data.today.events;
    todayTasks.value = data.today.tasks;
    const todayKey = ymd(familyNow(tz.value));
    soon.value = data.soon.events.filter((item) => ymd(fromIso(item.occurrenceStart, tz.value)) !== todayKey);
    soonDocs.value = data.soon.documents;
  } catch (err) {
    error.value = getApiError(err).message;
  }
});
</script>

<style scoped lang="scss">
.today {
  gap: 18px;
}

.hero {
  padding: 8px 4px 4px;
}

.hero-kicker {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: capitalize;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(2rem, 6vw, 2.6rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  margin: 0 0 6px;
  line-height: 1.1;
  animation: page-in 0.5s ease both;
}

.hero-sub {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.meta {
  font-weight: 600;
  font-size: 0.88rem;
  white-space: nowrap;
}

@media (max-width: 420px) {
  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
