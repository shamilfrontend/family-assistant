<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Здоровье</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-else-if="loading" class="muted">Загрузка…</p>
      <div v-else class="list">
        <RouterLink v-for="item in members" :key="item.id" :to="`/health/${item.id}`">
          <span>{{ item.name }}</span>
          <span class="badge" :class="item.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
            {{ item.role === "ADULT" ? "взрослый" : "ребёнок" }}
          </span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, getApiError } from "@/api/client";

type Member = { id: string; name: string; role: "ADULT" | "CHILD" };

const members = ref<Member[]>([]);
const error = ref("");
const loading = ref(true);

onMounted(async () => {
  try {
    const { data } = await api.get<{ items: Member[] }>("/members");
    members.value = data.items;
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
});
</script>
