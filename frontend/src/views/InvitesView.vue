<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Приглашения</h1>
      <p class="muted">Ссылка показывается один раз — сразу скопируйте её.</p>
      <p v-if="error" class="alert">{{ error }}</p>
      <p v-if="created" class="alert alert--ok">
        Ссылка:
        <span class="mono">{{ created.url }}</span>
      </p>
      <div v-if="items.length" class="list">
        <div v-for="item in items" :key="item.id" class="list-item">
          <span class="meta-row">
            <span class="badge" :class="item.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
              {{ item.role === "ADULT" ? "взрослый" : "ребёнок" }}
            </span>
            <span class="muted expires">до {{ formatExpiry(item.expiresAt) }}</span>
          </span>
          <button class="btn btn--ghost" type="button" @click="revoke(item.id)">Отозвать</button>
        </div>
      </div>
      <p v-else class="muted">Нет активных приглашений</p>
    </div>

    <form class="card stack" @submit.prevent="create">
      <h2>Выдать ссылку</h2>
      <div class="field-grid field-grid--2">
        <label>
          Роль
          <select v-model="form.role">
            <option value="ADULT">взрослый</option>
            <option value="CHILD">ребёнок</option>
          </select>
        </label>
        <label>
          Карточка
          <select v-model="form.memberId">
            <option value="">Новая карточка</option>
            <option v-for="m in openCards" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </label>
      </div>
      <button class="btn" type="submit" :disabled="loading">Создать ссылку</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { api, getApiError } from "@/api/client";
import { formatDate } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

type Invite = { id: string; role: "ADULT" | "CHILD"; memberId: string | null; expiresAt: string };
type Member = { id: string; name: string; role: "ADULT" | "CHILD"; hasLogin?: boolean };

const auth = useAuthStore();
const items = ref<Invite[]>([]);
const members = ref<Member[]>([]);
const created = ref<{ url: string } | null>(null);
const error = ref("");
const loading = ref(false);
const form = reactive({ role: "CHILD" as "ADULT" | "CHILD", memberId: "" });
const openCards = computed(() =>
  members.value.filter((m) => !m.hasLogin && m.role === form.role),
);

function formatExpiry(iso: string): string {
  const tz = auth.me?.family.timezone ?? "UTC";
  return formatDate(iso, tz);
}

async function load() {
  const [inv, mem] = await Promise.all([
    api.get<{ items: Invite[] }>("/invites"),
    api.get<{ items: Member[] }>("/members"),
  ]);
  items.value = inv.data.items;
  members.value = mem.data.items;
}

onMounted(load);

async function create() {
  error.value = "";
  created.value = null;
  loading.value = true;
  try {
    const { data } = await api.post("/invites", {
      role: form.role,
      memberId: form.memberId || undefined,
    });
    created.value = data;
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function revoke(id: string) {
  error.value = "";
  try {
    await api.post(`/invites/${id}/revoke`);
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}
</script>

<style scoped lang="scss">
.expires {
  font-size: 0.85rem;
  font-weight: 600;
}

.list-item {
  align-items: center;
}
</style>
