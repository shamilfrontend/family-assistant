<template>
  <div class="time-grid" :style="{ '--cols': days.length }">
    <div class="top">
      <div class="left-rail">
        <div class="corner"></div>
        <div class="gutter-label muted">весь день</div>
      </div>
      <div ref="topScroll" class="top-scroll" @scroll="onTopScroll">
        <div class="top-inner">
          <div class="heads" :style="dayGridStyle">
            <button
              v-for="day in days"
              :key="ymd(day)"
              type="button"
              class="day-head"
              :class="{ today: ymd(day) === todayYmd }"
              @click="emit('select', ymd(day))"
            >
              <span class="dow">{{ day.setLocale("ru").toFormat("ccc") }}</span>
              <span class="num">{{ day.day }}</span>
            </button>
          </div>
          <div class="all-day" :style="dayGridStyle">
            <div v-for="day in days" :key="'all-' + ymd(day)" class="all-day-cell">
              <RouterLink
                v-for="item in layoutFor(day).allDay"
                :key="item.id + item.occurrenceStart"
                class="all-day-pill"
                :to="eventLink(item)"
              >
                {{ item.title }}
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div ref="vScroll" class="vscroll">
      <div class="hours" aria-hidden="true">
        <div v-for="hour in HOURS" :key="hour" class="hour-label">{{ hourLabel(hour) }}</div>
      </div>
      <div ref="daysScroll" class="days-scroll" @scroll="onDaysScroll">
        <div class="days" :style="dayGridStyle">
          <div
            v-for="day in days"
            :key="'col-' + ymd(day)"
            class="day-col"
            :class="{ today: ymd(day) === todayYmd }"
            @click="onDayClick(day, $event)"
          >
            <div v-for="hour in HOURS" :key="hour" class="hour-slot"></div>
            <div
              v-if="ymd(day) === todayYmd"
              class="now-line"
              :style="{ top: `${nowLineTop(now)}px` }"
            ></div>
            <RouterLink
              v-for="laid in layoutFor(day).timed"
              :key="laid.item.id + laid.item.occurrenceStart"
              class="event"
              :to="eventLink(laid.item)"
              :style="{
                top: `${laid.top}px`,
                height: `${laid.height}px`,
                left: `calc(${laid.leftPct}% + 2px)`,
                width: `calc(${laid.widthPct}% - 4px)`,
              }"
              @click.stop
            >
              <span class="event-title">{{ laid.item.title }}</span>
              <span class="event-time">{{ formatTime(laid.item.occurrenceStart, tz) }}</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { DateTime } from "luxon";
import { eventLink, type Occurrence } from "@/lib/events";
import {
  HOUR_COUNT,
  HOUR_HEIGHT,
  HOURS,
  hourLabel,
  layoutDayEvents,
  nowLineTop,
} from "@/lib/calendarLayout";
import { familyNow, formatTime, ymd } from "@/lib/time";

const props = defineProps<{
  days: DateTime[];
  items: Occurrence[];
  tz: string;
  todayYmd: string;
  canCreate: boolean;
}>();

const emit = defineEmits<{
  select: [day: string];
  create: [payload: { date: string; time: string }];
}>();

const topScroll = ref<HTMLElement | null>(null);
const daysScroll = ref<HTMLElement | null>(null);
const vScroll = ref<HTMLElement | null>(null);
const now = ref(familyNow(props.tz));
let tick: number | undefined;
let syncing = false;

const layouts = computed(() => {
  const map: Record<string, ReturnType<typeof layoutDayEvents>> = {};
  for (const day of props.days) {
    const key = ymd(day);
    map[key] = layoutDayEvents(props.items, key, props.tz);
  }
  return map;
});

const dayGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.days.length}, minmax(var(--col-min), 1fr))`,
}));

function layoutFor(day: DateTime) {
  return layouts.value[ymd(day)] ?? { timed: [], allDay: [] };
}

function onDaysScroll() {
  if (syncing || !daysScroll.value || !topScroll.value) return;
  syncing = true;
  topScroll.value.scrollLeft = daysScroll.value.scrollLeft;
  syncing = false;
}

function onTopScroll() {
  if (syncing || !daysScroll.value || !topScroll.value) return;
  syncing = true;
  daysScroll.value.scrollLeft = topScroll.value.scrollLeft;
  syncing = false;
}

function onDayClick(day: DateTime, event: MouseEvent) {
  if (!props.canCreate) return;
  const col = event.currentTarget as HTMLElement;
  const y = event.clientY - col.getBoundingClientRect().top;
  const hour = Math.min(HOUR_COUNT - 1, Math.max(0, Math.floor(y / HOUR_HEIGHT)));
  emit("select", ymd(day));
  emit("create", { date: ymd(day), time: hourLabel(hour) });
}

function scrollToInteresting() {
  if (!vScroll.value) return;
  const hasToday = props.days.some((day) => ymd(day) === props.todayYmd);
  const top = hasToday ? Math.max(0, nowLineTop(now.value) - HOUR_HEIGHT * 2) : 8 * HOUR_HEIGHT;
  vScroll.value.scrollTop = top;
}

onMounted(() => {
  tick = window.setInterval(() => {
    now.value = familyNow(props.tz);
  }, 30_000);
  nextTick(scrollToInteresting);
});

onUnmounted(() => {
  if (tick) window.clearInterval(tick);
});

watch(
  () => props.days.map((day) => ymd(day)).join(","),
  () => nextTick(scrollToInteresting),
);
</script>

<style scoped lang="scss">
.time-grid {
  --gutter: 3.4rem;
  --col-min: 7.5rem;
  display: grid;
  gap: 0;
}

.top {
  display: flex;
  min-width: 0;
}

.left-rail {
  flex: 0 0 var(--gutter);
  display: grid;
  grid-template-rows: auto minmax(40px, auto);
}

.corner {
  min-height: 52px;
  border-bottom: 1px solid var(--line);
}

.gutter-label {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  display: flex;
  align-items: center;
  padding-right: 4px;
  border-bottom: 1px solid var(--line);
}

.top-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.top-inner {
  min-width: max(100%, calc(var(--cols) * var(--col-min)));
}

.heads,
.all-day,
.days {
  display: grid;
}

.day-head {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 52px;
  padding: 8px 4px 10px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.day-head .dow {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.day-head .num {
  font-size: 1rem;
  font-weight: 800;
}

.day-head.today .num {
  display: inline-grid;
  place-items: center;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-text);
}

.all-day-cell {
  min-height: 36px;
  padding: 4px;
  border-bottom: 1px solid var(--line);
  display: grid;
  align-content: start;
  gap: 4px;
}

.all-day-pill,
.event {
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent-text);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  overflow: hidden;
}

.all-day-pill {
  border-radius: var(--radius-pill);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vscroll {
  display: flex;
  max-height: min(70vh, 720px);
  overflow-y: auto;
  overflow-x: hidden;
}

.hours {
  flex: 0 0 var(--gutter);
  background: var(--surface);
}

.hour-label {
  height: 48px;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
  transform: translateY(-0.55em);
}

.hour-label:first-child {
  visibility: hidden;
}

.days-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.days {
  min-width: max(100%, calc(var(--cols) * var(--col-min)));
  height: 1152px;
}

.day-col {
  position: relative;
  border-left: 1px solid var(--line);
  cursor: pointer;
}

.hour-slot {
  height: 48px;
  border-bottom: 1px solid var(--line);
  pointer-events: none;
}

.now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  z-index: 3;
  pointer-events: none;
}

.now-line::before {
  content: "";
  position: absolute;
  left: -4px;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.event {
  position: absolute;
  z-index: 2;
  display: grid;
  align-content: start;
  gap: 2px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
}

.event-time {
  font-size: 0.64rem;
  font-weight: 600;
  opacity: 0.85;
}

.event-title,
.event-time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
