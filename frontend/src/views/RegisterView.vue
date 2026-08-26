<template>
  <div class="guest">
    <form class="card stack auth-card" @submit.prevent="onSubmit">
      <BrandLogo />
      <div>
        <h1>Регистрация</h1>
        <p class="muted">Создаётся семья и ваша карточка взрослого</p>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <label>Имя <input v-model="name" required maxlength="80" placeholder="Анна" /></label>
      <label>Дата рождения <input v-model="birthDate" type="date" required /></label>
      <label>Email <input v-model="email" type="email" autocomplete="email" required placeholder="anna@mail.ru" /></label>
      <label>Пароль <input v-model="password" type="password" minlength="8" maxlength="72" required placeholder="не меньше 8 символов" /></label>
      <label>
        Часовой пояс
        <select v-model="timezone">
          <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
        </select>
      </label>
      <label class="checkbox">
        <input v-model="declaredAdult" type="checkbox" />
        Мне есть 18 лет
      </label>
      <button class="btn" type="submit" :disabled="loading">Создать семью</button>
      <p class="auth-footer muted">
        Уже есть вход?
        <RouterLink to="/login">Войти</RouterLink>
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import BrandLogo from "@/components/BrandLogo.vue";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

const timezones = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Vladivostok",
  "Asia/Almaty",
  "UTC",
];

const auth = useAuthStore();
const router = useRouter();
const name = ref("");
const birthDate = ref("");
const email = ref("");
const password = ref("");
const timezone = ref("Europe/Moscow");
const declaredAdult = ref(false);
const error = ref("");
const loading = ref(false);

async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await auth.register({
      name: name.value,
      birthDate: birthDate.value,
      email: email.value,
      password: password.value,
      timezone: timezone.value,
      declaredAdult: declaredAdult.value,
    });
    await router.push("/");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.auth-card {
  gap: 16px;
}

.auth-card h1 {
  margin-bottom: 4px;
}

.auth-card .muted {
  margin: 0;
}

.auth-footer {
  margin: 0;
  text-align: center;
  font-weight: 600;
}

.auth-footer a {
  font-weight: 700;
}
</style>
