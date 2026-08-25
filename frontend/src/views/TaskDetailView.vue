<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/tasks">← К делам</RouterLink>
    <div v-if="denied" class="card stack">
      <h1>{{ denied }}</h1>
      <p class="muted">Дело недоступно.</p>
    </div>
    <div v-else-if="task" class="card stack">
      <div class="meta-row">
        <span class="badge" :class="task.status === 'DONE' ? 'badge--mint' : 'badge--blue'">
          {{ task.status === "DONE" ? "сделано" : "открыто" }}
        </span>
        <span v-if="task.recurrence !== 'NONE'" class="badge badge--lavender">
          {{ taskRecurrenceLabel(task.recurrence) }}
        </span>
      </div>
      <h1>{{ task.title }}</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
      <p>Исполнитель: {{ assigneeName }}</p>
      <p>Срок: {{ formatDate(task.dueAt, tz) }} {{ formatTime(task.dueAt, tz) }}</p>

      <template v-if="auth.isAdult">
        <hr class="divider" />
        <form class="stack" @submit.prevent="save">
          <label>Название <input v-model="form.title" required maxlength="120" /></label>
          <label>
            Исполнитель
            <select v-model="form.assigneeMemberId">
              <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
            </select>
          </label>
          <label>Срок <input v-model="form.dueAt" type="datetime-local" required /></label>
          <label>
            Повтор
            <select v-model="form.recurrence">
              <option v-for="item in TASK_RECURRENCE" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <div class="row">
            <button class="btn" type="submit" :disabled="loading">Сохранить</button>
            <button
              v-if="task.status === 'DONE'"
              class="btn btn--ghost"
              type="button"
              :disabled="loading"
              @click="reopen"
            >
              Снять отметку
            </button>
            <button class="btn btn--danger" type="button" :disabled="loading" @click="remove">Удалить</button>
          </div>
        </form>
      </template>
      <button
        v-else-if="task.status === 'OPEN'"
        class="btn"
        type="button"
        :disabled="loading"
        @click="complete"
      >
        Сделано
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { TASK_RECURRENCE, taskRecurrenceLabel, type Task } from "@/lib/tasks";
import { formatDate, formatTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const task = ref<Task | null>(null);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const notice = ref("");
const denied = ref("");
const loading = ref(false);
const form = reactive({
  title: "",
  assigneeMemberId: "",
  dueAt: "",
  recurrence: "NONE" as Task["recurrence"],
});

const assigneeName = computed(
  () => members.value.find((m) => m.id === task.value?.assigneeMemberId)?.name ?? "участник",
);

async function load() {
  denied.value = "";
  error.value = "";
  try {
    const { data } = await api.get<Task>(`/tasks/${route.params.id}`);
    task.value = data;
    const people = await api.get<{ items: { id: string; name: string }[] }>("/members");
    members.value = people.data.items;
    form.title = data.title;
    form.assigneeMemberId = data.assigneeMemberId;
    form.dueAt = toDatetimeLocal(data.dueAt, tz.value);
    form.recurrence = data.recurrence;
  } catch (err) {
    const apiErr = getApiError(err);
    if (apiErr.code === "not_found") denied.value = "Не найдено";
    else if (apiErr.code === "forbidden") denied.value = "Нет доступа";
    else error.value = apiErr.message;
  }
}

watch(() => route.params.id, load, { immediate: true });

async function save() {
  if (!task.value) return;
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    const { data } = await api.patch<Task>(`/tasks/${task.value.id}`, {
      title: form.title,
      assigneeMemberId: form.assigneeMemberId,
      dueAt: fromDatetimeLocal(form.dueAt, tz.value),
      recurrence: form.recurrence,
    });
    task.value = data;
    notice.value = "Сохранено";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function complete() {
  if (!task.value) return;
  loading.value = true;
  error.value = "";
  try {
    const { data } = await api.post<Task>(`/tasks/${task.value.id}/complete`);
    task.value = data;
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function reopen() {
  if (!task.value) return;
  loading.value = true;
  error.value = "";
  try {
    const { data } = await api.post<Task>(`/tasks/${task.value.id}/reopen`);
    task.value = data;
    notice.value = "Снова открыто";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function remove() {
  if (!task.value) return;
  if (!confirm("Удалить дело?")) return;
  loading.value = true;
  try {
    await api.delete(`/tasks/${task.value.id}`);
    await router.push("/tasks");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.divider {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 4px 0;
}
</style>
