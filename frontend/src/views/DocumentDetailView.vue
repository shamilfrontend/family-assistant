<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/documents">← К документам</RouterLink>
    <div v-if="denied" class="card stack">
      <h1>{{ denied }}</h1>
      <p class="muted">Документ недоступен.</p>
    </div>
    <div v-else-if="doc" class="card stack">
      <div class="meta-row">
        <span class="badge badge--blue">{{ documentTypeLabel(doc.type) }}</span>
        <span v-if="doc.expiresSoon" class="badge badge--rose">скоро истекает</span>
      </div>
      <h1>{{ documentTypeLabel(doc.type) }}</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
      <p>Владелец: {{ ownerName }}</p>
      <p>Номер: {{ numberText }}</p>
      <p>Истекает: {{ doc.expiresAt }}</p>

      <template v-if="auth.isAdult">
        <hr class="divider" />
        <form class="stack" @submit.prevent="save">
          <label>
            Владелец
            <select v-model="form.ownerMemberId">
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
          <div class="row">
            <button class="btn" type="submit" :disabled="loading">Сохранить</button>
            <button class="btn btn--danger" type="button" :disabled="loading" @click="remove">Удалить</button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { DOCUMENT_TYPES, documentTypeLabel, type FamilyDocument } from "@/lib/documents";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const doc = ref<FamilyDocument | null>(null);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const notice = ref("");
const denied = ref("");
const loading = ref(false);
const form = reactive({
  ownerMemberId: "",
  type: "PASSPORT" as FamilyDocument["type"],
  number: "",
  expiresAt: "",
});

const ownerName = computed(
  () => members.value.find((m) => m.id === doc.value?.ownerMemberId)?.name ?? "участник",
);
const numberText = computed(() => {
  if (!doc.value) return "";
  if (auth.isAdult && doc.value.number) return doc.value.number;
  return doc.value.numberMasked ?? "не указан";
});

async function load() {
  denied.value = "";
  error.value = "";
  try {
    const { data } = await api.get<FamilyDocument>(`/documents/${route.params.id}`);
    doc.value = data;
    const people = await api.get<{ items: { id: string; name: string }[] }>("/members");
    members.value = people.data.items;
    form.ownerMemberId = data.ownerMemberId;
    form.type = data.type;
    form.number = data.number ?? "";
    form.expiresAt = data.expiresAt;
  } catch (err) {
    const apiErr = getApiError(err);
    if (apiErr.code === "not_found") denied.value = "Не найдено";
    else if (apiErr.code === "forbidden") denied.value = "Нет доступа";
    else error.value = apiErr.message;
  }
}

watch(() => route.params.id, load, { immediate: true });

async function save() {
  if (!doc.value) return;
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    await api.patch(`/documents/${doc.value.id}`, {
      ownerMemberId: form.ownerMemberId,
      type: form.type,
      number: form.number.trim() || null,
      expiresAt: form.expiresAt,
    });
    const { data } = await api.get<FamilyDocument>(`/documents/${doc.value.id}`);
    doc.value = data;
    form.number = data.number ?? "";
    notice.value = "Сохранено";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function remove() {
  if (!doc.value) return;
  if (!confirm("Удалить документ?")) return;
  loading.value = true;
  try {
    await api.delete(`/documents/${doc.value.id}`);
    await router.push("/documents");
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
