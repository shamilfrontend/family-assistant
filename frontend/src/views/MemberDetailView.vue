<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/family/members">← К списку</RouterLink>
    <div v-if="card" class="card stack">
      <div class="meta-row">
        <span class="badge" :class="card.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
          {{ card.role === "ADULT" ? "взрослый" : "ребёнок" }}
        </span>
        <span class="badge" :class="card.hasLogin ? undefined : 'badge--rose'">
          {{ card.hasLogin ? "есть вход" : "без входа" }}
        </span>
      </div>
      <h1>{{ card.name }}</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
      <form class="stack" @submit.prevent="save">
        <label>Имя <input v-model="form.name" required maxlength="80" /></label>
        <label>
          Роль
          <select v-model="form.role">
            <option value="ADULT">взрослый</option>
            <option value="CHILD">ребёнок</option>
          </select>
        </label>
        <label>Дата рождения <input v-model="form.birthDate" type="date" required /></label>
        <div class="field-grid field-grid--2">
          <label>Телефон <input v-model="form.phone" /></label>
          <label>Контактный email <input v-model="form.email" /></label>
        </div>
        <label>Аллергии и особенности <textarea v-model="form.allergies" rows="3" /></label>
        <button class="btn" type="submit" :disabled="loading">Сохранить</button>
      </form>
      <hr class="divider" />
      <p class="muted">Удаление карточки сотрёт связанные записи. Последнего взрослого удалить нельзя.</p>
      <button class="btn btn--danger" type="button" :disabled="loading" @click="removeCard">
        Удалить карточку
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";

type Card = {
  id: string;
  name: string;
  role: "ADULT" | "CHILD";
  birthDate: string;
  phone: string | null;
  email: string | null;
  allergies: string | null;
  hasLogin: boolean;
};

const route = useRoute();
const router = useRouter();
const card = ref<Card | null>(null);
const error = ref("");
const notice = ref("");
const loading = ref(false);
const form = reactive({
  name: "",
  role: "CHILD" as "ADULT" | "CHILD",
  birthDate: "",
  phone: "",
  email: "",
  allergies: "",
});

onMounted(async () => {
  const { data } = await api.get<Card>(`/members/${route.params.id}`);
  card.value = data;
  form.name = data.name;
  form.role = data.role;
  form.birthDate = data.birthDate;
  form.phone = data.phone ?? "";
  form.email = data.email ?? "";
  form.allergies = data.allergies ?? "";
});

async function save() {
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    const { data } = await api.patch<Card>(`/members/${route.params.id}`, {
      name: form.name,
      role: form.role,
      birthDate: form.birthDate,
      phone: form.phone,
      email: form.email,
      allergies: form.allergies,
    });
    card.value = data;
    notice.value = "Сохранено";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function removeCard() {
  if (!confirm("Удалить карточку и связанные записи?")) return;
  error.value = "";
  loading.value = true;
  try {
    await api.delete(`/members/${route.params.id}`);
    await router.push("/family/members");
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
