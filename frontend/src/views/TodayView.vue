<template>
  <div class="page stack today">
    <header class="hero">
      <p class="hero-kicker muted">{{ weekday }}</p>
      <h1 class="hero-title">{{ heroDate }}</h1>
      <p class="hero-sub muted">{{ heroSub }}</p>
    </header>

    <div v-if="auth.isAdult" class="actions-grid">
      <button class="action-card action-card--primary" type="button" @click="createOpen = true">
        <div>
          <p class="action-title">Добавить событие</p>
          <p class="action-sub">В календарь семьи</p>
        </div>
        <span class="action-arrow" aria-hidden="true">→</span>
      </button>
      <RouterLink class="action-card action-card--secondary" to="/calendar">
        <div>
          <p class="action-title">Открыть календарь</p>
          <p class="action-sub">Месяц и список</p>
        </div>
        <span class="action-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </div>

    <p v-if="error" class="alert">{{ error }}</p>

    <section v-else class="card stack">
      <div class="section-head">
        <h2>События</h2>
        <div class="head-actions">
          <RouterLink to="/calendar">Календарь</RouterLink>
          <button v-if="auth.isAdult" type="button" @click="createOpen = true">Добавить</button>
        </div>
      </div>
      <div class="event-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'today' }"
          :aria-selected="tab === 'today'"
          @click="tab = 'today'"
        >
          Сегодня
        </button>
        <button
          type="button"
          role="tab"
          :class="{ active: tab === 'week' }"
          :aria-selected="tab === 'week'"
          @click="tab = 'week'"
        >
          Неделя
        </button>
      </div>
      <div v-if="visibleItems.length === 0" class="empty">
        <p class="muted">{{ tab === "today" ? "На сегодня событий нет." : "На ближайшую неделю событий нет." }}</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in visibleItems" :key="item.key" :class="{ past: item.past }" :to="item.to">
          <span>{{ item.title }}</span>
          <span class="muted meta">{{ item.meta }}</span>
        </RouterLink>
      </div>
    </section>

    <section v-if="auth.isAdult" class="card stack">
      <div class="section-head">
        <h2>Расходы за текущий месяц</h2>
        <RouterLink to="/budget">Все</RouterLink>
      </div>
      <p v-if="budgetError" class="alert">{{ budgetError }}</p>
      <p v-else class="budget-total">{{ formatMoney(budgetSummary?.total ?? 0) }}</p>
    </section>

    <EventFormModal :open="createOpen" :default-date="todayYmd" @close="createOpen = false" @created="load" />
  </div>
</template>

<script setup lang="ts">
import { DateTime } from "luxon";
import { computed, onMounted, ref, shallowRef } from "vue";
import { api, getApiError } from "@/api/client";
import EventFormModal from "@/components/EventFormModal.vue";
import { formatMoney, type BudgetSummary } from "@/lib/budget";
import { documentTypeLabel, type FamilyDocument } from "@/lib/documents";
import { eventLink, type Occurrence } from "@/lib/events";
import { healthKindLabel, type HealthReminder } from "@/lib/health";
import type { Task } from "@/lib/tasks";
import { familyNow, formatDate, formatTime, fromIso, ymd } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

type FeedItem = {
  key: string;
  title: string;
  meta: string;
  to: string;
  at: string;
  past: boolean;
};

type RemindersBucket = {
  events: Occurrence[];
  tasks: Task[];
  health: HealthReminder[];
  documents: FamilyDocument[];
};

type RemindersPayload = {
  today: RemindersBucket;
  soon: RemindersBucket;
};

function emptyBucket(): RemindersBucket {
  return { events: [], tasks: [], health: [], documents: [] };
}

const auth = useAuthStore();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const error = ref("");
const budgetError = ref("");
const createOpen = ref(false);
const tab = ref<"today" | "week">("today");
const todayBucket = ref<RemindersBucket>(emptyBucket());
const soonBucket = ref<RemindersBucket>(emptyBucket());
const budgetSummary = ref<BudgetSummary | null>(null);
const asOf = shallowRef(familyNow(tz.value));

const now = computed(() => familyNow(tz.value));
const todayYmd = computed(() => ymd(now.value));

const weekday = computed(() =>
  now.value.setLocale("ru").toFormat("cccc").replace(/^./, (c) => c.toUpperCase()),
);

const heroDate = computed(() => now.value.setLocale("ru").toFormat("d MMMM"));

function dateOnlyIso(day: string): string {
  return DateTime.fromISO(day, { zone: tz.value }).startOf("day").toUTC().toISO() ?? `${day}T00:00:00.000Z`;
}

function dateOnlyLabel(day: string): string {
  return DateTime.fromISO(day, { zone: tz.value }).setLocale("ru").toFormat("d MMMM, cccc");
}

