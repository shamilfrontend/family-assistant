<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Семья</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="family" class="muted">Текущий пояс: <strong>{{ family.timezone }}</strong></p>
      <form class="stack" @submit.prevent="saveTz">
        <label>
          Часовой пояс
          <select v-model="timezone">
            <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
          </select>
        </label>
        <button class="btn" type="submit" :disabled="loading">Сохранить пояс</button>
      </form>
      <p class="muted">Смена пояса не пересчитывает уже сохранённые события.</p>
    </div>

    <div class="card stack danger-zone">
      <h2>Удалить семью</h2>
      <p class="muted">Сотрётся всё, что относится к этой семье, включая входы.</p>
      <button class="btn btn--ghost" type="button" @click="loadPreview">Показать, что сотрётся</button>
      <ul v-if="preview" class="preview-list">
        <li v-for="(count, key) in preview" :key="key">
          <span>{{ labels[key] }}</span>
          <span class="badge badge--rose">{{ count }}</span>
        </li>
      </ul>
      <button v-if="preview" class="btn btn--danger" type="button" :disabled="loading" @click="removeFamily">
        Удалить семью
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

const timezones = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Vladivostok",
  "Asia/Almaty",
  "UTC",
];

const labels: Record<string, string> = {
  members: "люди",
  events: "события",
  tasks: "дела",
  purchases: "покупки",
  documents: "документы",
  healthRecords: "мед. записи",
  chats: "чаты",
};

const auth = useAuthStore();
const router = useRouter();
const family = ref<{ id: string; timezone: string } | null>(null);
const timezone = ref("Europe/Moscow");
const preview = ref<Record<string, number> | null>(null);
const error = ref("");
const loading = ref(false);

onMounted(async () => {
  const { data } = await api.get<{ id: string; timezone: string }>("/family");
  family.value = data;
  timezone.value = data.timezone;
});

async function saveTz() {
  error.value = "";
  loading.value = true;
  try {
    const { data } = await api.patch("/family", { timezone: timezone.value });
    family.value = data;
    await auth.loadMe();
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function loadPreview() {
  error.value = "";
  const { data } = await api.get<Record<string, number>>("/family/deletion-preview");
  preview.value = data;
}

async function removeFamily() {
  if (!preview.value) return;
  if (!confirm("Удалить семью безвозвратно?")) return;
  error.value = "";
  loading.value = true;
  try {
    await api.delete("/family", {
      data: {
        confirm: true,
        acknowledge: Object.keys(preview.value),
      },
    });
    auth.me = null;
    await router.push("/register");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.preview-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid var(--line);
  font-weight: 600;
}

.preview-list li:last-child {
  border-bottom: 0;
}

.danger-zone h2 {
  color: var(--danger);
}
</style>
