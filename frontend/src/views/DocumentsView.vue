<template>
  <div class="page stack">
    <div class="card stack">
      <div class="section-head">
        <h1>{{ auth.isAdult ? "Документы" : "Мои документы" }}</h1>
        <RouterLink v-if="auth.isAdult" to="/documents/new">Добавить</RouterLink>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, getApiError } from "@/api/client";
import { documentTypeLabel, type FamilyDocument } from "@/lib/documents";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const items = ref<FamilyDocument[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");

function ownerName(item: FamilyDocument) {
  if (!auth.isAdult) return "";
  return members.value.find((m) => m.id === item.ownerMemberId)?.name ?? "";
}

onMounted(async () => {
  try {
    const [docs, people] = await Promise.all([
      api.get<{ items: FamilyDocument[] }>("/documents"),
      api.get<{ items: { id: string; name: string }[] }>("/members"),
    ]);
    items.value = docs.data.items;
    members.value = people.data.items;
  } catch (err) {
    error.value = getApiError(err).message;
  }
});
</script>

<style scoped lang="scss">
.meta {
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}
</style>
