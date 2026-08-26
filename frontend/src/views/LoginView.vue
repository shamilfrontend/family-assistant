<template>
  <div class="guest">
    <form class="card stack auth-card" @submit.prevent="onSubmit">
      <BrandLogo />
      <div>
        <h1>Вход</h1>
        <p class="muted">Семейный ассистент для общего календаря</p>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <label>Email <input v-model="email" type="email" autocomplete="email" required placeholder="anna@mail.ru" /></label>
      <label>Пароль <input v-model="password" type="password" autocomplete="current-password" required placeholder="ваш пароль" /></label>
      <button class="btn" type="submit" :disabled="loading">Войти</button>
      <p class="auth-footer muted">
        Нет аккаунта?
        <RouterLink to="/register">Создать семью</RouterLink>
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

const auth = useAuthStore();
const router = useRouter();
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await auth.login({ email: email.value, password: password.value });
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
