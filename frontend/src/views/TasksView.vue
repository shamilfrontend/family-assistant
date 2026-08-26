<template>
  <div class="page stack">
    <div class="card stack">
      <div class="section-head">
        <h1>{{ auth.isAdult ? "Дела" : "Мои дела" }}</h1>
        <button v-if="auth.isAdult" type="button" @click="openCreate">Добавить</button>
      </div>
      <label v-if="auth.isAdult" class="hide">
        <input v-model="onlyOpen" type="checkbox" @change="load" />
        только открытые
      </label>
      <p v-if="error" class="alert">{{ error }}</p>
      <div v-if="items.length === 0" class="empty">
        <p class="muted">{{ auth.isAdult ? "Дел пока нет." : "У вас нет дел." }}</p>
      </div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.id" class="list-item" :class="{ done: item.status === 'DONE' }">
          <label class="check">
            <input
              type="checkbox"
              :checked="item.status === 'DONE'"
              :disabled="item.status === 'DONE' && !auth.isAdult"
              @change="toggle(item, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ item.title }}</span>
          </label>
          <RouterLink class="muted meta" :to="`/tasks/${item.id}`">
            {{ when(item) }}
          </RouterLink>
        </div>
      </div>
    </div>

    <Modal :open="createOpen" title="Новое дело" @close="createOpen = false">
      <form class="stack" @submit.prevent="create">
        <p v-if="formError" class="alert">{{ formError }}</p>
        <label>Название <input v-model="form.title" required maxlength="120" placeholder="Собрать портфель" /></label>
        <div class="field-grid field-grid--2">
          <label>
            Исполнитель
            <select v-model="form.assigneeMemberId" required>
              <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
            </select>
          </label>
          <label>
            Повтор
            <select v-model="form.recurrence">
              <option v-for="item in TASK_RECURRENCE" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
        </div>
        <label>Срок <input v-model="form.dueAt" type="datetime-local" required /></label>
        <button class="btn" type="submit" :disabled="formLoading">Добавить</button>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { api, getApiError } from "@/api/client";
import Modal from "@/components/Modal.vue";
import { TASK_RECURRENCE, type Task, type TaskRecurrence } from "@/lib/tasks";
import { familyNow, formatDate, formatTime, fromDatetimeLocal, hm, ymd } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const items = ref<Task[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const onlyOpen = ref(true);
const createOpen = ref(false);
const formError = ref("");
const formLoading = ref(false);
const form = reactive({
  title: "",
  assigneeMemberId: "",
  dueAt: "",
  recurrence: "NONE" as TaskRecurrence,
});

function when(item: Task) {
  const assignee = members.value.find((m) => m.id === item.assigneeMemberId)?.name;
  const date = `${formatDate(item.dueAt, tz.value)} ${formatTime(item.dueAt, tz.value)}`;
  return assignee && auth.isAdult ? `${assignee} · ${date}` : date;
}

function defaultDueAt() {
  const now = familyNow(tz.value).set({ second: 0, millisecond: 0 });
  return `${ymd(now)}T${hm(now)}`;
}

async function load() {
  error.value = "";
  try {
    const params = auth.isAdult && onlyOpen.value ? { status: "OPEN" } : {};
    const [tasks, people] = await Promise.all([
      api.get<{ items: Task[] }>("/tasks", { params }),
      api.get<{ items: { id: string; name: string }[] }>("/members"),
    ]);
    items.value = tasks.data.items;
    members.value = people.data.items;
    if (!form.assigneeMemberId && auth.me) form.assigneeMemberId = auth.me.member.id;
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

onMounted(() => {
  form.dueAt = defaultDueAt();
  void load();
});

function openCreate() {
  formError.value = "";
  form.title = "";
  form.recurrence = "NONE";
  form.dueAt = defaultDueAt();
  if (auth.me) form.assigneeMemberId = auth.me.member.id;
  createOpen.value = true;
}

async function create() {
  if (!auth.me) return;
  formError.value = "";
  formLoading.value = true;
  try {
    await api.post("/tasks", {
      title: form.title,
      assigneeMemberId: form.assigneeMemberId,
      dueAt: fromDatetimeLocal(form.dueAt, tz.value),
      recurrence: form.recurrence,
    });
    createOpen.value = false;
    await load();
  } catch (err) {
    formError.value = getApiError(err).message;
  } finally {
    formLoading.value = false;
  }
}

async function toggle(item: Task, checked: boolean) {
  error.value = "";
  try {
    if (checked) await api.post(`/tasks/${item.id}/complete`);
    else await api.post(`/tasks/${item.id}/reopen`);
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}
</script>

<style scoped lang="scss">
.hide {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: var(--muted);
}

.done span {
  text-decoration: line-through;
  color: var(--muted);
}

.meta {
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
