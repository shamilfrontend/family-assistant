<template>
  <Modal :open="open" title="Новое событие" @close="emit('close')">
    <form class="stack" @submit.prevent="save">
      <p class="muted">Общее событие для семьи — увидят выбранные участники.</p>
      <p v-if="error" class="alert">{{ error }}</p>
      <EventFields v-if="form" v-model="form" :members="members" />
      <button class="btn" type="submit" :disabled="loading || !form">Создать</button>
    </form>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { api, getApiError } from "@/api/client";
import EventFields from "@/components/EventFields.vue";
import Modal from "@/components/Modal.vue";
import { emptyForm, formPayload, type EventFormState } from "@/lib/events";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{
  open: boolean;
  defaultDate?: string;
  defaultTime?: string;
}>();

const emit = defineEmits<{ close: []; created: [] }>();
const auth = useAuthStore();
const error = ref("");
const loading = ref(false);
const members = ref<{ id: string; name: string }[]>([]);
const form = ref<EventFormState | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open || !auth.me) return;
    error.value = "";
    loading.value = false;
    try {
      const { data } = await api.get<{ items: { id: string; name: string }[] }>("/members");
      members.value = data.items;
      const next = emptyForm(auth.me.family.timezone, auth.me.member.id);
      if (props.defaultDate) next.date = props.defaultDate;
      if (props.defaultTime) next.time = props.defaultTime;
      form.value = next;
    } catch (err) {
      error.value = getApiError(err).message;
    }
  },
);

async function save() {
  if (!form.value || !auth.me) return;
  if (form.value.participantIds.length < 1) {
    error.value = "Нужен хотя бы один участник";
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    await api.post("/events", formPayload(form.value, auth.me.family.timezone));
    emit("created");
    emit("close");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>
