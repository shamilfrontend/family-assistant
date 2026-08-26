<template>
  <div class="page stack">
    <div class="card stack">
      <div class="section-head">
        <h1>{{ auth.isAdult ? "Документы" : "Мои документы" }}</h1>
        <button v-if="auth.isAdult" type="button" @click="openCreate">Добавить</button>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <div v-if="items.length === 0" class="empty">
        <p class="muted">{{ auth.isAdult ? "Документов пока нет." : "У вас нет документов." }}</p>
      </div>
      <div v-else class="list">
        <RouterLink v-for="item in items" :key="item.id" :to="`/documents/${item.id}`">
          <span>
            {{ documentTypeLabel(item.type) }}
            <span v-if="ownerName(item)" class="muted"> · {{ ownerName(item) }}</span>
          </span>
          <span class="row meta">
            <span v-if="item.expiresSoon" class="badge badge--rose">скоро истекает</span>
            <span class="muted">{{ item.numberMasked ?? "без номера" }}</span>
          </span>
        </RouterLink>
      </div>
    </div>

    <Modal :open="createOpen" title="Новый документ" @close="createOpen = false">
      <form class="stack" @submit.prevent="create">
        <p v-if="formError" class="alert">{{ formError }}</p>
        <label>
          Владелец
          <select v-model="form.ownerMemberId" required>
            <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
          </select>
        </label>
        <label>
          Тип
          <select v-model="form.type">
            <option v-for="item in DOCUMENT_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>Номер <input v-model="form.number" maxlength="80" placeholder="1234 567890" /></label>
        <label>Дата окончания <input v-model="form.expiresAt" type="date" required /></label>
        <button class="btn" type="submit" :disabled="formLoading">Создать</button>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api, getApiError } from "@/api/client";
import Modal from "@/components/Modal.vue";
import { DOCUMENT_TYPES, documentTypeLabel, type DocumentType, type FamilyDocument } from "@/lib/documents";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const items = ref<FamilyDocument[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const createOpen = ref(false);
const formError = ref("");
const formLoading = ref(false);
const form = reactive({
  ownerMemberId: "",
  type: "PASSPORT" as DocumentType,
  number: "",
  expiresAt: "",
});

function ownerName(item: FamilyDocument) {
  if (!auth.isAdult) return "";
  return members.value.find((m) => m.id === item.ownerMemberId)?.name ?? "";
}

async function load() {
  const [docs, people] = await Promise.all([
    api.get<{ items: FamilyDocument[] }>("/documents"),
    api.get<{ items: { id: string; name: string }[] }>("/members"),
  ]);
  items.value = docs.data.items;
  members.value = people.data.items;
}

onMounted(async () => {
  try {
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
});

function openCreate() {
  formError.value = "";
  form.type = "PASSPORT";
  form.number = "";
  form.expiresAt = "";
  form.ownerMemberId = auth.me?.member.id ?? members.value[0]?.id ?? "";
  createOpen.value = true;
}

async function create() {
  formError.value = "";
  formLoading.value = true;
  try {
    await api.post("/documents", {
      ownerMemberId: form.ownerMemberId,
      type: form.type,
      number: form.number.trim() || undefined,
      expiresAt: form.expiresAt,
    });
    createOpen.value = false;
    await load();
  } catch (err) {
    formError.value = getApiError(err).message;
  } finally {
    formLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.meta {
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}
</style>
