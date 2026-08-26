<template>
  <div class="page stack">
    <RouterLink class="back-link" to="/family">← К списку</RouterLink>
    <div v-if="denied" class="card stack">
      <h1>{{ denied }}</h1>
      <p class="muted">Карточка недоступна.</p>
    </div>
    <div v-else-if="card" class="card stack">
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
        <label>Имя <input v-model="form.name" required maxlength="80" placeholder="Анна" /></label>
        <label>
          Роль
          <select v-model="form.role">
            <option value="ADULT">взрослый</option>
            <option value="CHILD">ребёнок</option>
          </select>
        </label>
        <label>Дата рождения <input v-model="form.birthDate" type="date" required /></label>
        <div class="field-grid field-grid--2">
          <label>Телефон <input v-model="form.phone" placeholder="+7 900 123-45-67" /></label>
          <label>Контактный email <input v-model="form.email" placeholder="anna@mail.ru" /></label>
        </div>
        <label>Аллергии и особенности <textarea v-model="form.allergies" rows="3" placeholder="орехи, лактоза" /></label>
        <button class="btn" type="submit" :disabled="loading">Сохранить</button>
      </form>
      <hr class="divider" />
      <p class="muted">Удаление карточки сотрёт связанные записи. Последнего взрослого удалить нельзя.</p>
      <button class="btn btn--danger" type="button" :disabled="loading" @click="removeCard">
        Удалить карточку
      </button>
    </div>
    <p v-else-if="error" class="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { useConfirm } from "@/composables/useConfirm";

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
const { confirm } = useConfirm();
const card = ref<Card | null>(null);
const denied = ref("");
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
  try {
    const { data } = await api.get<Card>(`/members/${route.params.id}`);
    card.value = data;
    form.name = data.name;
    form.role = data.role;
    form.birthDate = data.birthDate;
    form.phone = data.phone ?? "";
    form.email = data.email ?? "";
    form.allergies = data.allergies ?? "";
  } catch (err) {
    const apiErr = getApiError(err);
    if (apiErr.code === "not_found") denied.value = "Не найдено";
    else if (apiErr.code === "forbidden") denied.value = "Нет доступа";
    else error.value = apiErr.message;
  }
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
  if (
    !(await confirm({
      title: "Удалить карточку и связанные записи?",
      confirmLabel: "Удалить",
      danger: true,
    }))
  ) {
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    await api.delete(`/members/${route.params.id}`);
    await router.push("/family");
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
