<template>
  <div class="page page--wide stack">
    <div class="card stack">
      <div class="section-head">
        <h1>Календарь</h1>
        <button v-if="auth.isAdult" type="button" @click="createOpen = true">Добавить</button>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>

      <label v-if="auth.isAdult" class="filter">
        Кто
        <select v-model="memberId" @change="load">
          <option value="">все</option>
          <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
        </select>
      </label>

      <template v-if="auth.isAdult">
        <div class="row month-nav">
          <button class="btn btn--ghost nav-btn" type="button" aria-label="Предыдущий месяц" @click="shiftMonth(-1)">
            ←
          </button>
          <strong class="month-title">{{ monthTitle }}</strong>
          <button class="btn btn--ghost nav-btn" type="button" aria-label="Следующий месяц" @click="shiftMonth(1)">
            →
          </button>
        </div>

        <div class="month">
          <div v-for="day in weekdays" :key="day" class="dow">{{ day }}</div>
          <button
            v-for="day in grid"
            :key="ymd(day)"
            type="button"
            class="cell"
            :class="{ faded: day.month !== month, today: ymd(day) === todayYmd, selected: ymd(day) === selectedDay }"
            @click="selectedDay = ymd(day)"
          >
            <span class="num">{{ day.day }}</span>
            <span
              v-for="item in dayItems(ymd(day)).slice(0, 3)"
              :key="item.id + item.occurrenceStart"
              class="pill"
            >
              {{ item.title }}
            </span>
            <span v-if="dayItems(ymd(day)).length > 3" class="more">ещё {{ dayItems(ymd(day)).length - 3 }}</span>
          </button>
        </div>
      </template>
    </div>

    <div class="card stack">
      <div class="section-head">
        <h2>{{ listTitle }}</h2>
        <button v-if="auth.isAdult" type="button" @click="createOpen = true">Добавить</button>
      </div>
      <div v-if="visibleItems.length === 0" class="empty">
        <p class="muted">Нет событий на этот период.</p>
        <button v-if="auth.isAdult" class="btn" type="button" @click="createOpen = true">Добавить событие</button>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in visibleItems" :key="item.id + item.occurrenceStart" :to="eventLink(item)">
          <span>
            {{ item.title }}
            <span class="badge badge--rose type-tag">{{ typeLabel(item.type) }}</span>
          </span>
          <span class="muted when">{{ when(item) }}</span>
        </RouterLink>
      </div>
    </div>

    <EventFormModal
      :open="createOpen"
      :default-date="auth.isAdult ? selectedDay : undefined"
      @close="createOpen = false"
      @created="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { DateTime } from "luxon";
import { api, getApiError } from "@/api/client";
import EventFormModal from "@/components/EventFormModal.vue";
import { eventLink, typeLabel, type Occurrence } from "@/lib/events";
import { familyNow, formatDate, formatMonthTitle, formatTime, fromIso, monthGrid, ymd } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const auth = useAuthStore();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const error = ref("");
const createOpen = ref(false);
const items = ref<Occurrence[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const memberId = ref("");
const cursor = ref(familyNow(tz.value).startOf("month"));
const selectedDay = ref(ymd(familyNow(tz.value)));
const todayYmd = computed(() => ymd(familyNow(tz.value)));
const isDesktop = ref(false);

const year = computed(() => cursor.value.year);
const month = computed(() => cursor.value.month);
const grid = computed(() => monthGrid(year.value, month.value, tz.value));
const monthTitle = computed(() => formatMonthTitle(year.value, month.value, tz.value));

const byDay = computed(() => {
  const map: Record<string, Occurrence[]> = {};
  for (const item of items.value) {
    const key = ymd(fromIso(item.occurrenceStart, tz.value));
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
});

function dayItems(day: string): Occurrence[] {
  return byDay.value[day] ?? [];
}

const visibleItems = computed(() => {
  if (!auth.isAdult) return items.value;
  if (isDesktop.value) return dayItems(selectedDay.value);
  return items.value;
});

const listTitle = computed(() => {
  if (!auth.isAdult) return "Ближайшие 30 дней";
  if (!isDesktop.value) return monthTitle.value;
  const day = DateTime.fromISO(selectedDay.value, { zone: tz.value }).setLocale("ru");
  return day.toFormat("d MMMM");
});

function when(item: Occurrence): string {
  const date = formatDate(item.occurrenceStart, tz.value);
  return item.allDay ? date : `${date} ${formatTime(item.occurrenceStart, tz.value)}`;
}

function shiftMonth(delta: number) {
  cursor.value = cursor.value.plus({ months: delta }).startOf("month");
  selectedDay.value = ymd(cursor.value);
}

async function load() {
  if (!auth.me) return;
  error.value = "";
  try {
    const zone = tz.value;
    const now = familyNow(zone);
    let from: string;
    let to: string;
    if (auth.isAdult) {
      const days = monthGrid(year.value, month.value, zone);
      from = days[0].toISODate() ?? "";
      to = days[days.length - 1].toISODate() ?? "";
    } else {
      from = now.toISODate() ?? "";
      to = now.plus({ days: 30 }).toISODate() ?? "";
    }
    const { data } = await api.get<{ items: Occurrence[] }>("/events", {
      params: {
        from,
        to,
        ...(memberId.value ? { memberId: memberId.value } : {}),
      },
    });
    items.value = data.items;
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

onMounted(async () => {
  const mq = window.matchMedia("(min-width: 900px)");
  const apply = () => {
    isDesktop.value = mq.matches;
  };
  apply();
  mq.addEventListener("change", apply);
  if (auth.isAdult) {
    const { data } = await api.get<{ items: { id: string; name: string }[] }>("/members");
    members.value = data.items;
  }
  await load();
});

watch([cursor, tz], load);
</script>

<style scoped lang="scss">
.filter,
.month-nav {
  max-width: 360px;
}

.month-nav {
  justify-content: space-between;
  align-items: center;
}

.nav-btn {
  min-width: 44px;
  padding-inline: 12px;
}

.month-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  text-transform: capitalize;
}

.month {
  display: none;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.dow {
  text-align: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cell {
  min-height: 92px;
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 8px;
  display: grid;
  align-content: start;
  gap: 4px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.cell.faded {
  opacity: 0.4;
}

.cell.today .num {
  display: inline-grid;
  place-items: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-text);
  font-weight: 800;
}

.cell.selected {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  background: var(--surface);
}

.num {
  font-size: 0.8rem;
  font-weight: 700;
}

.pill {
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent-text);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  font-size: 0.7rem;
  color: var(--muted);
}

.type-tag {
  margin-left: 8px;
  vertical-align: middle;
}

.when {
  font-weight: 600;
  font-size: 0.88rem;
  white-space: nowrap;
}

@media (min-width: 900px) {
  .month {
    display: grid;
  }
}
</style>
