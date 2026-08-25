<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/documents">← К документам</RouterLink>
    <form class="card stack" @submit.prevent="save">
      <h1>Новый документ</h1>
      <p v-if="error" class="alert">{{ error }}</p>
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
      <label>Номер <input v-model="form.number" maxlength="80" /></label>
      <label>Дата окончания <input v-model="form.expiresAt" type="date" required /></label>
      <button class="btn" type="submit" :disabled="loading">Создать</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { DOCUMENT_TYPES, type DocumentType, type FamilyDocument } from "@/lib/documents";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const error = ref("");
const loading = ref(false);
const members = ref<{ id: string; name: string }[]>([]);
const form = reactive({
  ownerMemberId: "",
  type: "PASSPORT" as DocumentType,
  number: "",
  expiresAt: "",
});

onMounted(async () => {
  if (!auth.me) return;
  const { data } = await api.get<{ items: { id: string; name: string }[] }>("/members");
  members.value = data.items;
  form.ownerMemberId = auth.me.member.id;
});

async function save() {
  error.value = "";
  loading.value = true;
  try {
    const { data } = await api.post<FamilyDocument>("/documents", {
      ownerMemberId: form.ownerMemberId,
      type: form.type,
      number: form.number.trim() || undefined,
      expiresAt: form.expiresAt,
    });
    await router.push(`/documents/${data.id}`);
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>
