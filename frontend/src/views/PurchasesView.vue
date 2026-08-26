<template>
  <div class="page stack purchases">
    <div class="card stack">
      <div class="section-head">
        <h1>Покупки</h1>
      </div>
      <label class="filter">
        Показывать
        <select v-model="hideBought" @change="load">
          <option :value="false">все</option>
          <option :value="true">скрыть купленное</option>
        </select>
      </label>
      <p v-if="error" class="alert">{{ error }}</p>
      <form class="add" @submit.prevent="add">
        <input
          ref="titleInput"
          v-model="title"
          type="text"
          maxlength="120"
          placeholder="Молоко"
          autocomplete="off"
          required
        />
        <button class="btn add-btn" type="submit" :disabled="loading" aria-label="Добавить">+</button>
      </form>
    </div>

    <div class="card stack">
      <div v-if="items.length === 0" class="empty">
        <p class="muted">Список пуст. Добавьте название выше.</p>
      </div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.id" class="list-item" :class="{ bought: item.isBought }">
          <label class="check">
            <input
              type="checkbox"
              :checked="item.isBought"
              :disabled="item.isBought && !auth.isAdult"
              @change="toggleBought(item, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ item.title }}</span>
          </label>
          <span class="row actions">
            <button
              v-if="canEdit(item)"
              class="linkish"
              type="button"
              @click="rename(item)"
            >
              изменить
            </button>
            <button
              v-if="canDelete(item)"
              class="linkish danger"
              type="button"
              @click="remove(item)"
            >
              удалить
            </button>
          </span>
        </div>
      </div>
      <button
        v-if="auth.isAdult && items.some((i) => i.isBought)"
        class="btn btn--ghost"
        type="button"
        :disabled="loading"
        @click="clearBought"
      >
        Очистить купленное
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { api, getApiError } from "@/api/client";
import { useConfirm } from "@/composables/useConfirm";
import { useAuthStore } from "@/stores/auth";

type Purchase = {
  id: string;
  title: string;
  category: string;
  quantity: number | null;
  isBought: boolean;
  addedByMemberId: string | null;
  createdAt: string;
};

const auth = useAuthStore();
const { confirm } = useConfirm();
const items = ref<Purchase[]>([]);
const title = ref("");
const hideBought = ref(false);
const error = ref("");
const loading = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);

function canEdit(item: Purchase) {
  if (auth.isAdult) return true;
  return item.addedByMemberId === auth.me?.member.id && !item.isBought;
}

function canDelete(item: Purchase) {
  if (auth.isAdult) return true;
  return item.addedByMemberId === auth.me?.member.id && !item.isBought;
}

async function load() {
  const query = hideBought.value ? "?bought=false" : "";
  const { data } = await api.get<{ items: Purchase[] }>(`/purchases${query}`);
  items.value = data.items;
}

onMounted(async () => {
  await load();
  await nextTick();
  titleInput.value?.focus();
});

async function add() {
  error.value = "";
  loading.value = true;
  try {
    await api.post("/purchases", { title: title.value });
    title.value = "";
    await load();
    titleInput.value?.focus();
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}

async function toggleBought(item: Purchase, checked: boolean) {
  error.value = "";
  if (!auth.isAdult && !checked) {
    await load();
    return;
  }
  try {
    await api.patch(`/purchases/${item.id}`, { isBought: checked });
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
    await load();
  }
}

async function rename(item: Purchase) {
  const next = window.prompt("Название", item.title)?.trim();
  if (!next || next === item.title) return;
  error.value = "";
  try {
    await api.patch(`/purchases/${item.id}`, { title: next });
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

async function remove(item: Purchase) {
  if (
    !(await confirm({
      title: "Удалить покупку?",
      confirmLabel: "Удалить",
      danger: true,
    }))
  ) {
    return;
  }
  error.value = "";
  try {
    await api.delete(`/purchases/${item.id}`);
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

async function clearBought() {
  if (
    !(await confirm({
      title: "Убрать все купленные позиции?",
      confirmLabel: "Убрать",
      danger: true,
    }))
  ) {
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    await api.post("/purchases/clear-bought");
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.add {
  display: flex;
  gap: 8px;
}

.add input {
  flex: 1;
}

.add-btn {
  width: 48px;
  padding: 0;
  flex-shrink: 0;
  font-size: 1.4rem;
  line-height: 1;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-weight: 700;
}

.check input {
  width: auto;
}

.bought span {
  color: var(--muted);
  text-decoration: line-through;
}

.actions {
  gap: 8px;
  flex-shrink: 0;
}

.linkish {
  background: none;
  border: 0;
  padding: 0;
  color: var(--accent-text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.linkish.danger {
  color: var(--danger);
}
</style>
