<template>
  <div class="page stack">
    <RouterLink v-if="auth.isAdult" class="back-link" to="/health">← К списку</RouterLink>
    <div v-if="denied" class="card stack">
      <h1>{{ denied }}</h1>
      <p class="muted">Здоровье недоступно.</p>
    </div>
    <p v-else-if="pageLoading" class="muted">Загрузка…</p>
    <template v-else-if="member">
      <div class="card stack">
        <div class="section-head">
          <h1>{{ auth.isAdult ? member.name : "Моё здоровье" }}</h1>
        </div>
        <p v-if="error" class="alert">{{ error }}</p>
        <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
        <h2>Аллергии и особенности</h2>
        <p v-if="member.allergies">{{ member.allergies }}</p>
        <p v-else class="muted">Не указаны. Их меняют в профиле, не здесь.</p>
      </div>

      <section v-for="group in groups" :key="group.kind" class="card stack">
        <div class="section-head">
          <h2>{{ group.label }}</h2>
          <button v-if="auth.isAdult" type="button" @click="startCreate(group.kind)">Добавить</button>
        </div>
        <div v-if="group.items.length === 0" class="empty">
          <p class="muted">Пока пусто.</p>
        </div>
        <div v-else class="list">
          <div v-for="item in group.items" :key="item.id" class="list-item">
            <button type="button" class="health-open" :disabled="!auth.isAdult" @click="startEdit(item)">
              <span>{{ recordTitle(item) }}</span>
              <span class="muted meta">{{ recordMeta(item) }}</span>
            </button>
            <span class="row">
              <RouterLink v-if="item.kind === 'APPOINTMENT' && item.eventId" :to="eventHref(item)">
                в календарь
              </RouterLink>
              <button
                v-if="auth.isAdult"
                class="linkish"
                type="button"
                :disabled="loading"
                @click="remove(item)"
              >
                удалить
              </button>
            </span>
          </div>
        </div>
      </section>

      <Modal :open="formOpen" :title="editingId ? 'Правка записи' : 'Новая запись'" @close="closeForm">
        <form class="stack" @submit.prevent="save">
          <p v-if="formError" class="alert">{{ formError }}</p>
          <label>
            Вид
            <select v-model="form.kind">
              <option v-for="item in HEALTH_KINDS" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <template v-if="form.kind === 'DOCTOR'">
            <label>Имя врача <input v-model="form.doctorName" required maxlength="120" placeholder="Иванова А. С." /></label>
            <label>Специальность <input v-model="form.specialty" required maxlength="120" placeholder="педиатр" /></label>
            <label>Телефон <input v-model="form.phone" maxlength="120" placeholder="+7 900 123-45-67" /></label>
          </template>
          <template v-else-if="form.kind === 'VACCINATION'">
            <label>Название <input v-model="form.vaccineName" required maxlength="120" placeholder="АКДС" /></label>
            <label>Дата <input v-model="form.vaccinatedAt" type="date" required /></label>
          </template>
          <template v-else-if="form.kind === 'CHECKUP'">
            <label>Тип осмотра <input v-model="form.checkupType" required maxlength="120" placeholder="диспансеризация" /></label>
            <label>Дата <input v-model="form.checkupAt" type="date" required /></label>
            <label>Заметка <textarea v-model="form.note" rows="2" placeholder="взять справку" /></label>
          </template>
          <template v-else>
            <label>Название <input v-model="form.appointmentTitle" required maxlength="120" placeholder="Стоматолог" /></label>
            <label>Дата и время <input v-model="form.appointmentAt" type="datetime-local" required /></label>
          </template>
          <button class="btn" type="submit" :disabled="loading">{{ editingId ? "Сохранить" : "Добавить" }}</button>
        </form>
      </Modal>
    </template>
    <p v-else-if="error" class="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, getApiError } from "@/api/client";
import Modal from "@/components/Modal.vue";
import {
  HEALTH_KINDS,
  emptyHealthForm,
  formFromRecord,
  healthKindLabel,
  healthPayload,
  recordTitle,
  type HealthKind,
  type HealthRecord,
} from "@/lib/health";
import { formatDate, formatTime, fromDatetimeLocal, toDatetimeLocal } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

type MemberCard = {
  id: string;
  name: string;
  role: "ADULT" | "CHILD";
  allergies?: string | null;
};

const auth = useAuthStore();
const route = useRoute();
const member = ref<MemberCard | null>(null);
const items = ref<HealthRecord[]>([]);
const error = ref("");
const notice = ref("");
const denied = ref("");
const loading = ref(false);
const pageLoading = ref(true);
const editingId = ref<string | null>(null);
const formOpen = ref(false);
const formError = ref("");
const form = reactive(emptyHealthForm());

