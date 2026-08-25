<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/calendar">← К календарю</RouterLink>
    <form class="card stack" @submit.prevent="save">
      <h1>Новое событие</h1>
      <p class="muted">Общее событие для семьи — увидят выбранные участники.</p>
      <p v-if="error" class="alert">{{ error }}</p>
      <EventFields v-if="form" v-model="form" :members="members" />
      <button class="btn" type="submit" :disabled="loading">Создать</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import EventFields from "@/components/EventFields.vue";
import { emptyForm, eventLink, formPayload, type EventFormState, type Occurrence } from "@/lib/events";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const router = useRouter();
const error = ref("");
const loading = ref(false);
const members = ref<{ id: string; name: string }[]>([]);
const form = ref<EventFormState | null>(null);

onMounted(async () => {
  if (!auth.me) return;
  const { data } = await api.get<{ items: { id: string; name: string }[] }>("/members");
  members.value = data.items;
  form.value = emptyForm(auth.me.family.timezone, auth.me.member.id);
});

async function save() {
  if (!form.value || !auth.me) return;
  if (form.value.participantIds.length < 1) {
    error.value = "Нужен хотя бы один участник";
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    const { data } = await api.post<Occurrence>("/events", formPayload(form.value, auth.me.family.timezone));
    await router.push(eventLink(data));
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>
