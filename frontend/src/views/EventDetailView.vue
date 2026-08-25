<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/calendar">← К календарю</RouterLink>
    <div v-if="denied" class="card stack">
      <h1>{{ denied }}</h1>
      <p class="muted">Событие недоступно.</p>
    </div>
    <div v-else-if="event" class="card stack">
      <div class="meta-row">
        <span class="badge badge--rose">{{ typeLabel(event.type) }}</span>
        <span v-if="event.recurrence !== 'NONE'" class="badge badge--blue">
          {{ event.recurrence === "WEEKLY" ? "еженедельно" : "ежегодно" }}
        </span>
      </div>
      <h1>{{ event.title }}</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
      <p v-if="event.type === 'DOCTOR'" class="muted">Это событие календаря, не мед. карта.</p>
      <p v-if="event.type === 'HEALTH_APPOINTMENT'" class="muted">Приём из здоровья — только просмотр.</p>
      <p class="when">{{ when }}</p>
      <p class="muted">Участники: {{ participantNames }}</p>

      <template v-if="canEdit">
        <hr class="divider" />
        <form class="stack" @submit.prevent="save">
          <label v-if="event.recurrence !== 'NONE'">
            Что меняем
            <select v-model="scope">
              <option value="this">только это вхождение</option>
              <option value="series">всю серию</option>
            </select>
          </label>
          <EventFields
            v-if="form"
            v-model="form"
            :members="members"
            :hide-recurrence="scope === 'this' && event.recurrence !== 'NONE'"
          />
          <div class="row">
            <button class="btn" type="submit" :disabled="loading">Сохранить</button>
            <button class="btn btn--danger" type="button" :disabled="loading" @click="removeSeries">
              Удалить серию
            </button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import EventFields from "@/components/EventFields.vue";
import {
  eventLink,
  formFromEvent,
  formPayload,
  typeLabel,
  type EventFormState,
  type Occurrence,
} from "@/lib/events";
import { formatDate, formatTime } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const event = ref<Occurrence | null>(null);
const form = ref<EventFormState | null>(null);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const notice = ref("");
const denied = ref("");
const loading = ref(false);
const scope = ref<"this" | "series">("this");

const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const canEdit = computed(
  () => auth.isAdult && event.value && event.value.type !== "HEALTH_APPOINTMENT",
);

const when = computed(() => {
  if (!event.value) return "";
  const date = formatDate(event.value.occurrenceStart, tz.value);
  return event.value.allDay ? date : `${date} ${formatTime(event.value.occurrenceStart, tz.value)}`;
});

const participantNames = computed(() => {
  if (!event.value) return "";
  const names = event.value.participantIds.map(
    (id) => members.value.find((m) => m.id === id)?.name ?? "участник",
  );
  return names.join(", ");
});

async function load() {
  denied.value = "";
  error.value = "";
  try {
    const occurrenceStart = typeof route.query.occurrenceStart === "string" ? route.query.occurrenceStart : undefined;
    const { data } = await api.get<Occurrence>(`/events/${route.params.id}`, {
      params: occurrenceStart ? { occurrenceStart } : {},
    });
    event.value = data;
    if (auth.isAdult) {
      const list = await api.get<{ items: { id: string; name: string }[] }>("/members");
      members.value = list.data.items;
      form.value = formFromEvent(data, tz.value, scope.value === "this");
    } else {
      const list = await api.get<{ items: { id: string; name: string }[] }>("/members");
      members.value = list.data.items;
    }
  } catch (err) {
    const apiErr = getApiError(err);
    if (apiErr.code === "not_found") denied.value = "Не найдено";
    else if (apiErr.code === "forbidden") denied.value = "Нет доступа";
    else error.value = apiErr.message;
  }
}

watch(
  () => [route.params.id, route.query.occurrenceStart],
  load,
  { immediate: true },
);
watch(scope, () => {
  if (event.value && auth.isAdult) {
    form.value = formFromEvent(
      event.value,
      tz.value,
      scope.value === "this" && event.value.recurrence !== "NONE",
    );
  }
});

async function save() {
  if (!form.value || !event.value || !auth.me) return;
  if (form.value.participantIds.length < 1) {
    error.value = "Нужен хотя бы один участник";
    return;
  }
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    const payload = formPayload(form.value, auth.me.family.timezone);
    const isSeries = event.value.recurrence !== "NONE";
    const { data } = await api.patch<Occurrence>(`/events/${event.value.id}`, {
      ...payload,
      ...(isSeries && scope.value === "this" ? { occurrenceStart: event.value.occurrenceStart } : {}),
    }, {
      params: isSeries ? { scope: scope.value } : {},
    });
    event.value = data;
    notice.value = "Сохранено";
    if (data.id !== route.params.id) {
      await router.replace(eventLink(data));
    }
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function removeSeries() {
  if (!event.value) return;
  if (!confirm("Удалить всю серию?")) return;
  loading.value = true;
  error.value = "";
  try {
    await api.delete(`/events/${event.value.id}`, {
      params: event.value.recurrence === "NONE" ? {} : { scope: "series" },
    });
    await router.push("/calendar");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.when {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.divider {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 4px 0;
}
</style>
