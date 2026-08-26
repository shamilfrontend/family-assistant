<template>
  <div class="guest">
    <div class="card stack">
      <BrandLogo />
      <h1>Приглашение</h1>
      <p v-if="expired" class="alert">Ссылка недействительна: истекла, отозвана или уже использована.</p>
      <template v-else-if="preview">
        <p class="profile-meta">
          <span class="badge" :class="preview.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
            {{ preview.role === "ADULT" ? "взрослый" : "ребёнок" }}
          </span>
        </p>
        <p v-if="preview.memberName">Карточка: {{ preview.memberName }}</p>
        <p v-else class="muted">Будет создана новая карточка</p>
        <form class="stack" @submit.prevent="onSubmit">
          <p v-if="error" class="alert">{{ error }}</p>
          <label v-if="needsProfile">Имя <input v-model="name" required maxlength="80" placeholder="Анна" /></label>
          <label v-if="needsProfile">Дата рождения <input v-model="birthDate" type="date" required /></label>
          <label>Email <input v-model="email" type="email" required placeholder="anna@mail.ru" /></label>
          <label>Пароль <input v-model="password" type="password" minlength="8" maxlength="72" required placeholder="не меньше 8 символов" /></label>
          <label v-if="preview.role === 'ADULT'" class="checkbox">
            <input v-model="declaredAdult" type="checkbox" />
            Мне есть 18 лет
          </label>
          <button class="btn" type="submit" :disabled="loading">Принять</button>
        </form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BrandLogo from "@/components/BrandLogo.vue";
import { api, getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

type Preview = { role: "ADULT" | "CHILD"; memberName: string | null; expiresAt: string };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const preview = ref<Preview | null>(null);
const expired = ref(false);
const error = ref("");
const loading = ref(false);
const name = ref("");
const birthDate = ref("");
const email = ref("");
const password = ref("");
const declaredAdult = ref(false);
const needsProfile = computed(() => preview.value !== null && preview.value.memberName === null);

onMounted(async () => {
  try {
    const { data } = await api.get<Preview>("/auth/invite-preview", {
      params: { token: route.params.token },
    });
    preview.value = data;
  } catch {
    expired.value = true;
  }
});

async function onSubmit() {
  if (!preview.value) return;
  error.value = "";
  loading.value = true;
  try {
    const payload: Record<string, unknown> = {
      token: route.params.token,
      email: email.value,
      password: password.value,
    };
    if (needsProfile.value) {
      payload.name = name.value;
      payload.birthDate = birthDate.value;
    }
    if (preview.value.role === "ADULT") payload.declaredAdult = declaredAdult.value;
    await auth.acceptInvite(payload);
    await router.push("/");
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>