const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const groups = computed(() =>
  (["DOCTOR", "VACCINATION", "CHECKUP", "APPOINTMENT"] as HealthKind[]).map((kind) => ({
    kind,
    label: healthKindLabel(kind),
    items: sortRecords(kind, items.value.filter((item) => item.kind === kind)),
  })),
);

function sortRecords(kind: HealthKind, rows: HealthRecord[]) {
  const copy = [...rows];
  if (kind === "DOCTOR") {
    return copy.sort((a, b) => (a.doctorName ?? "").localeCompare(b.doctorName ?? "", "ru"));
  }
  if (kind === "VACCINATION") {
    return copy.sort((a, b) => (b.vaccinatedAt ?? "").localeCompare(a.vaccinatedAt ?? ""));
  }
  if (kind === "CHECKUP") {
    return copy.sort((a, b) => (b.checkupAt ?? "").localeCompare(a.checkupAt ?? ""));
  }
  return copy.sort((a, b) => (b.appointmentAt ?? "").localeCompare(a.appointmentAt ?? ""));
}

function recordMeta(item: HealthRecord) {
  if (item.kind === "DOCTOR") {
    return [item.specialty, item.phone].filter(Boolean).join(" · ");
  }
  if (item.kind === "VACCINATION") return item.vaccinatedAt ?? "";
  if (item.kind === "CHECKUP") {
    return [item.checkupAt, item.note].filter(Boolean).join(" · ");
  }
  if (item.appointmentAt) {
    return `${formatDate(item.appointmentAt, tz.value)} ${formatTime(item.appointmentAt, tz.value)}`;
  }
  return "";
}

function eventHref(item: HealthRecord) {
  const start = item.appointmentAt ? `?occurrenceStart=${encodeURIComponent(item.appointmentAt)}` : "";
  return `/calendar/events/${item.eventId}${start}`;
}

function resetForm() {
  editingId.value = null;
  Object.assign(form, emptyHealthForm());
}

function closeForm() {
  formOpen.value = false;
  formError.value = "";
  resetForm();
}

function startCreate(kind: HealthKind) {
  resetForm();
  formError.value = "";
  Object.assign(form, emptyHealthForm(kind));
  formOpen.value = true;
}

function startEdit(item: HealthRecord) {
  if (!auth.isAdult) return;
  formError.value = "";
  editingId.value = item.id;
  Object.assign(
    form,
    formFromRecord(item, item.appointmentAt ? toDatetimeLocal(item.appointmentAt, tz.value) : ""),
  );
  formOpen.value = true;
}

function appointmentIso() {
  if (form.kind !== "APPOINTMENT" || !form.appointmentAt) return null;
  return fromDatetimeLocal(form.appointmentAt, tz.value);
}

async function load() {
  denied.value = "";
  error.value = "";
  member.value = null;
  items.value = [];
  pageLoading.value = true;
  const memberId = String(route.params.memberId);
  try {
    const [card, records] = await Promise.all([
      api.get<MemberCard>(`/members/${memberId}`),
      api.get<{ items: HealthRecord[] }>("/health-records", { params: { memberId } }),
    ]);
    member.value = card.data;
    items.value = records.data.items;
    resetForm();
  } catch (err) {
    const apiErr = getApiError(err);
    if (apiErr.code === "not_found") denied.value = "Не найдено";
    else if (apiErr.code === "forbidden") denied.value = "Нет доступа";
    else error.value = apiErr.message;
  } finally {
    pageLoading.value = false;
  }
}

watch(() => route.params.memberId, load, { immediate: true });

async function save() {
  const memberId = String(route.params.memberId);
  error.value = "";
  formError.value = "";
  notice.value = "";
  loading.value = true;
  try {
    const payload = { memberId, ...healthPayload(form, appointmentIso()) };
    if (editingId.value) {
      await api.patch(`/health-records/${editingId.value}`, payload);
      notice.value = "Сохранено";
    } else {
      await api.post("/health-records", payload);
      notice.value = "Добавлено";
    }
    formOpen.value = false;
    await load();
  } catch (err) {
    formError.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function remove(item: HealthRecord) {
  if (!confirm("Удалить запись?")) return;
  loading.value = true;
  error.value = "";
  try {
    await api.delete(`/health-records/${item.id}`);
    if (editingId.value === item.id) closeForm();
    items.value = items.value.filter((row) => row.id !== item.id);
    notice.value = "Удалено";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.health-open {
  display: grid;
  justify-items: start;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.health-open:disabled {
  cursor: default;
}

.meta {
  font-size: 0.82rem;
  font-weight: 600;
}

.linkish {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
