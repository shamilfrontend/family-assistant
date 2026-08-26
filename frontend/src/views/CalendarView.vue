<template>
  <div class="page page--wide stack">
    <div class="card stack">
      <div class="section-head">
        <h1>Календарь</h1>
        <button v-if="auth.isAdult" type="button" @click="openCreate()">Добавить</button>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>

      <div v-if="auth.isAdult" class="chip-group view-switch" role="radiogroup" aria-label="Вид">
        <button
          v-for="opt in VIEW_OPTIONS"
          :key="opt.id"
          type="button"
          role="radio"
          class="chip"
          :class="{ 'chip--on': view === opt.id }"
          :aria-checked="view === opt.id"
          @click="view = opt.id"
        >
          {{ opt.label }}
        </button>
      </div>

      <label v-if="auth.isAdult" class="filter">
        Кто
        <select v-model="memberId">
          <option value="">все</option>
          <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
        </select>
      </label>

      <template v-if="auth.isAdult">
        <div class="row period-nav">
          <button class="btn btn--ghost nav-btn" type="button" :aria-label="prevLabel" @click="shift(-1)">
            ←
          </button>
          <strong class="period-title">{{ periodTitle }}</strong>
          <button class="btn btn--ghost nav-btn" type="button" :aria-label="nextLabel" @click="shift(1)">
            →
          </button>
        </div>

        <CalendarTimeGrid
          v-if="view !== 'month'"
          :days="periodDays"
          :items="items"
          :tz="tz"
          :today-ymd="todayYmd"
          :can-create="true"
          @select="selectedDay = $event"
          @create="openCreate($event.date, $event.time)"
        />

        <div v-else class="month">
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

    <div v-if="!auth.isAdult || view === 'month'" class="card stack">
      <div class="section-head">
        <h2>{{ listTitle }}</h2>
        <button v-if="auth.isAdult" type="button" @click="openCreate()">Добавить</button>
      </div>
      <div v-if="visibleItems.length === 0" class="empty">
        <p class="muted">Нет событий на этот период.</p>
        <button v-if="auth.isAdult" class="btn" type="button" @click="openCreate()">Добавить событие</button>
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
      :default-date="auth.isAdult ? createDate : undefined"
      :default-time="createTime"
      @close="createOpen = false"
      @created="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { DateTime } from "luxon";
import { api, getApiError } from "@/api/client";
import CalendarTimeGrid from "@/components/CalendarTimeGrid.vue";
import EventFormModal from "@/components/EventFormModal.vue";
import { eventLink, typeLabel, type Occurrence } from "@/lib/events";
import {
  daysInWeek,
  familyNow,
  formatDate,
  formatDayTitle,
  formatMonthTitle,
  formatTime,
  formatWeekRangeTitle,
  fromIso,
  monthGrid,
  ymd,
} from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

type CalView = "day" | "workweek" | "week" | "month";

const VIEW_OPTIONS: { id: CalView; label: string }[] = [
  { id: "day", label: "День" },
  { id: "workweek", label: "Рабочая неделя" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const auth = useAuthStore();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const error = ref("");
const createOpen = ref(false);
const createDate = ref("");
const createTime = ref<string | undefined>(undefined);
const items = ref<Occurrence[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const memberId = ref("");
const view = ref<CalView>("month");
const monthCursor = ref(familyNow(tz.value).startOf("month"));
const selectedDay = ref(ymd(familyNow(tz.value)));
const todayYmd = computed(() => ymd(familyNow(tz.value)));
const isDesktop = ref(false);

const focus = computed(() => DateTime.fromISO(selectedDay.value, { zone: tz.value }));
const year = computed(() => monthCursor.value.year);
const month = computed(() => monthCursor.value.month);
const grid = computed(() => monthGrid(year.value, month.value, tz.value));
const monthTitle = computed(() => formatMonthTitle(year.value, month.value, tz.value));

const periodDays = computed(() => {
  if (view.value === "day") return [focus.value.startOf("day")];
  if (view.value === "workweek") return daysInWeek(focus.value, 5);
  if (view.value === "week") return daysInWeek(focus.value, 7);
  return [];
});

const periodTitle = computed(() => {
  if (view.value === "month") return monthTitle.value;
  if (view.value === "day") return formatDayTitle(focus.value);
  return formatWeekRangeTitle(periodDays.value);
});

const prevLabel = computed(() =>
  view.value === "month" ? "Предыдущий месяц" : view.value === "day" ? "Предыдущий день" : "Предыдущая неделя",
);
const nextLabel = computed(() =>
  view.value === "month" ? "Следующий месяц" : view.value === "day" ? "Следующий день" : "Следующая неделя",
);

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

function shift(delta: number) {
  if (view.value === "month") {
    monthCursor.value = monthCursor.value.plus({ months: delta }).startOf("month");
    selectedDay.value = ymd(monthCursor.value);
    return;
  }
  const unit = view.value === "day" ? "days" : "weeks";
  selectedDay.value = ymd(focus.value.plus({ [unit]: delta }));
}

function openCreate(date?: string, time?: string) {
  createDate.value = date ?? selectedDay.value;
  createTime.value = time;
  createOpen.value = true;
}

async function load() {
  if (!auth.me) return;
  error.value = "";
  try {
    const zone = tz.value;
    const now = familyNow(zone);
    let from: string;
    let to: string;
    if (!auth.isAdult) {
      from = now.toISODate() ?? "";
      to = now.plus({ days: 30 }).toISODate() ?? "";
    } else if (view.value === "month") {
      const days = monthGrid(year.value, month.value, zone);
      from = days[0].toISODate() ?? "";
      to = days[days.length - 1].toISODate() ?? "";
    } else {
      from = periodDays.value[0]?.toISODate() ?? "";
      to = periodDays.value[periodDays.value.length - 1]?.toISODate() ?? "";
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

const rangeKey = computed(() => {
  if (!auth.isAdult) return "child";
  if (view.value === "month") return `month:${year.value}-${month.value}`;
  return `${view.value}:${periodDays.value.map((day: DateTime) => ymd(day)).join(",")}`;
});

watch(view, (next) => {
  if (next === "month") monthCursor.value = focus.value.startOf("month");
});

watch([rangeKey, tz, memberId], load);
</script>

<style scoped lang="scss">
.view-switch {
  margin-bottom: 2px;
}

.view-switch .chip {
  color: inherit;
}

.period-nav {
  justify-content: space-between;
  align-items: center;
}

.nav-btn {
  min-width: 44px;
  padding-inline: 12px;
}

.period-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  text-transform: capitalize;
  text-align: center;
  flex: 1;
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
