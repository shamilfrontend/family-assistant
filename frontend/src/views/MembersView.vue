<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Участники</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <div class="list">
        <RouterLink v-for="item in items" :key="item.id" :to="`/family/members/${item.id}`">
          <span>{{ item.name }}</span>
          <span class="row meta">
            <span class="badge" :class="item.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
              {{ item.role === "ADULT" ? "взрослый" : "ребёнок" }}
            </span>
            <span v-if="!item.hasLogin" class="muted">без входа</span>
          </span>
        </RouterLink>
      </div>
    </div>

    <form class="card stack" @submit.prevent="create">
      <h2>Новая карточка без входа</h2>
      <label>Имя <input v-model="form.name" required maxlength="80" /></label>
      <label>
        Роль
        <select v-model="form.role">
          <option value="CHILD">ребёнок</option>
          <option value="ADULT">взрослый</option>
        </select>
      </label>
      <label>Дата рождения <input v-model="form.birthDate" type="date" required /></label>
      <label>Телефон <input v-model="form.phone" /></label>
      <label>Особенности <textarea v-model="form.allergies" rows="2" /></label>
      <button class="btn" type="submit" :disabled="loading">Добавить</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api, getApiError } from "@/api/client";

type Member = {
  id: string;
  name: string;
  role: "ADULT" | "CHILD";
  hasLogin?: boolean;
};

const items = ref<Member[]>([]);
const error = ref("");
const loading = ref(false);
const form = reactive({
  name: "",
  role: "CHILD" as "ADULT" | "CHILD",
  birthDate: "",
  phone: "",
  allergies: "",
});

async function load() {
  const { data } = await api.get<{ items: Member[] }>("/members");
  items.value = data.items;
}

onMounted(load);

async function create() {
  error.value = "";
  loading.value = true;
  try {
    await api.post("/members", {
      name: form.name,
      role: form.role,
      birthDate: form.birthDate,
      phone: form.phone || undefined,
      allergies: form.allergies || undefined,
    });
    form.name = "";
    form.birthDate = "";
    form.phone = "";
    form.allergies = "";
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.meta {
  gap: 8px;
  flex-wrap: nowrap;
}
</style>
