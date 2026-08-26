<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Профиль</h1>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="notice" class="alert alert--ok">{{ notice }}</p>
      <template v-if="card">
        <p class="profile-meta">
          <span class="name">{{ card.name }}</span>
          <span class="badge" :class="card.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
            {{ card.role === "ADULT" ? "взрослый" : "ребёнок" }}
          </span>
        </p>
        <p class="muted">{{ auth.me?.user.email }}</p>
        <p>Дата рождения: {{ card.birthDate }}</p>
        <p v-if="card.phone">Телефон: {{ card.phone }}</p>
        <p v-if="card.allergies">Особенности: {{ card.allergies }}</p>
      </template>
      <form v-if="auth.isAdult && card" class="stack" @submit.prevent="save">
        <label>Имя <input v-model="form.name" required maxlength="80" placeholder="Анна" /></label>
        <label>Дата рождения <input v-model="form.birthDate" type="date" required /></label>
        <label>Телефон <input v-model="form.phone" placeholder="+7 900 123-45-67" /></label>
        <label>Контактный email <input v-model="form.email" type="email" placeholder="anna@mail.ru" /></label>
        <label>Аллергии и особенности <textarea v-model="form.allergies" rows="3" placeholder="орехи, лактоза" /></label>
        <button class="btn" type="submit" :disabled="loading">Сохранить</button>
      </form>
    </div>

    <div class="card stack">
      <h2>Оформление</h2>
      <p class="muted">Светлая тема — по умолчанию; тёмная — как в календарях с мягкими акцентами.</p>
      <div class="theme-switch" role="group" aria-label="Тема">
        <button type="button" :class="{ active: mode === 'light' }" @click="setTheme('light')">Светлая</button>
        <button type="button" :class="{ active: mode === 'dark' }" @click="setTheme('dark')">Тёмная</button>
        <button type="button" :class="{ active: mode === 'system' }" @click="setTheme('system')">Система</button>
      </div>
    </div>

    <div class="card stack">
      <h2>Вход</h2>
      <p class="muted">Удаление входа оставляет карточку в семье. Последний взрослый так уйти не может.</p>
      <div class="row">
        <button class="btn btn--ghost" type="button" :disabled="loading" @click="logout">Выйти</button>
        <button class="btn btn--danger" type="button" :disabled="loading" @click="removeAccount">
          Удалить мой вход
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { useTheme } from "@/lib/theme";
import { useAuthStore } from "@/stores/auth";

type Card = {
  id: string;
  name: string;
  role: "ADULT" | "CHILD";
  birthDate: string;
  phone: string | null;
  email: string | null;
  allergies: string | null;
};

const auth = useAuthStore();
const router = useRouter();
const { mode, setTheme } = useTheme();
const card = ref<Card | null>(null);
const error = ref("");
const notice = ref("");
const loading = ref(false);
const form = reactive({ name: "", birthDate: "", phone: "", email: "", allergies: "" });

onMounted(async () => {
  if (!auth.me) return;
  const { data } = await api.get<Card>(`/members/${auth.me.member.id}`);
  card.value = data;
  form.name = data.name;
  form.birthDate = data.birthDate;
  form.phone = data.phone ?? "";
  form.email = data.email ?? "";
  form.allergies = data.allergies ?? "";
});

async function save() {
  if (!auth.me) return;
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    const { data } = await api.patch<Card>(`/members/${auth.me.member.id}`, {
      name: form.name,
      birthDate: form.birthDate,
      phone: form.phone,
      email: form.email,
      allergies: form.allergies,
    });
    card.value = data;
    await auth.loadMe();
    notice.value = "Сохранено";
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function logout() {
  error.value = "";
  loading.value = true;
  try {
    await auth.logout();
    await router.push("/login");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function removeAccount() {
  if (!confirm("Удалить вход? Карточка останется в семье.")) return;
  error.value = "";
  loading.value = true;
  try {
    await api.delete("/auth/account");
    auth.me = null;
    await router.push("/login");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>