function mapEvent(item: Occurrence, includeDate: boolean): FeedItem {
  const start = fromIso(item.occurrenceStart, tz.value);
  const end = item.occurrenceEnd ? fromIso(item.occurrenceEnd, tz.value) : null;
  const past = item.allDay ? false : asOf.value > (end ?? start);
  let meta: string;
  if (item.allDay) {
    meta = includeDate ? formatDate(item.occurrenceStart, tz.value) : "весь день";
  } else {
    const time = formatTime(item.occurrenceStart, tz.value);
    meta = includeDate ? `${formatDate(item.occurrenceStart, tz.value)} ${time}` : time;
  }
  return {
    key: `event:${item.id}:${item.occurrenceStart}`,
    title: item.title,
    meta,
    to: eventLink(item),
    at: item.occurrenceStart,
    past,
  };
}

function mapTask(item: Task, includeDate: boolean): FeedItem {
  const due = fromIso(item.dueAt, tz.value);
  const time = formatTime(item.dueAt, tz.value);
  return {
    key: `task:${item.id}`,
    title: item.title,
    meta: includeDate ? `${formatDate(item.dueAt, tz.value)} ${time}` : time,
    to: `/tasks/${item.id}`,
    at: item.dueAt,
    past: asOf.value > due,
  };
}

function mapHealth(item: HealthReminder, includeDate: boolean): FeedItem {
  if (item.kind === "APPOINTMENT") {
    const start = fromIso(item.at, tz.value);
    const time = formatTime(item.at, tz.value);
    return {
      key: `health:${item.id}`,
      title: `${item.member.name} · ${healthKindLabel(item.kind)} · ${item.title}`,
      meta: includeDate ? `${formatDate(item.at, tz.value)} ${time}` : time,
      to: `/health/${item.member.id}`,
      at: item.at,
      past: asOf.value > start,
    };
  }
  return {
    key: `health:${item.id}`,
    title: `${item.member.name} · ${healthKindLabel(item.kind)} · ${item.title}`,
    meta: includeDate || item.at !== todayYmd.value ? dateOnlyLabel(item.at) : "сегодня",
    to: `/health/${item.member.id}`,
    at: dateOnlyIso(item.at),
    past: false,
  };
}

function mapDocument(item: FamilyDocument, includeDate: boolean): FeedItem {
  return {
    key: `doc:${item.id}`,
    title: documentTypeLabel(item.type),
    meta: includeDate || item.expiresAt !== todayYmd.value ? dateOnlyLabel(item.expiresAt) : "сегодня",
    to: `/documents/${item.id}`,
    at: dateOnlyIso(item.expiresAt),
    past: false,
  };
}

function collect(bucket: RemindersBucket, includeDate: boolean): FeedItem[] {
  return [
    ...bucket.events.map((item) => mapEvent(item, includeDate)),
    ...bucket.tasks.map((item) => mapTask(item, includeDate)),
    ...bucket.health.map((item) => mapHealth(item, includeDate)),
    ...bucket.documents.map((item) => mapDocument(item, includeDate)),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title, "ru"));
}

const todayItems = computed(() => collect(todayBucket.value, false));
const weekItems = computed(() =>
  [...collect(todayBucket.value, true), ...collect(soonBucket.value, true)].sort(
    (a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title, "ru"),
  ),
);

const visibleItems = computed(() => (tab.value === "today" ? todayItems.value : weekItems.value));

const heroSub = computed(() => {
  if (error.value) return "Не удалось загрузить день";
  const n = todayItems.value.length;
  if (n === 0) return "Свободный день — можно выдохнуть";
  if (n === 1) return "1 событие на сегодня";
  if (n < 5) return `${n} события на сегодня`;
  return `${n} событий на сегодня`;
});

onMounted(() => {
  void load();
});

function readBucket(raw: Partial<RemindersBucket> | undefined): RemindersBucket {
  return {
    events: raw?.events ?? [],
    tasks: raw?.tasks ?? [],
    health: raw?.health ?? [],
    documents: raw?.documents ?? [],
  };
}

async function load() {
  error.value = "";
  budgetError.value = "";
  asOf.value = familyNow(tz.value);

  const remindersReq = api.get<RemindersPayload>("/reminders");
  const budgetReq = auth.isAdult ? api.get<BudgetSummary>("/budget/summary") : null;

  try {
    const { data } = await remindersReq;
    todayBucket.value = readBucket(data.today);
    soonBucket.value = readBucket(data.soon);
  } catch (err) {
    error.value = getApiError(err).message;
    todayBucket.value = emptyBucket();
    soonBucket.value = emptyBucket();
  }

  if (!budgetReq) return;
  try {
    const { data } = await budgetReq;
    budgetSummary.value = data;
  } catch (err) {
    budgetError.value = getApiError(err).message;
    budgetSummary.value = null;
  }
}
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

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.event-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  background: var(--bg);
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
}

.event-tabs button {
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius-pill);
  padding: 10px 8px;
  font: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.event-tabs button.active {
  background: var(--surface);
  color: var(--accent-text);
  box-shadow: var(--shadow-soft);
}

.budget-total {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.meta {
  font-weight: 600;
  font-size: 0.88rem;
  white-space: nowrap;
}

.list a.past span:first-child {
  text-decoration: line-through;
  color: var(--muted);
}

@media (max-width: 420px) {
  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
