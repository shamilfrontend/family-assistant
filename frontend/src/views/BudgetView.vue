<template>
  <div class="page stack">
    <div class="card stack">
      <div class="section-head">
        <h1>Бюджет</h1>
        <div class="row">
          <button class="btn btn--ghost" type="button" @click="openCategories">Категории</button>
          <button type="button" @click="openCreate">Добавить</button>
        </div>
      </div>
      <div class="month-nav">
        <button class="btn btn--ghost" type="button" aria-label="Предыдущий месяц" @click="moveMonth(-1)">
          ←
        </button>
        <p class="month-label">{{ formatMonthTitle(month) }}</p>
        <button class="btn btn--ghost" type="button" aria-label="Следующий месяц" @click="moveMonth(1)">
          →
        </button>
      </div>
      <p class="total">{{ formatMoney(summary?.total ?? 0) }}</p>
      <p v-if="error" class="alert">{{ error }}</p>
    </div>

    <div class="card stack">
      <h2>По категориям</h2>
      <div v-if="!summary || !summary.byCategory.some((row) => row.total > 0)" class="empty">
        <p class="muted">Пока нет расходов в этом месяце.</p>
      </div>
      <div v-else class="list">
        <div v-for="row in summary?.byCategory" :key="row.id" class="list-item">
          <span>{{ row.name }}</span>
          <span class="muted">{{ formatMoney(row.total) }}</span>
        </div>
      </div>
    </div>

    <div class="card stack">
      <h2>Кто сколько</h2>
      <div class="list">
        <div v-for="row in summary?.byMember" :key="row.memberId" class="list-item">
          <span>{{ row.name }}</span>
          <span class="muted">{{ formatMoney(row.total) }}</span>
        </div>
      </div>
    </div>

    <div class="card stack">
      <h2>Расходы</h2>
      <div v-if="items.length === 0" class="empty">
        <p class="muted">Расходов в этом месяце нет.</p>
      </div>
      <div v-else class="list">
        <div v-for="item in items" :key="item.id" class="list-item expense">
          <div>
            <p class="expense-title">{{ item.title }}</p>
            <p class="muted meta">{{ item.categoryName }} · {{ item.spentByName }} · {{ formatDay(item.spentAt) }}</p>
          </div>
          <div class="expense-side">
            <span>{{ formatMoney(item.amount) }}</span>
            <span class="row actions">
              <button class="linkish" type="button" @click="openEdit(item)">изменить</button>
              <button class="linkish danger" type="button" @click="removeExpense(item)">удалить</button>
            </span>
          </div>
        </div>
      </div>
    </div>

    <Modal :open="formOpen" :title="editingId ? 'Расход' : 'Новый расход'" @close="formOpen = false">
      <form class="stack" @submit.prevent="saveExpense">
        <p v-if="formError" class="alert">{{ formError }}</p>
        <label>Название <input v-model="form.title" required maxlength="80" placeholder="Молоко" /></label>
        <label>Сумма, ₽ <input v-model.number="form.amount" type="number" min="0.01" step="0.01" required /></label>
        <label>
          Категория
          <select v-model="form.categoryId" required>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </label>
        <label>
          Кто потратил
          <select v-model="form.spentByMemberId" required>
            <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
          </select>
        </label>
        <label>Дата <input v-model="form.spentAt" type="date" required /></label>
        <button class="btn" type="submit" :disabled="formLoading">{{ editingId ? "Сохранить" : "Добавить" }}</button>
      </form>
    </Modal>

    <Modal :open="categoriesOpen" title="Категории" @close="categoriesOpen = false">
      <div class="stack">
        <p v-if="categoryError" class="alert">{{ categoryError }}</p>
        <div v-for="cat in categories" :key="cat.id" class="list-item">
          <input v-model="cat.name" maxlength="40" aria-label="Название категории" @change="renameCategory(cat)" />
          <button class="linkish danger" type="button" @click="removeCategory(cat)">удалить</button>
        </div>
        <form class="add-cat" @submit.prevent="addCategory">
          <input v-model="newCategory" maxlength="40" placeholder="Новая категория" />
          <button class="btn" type="submit" :disabled="categoryLoading || !newCategory.trim()">Добавить</button>
        </form>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { DateTime } from "luxon";
import { computed, onMounted, reactive, ref } from "vue";
import { api, getApiError } from "@/api/client";
import Modal from "@/components/Modal.vue";
import { useConfirm } from "@/composables/useConfirm";
import {
  formatMoney,
  formatMonthTitle,
  shiftMonth,
  type BudgetCategory,
  type BudgetExpense,
  type BudgetSummary,
} from "@/lib/budget";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { confirm } = useConfirm();
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const month = ref(DateTime.now().setZone(tz.value).toFormat("yyyy-MM"));
const summary = ref<BudgetSummary | null>(null);
const items = ref<BudgetExpense[]>([]);
const categories = ref<BudgetCategory[]>([]);
const members = ref<{ id: string; name: string }[]>([]);
const error = ref("");
const formOpen = ref(false);
const formError = ref("");
const formLoading = ref(false);
const editingId = ref<string | null>(null);
const categoriesOpen = ref(false);
const categoryError = ref("");
const categoryLoading = ref(false);
const newCategory = ref("");
const form = reactive({
  title: "",
  amount: 0,
  categoryId: "",
  spentByMemberId: "",
  spentAt: "",
});

function formatDay(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

async function load() {
  error.value = "";
  const [sum, list, cats, people] = await Promise.all([
    api.get<BudgetSummary>("/budget/summary", { params: { month: month.value } }),
    api.get<{ items: BudgetExpense[] }>("/budget/expenses", { params: { month: month.value } }),
    api.get<{ items: BudgetCategory[] }>("/budget/categories"),
    api.get<{ items: { id: string; name: string }[] }>("/members"),
  ]);
  summary.value = sum.data;
  items.value = list.data.items;
  categories.value = cats.data.items;
  members.value = people.data.items;
}

onMounted(async () => {
  try {
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
});

async function moveMonth(delta: number) {
  month.value = shiftMonth(month.value, delta);
  try {
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

function resetForm() {
  formError.value = "";
  form.title = "";
  form.amount = 0;
  form.categoryId = categories.value[0]?.id ?? "";
  form.spentByMemberId = auth.me?.member.id ?? members.value[0]?.id ?? "";
  form.spentAt = DateTime.now().setZone(tz.value).toISODate() ?? "";
}

function openCreate() {
  editingId.value = null;
  resetForm();
  formOpen.value = true;
}

function openEdit(item: BudgetExpense) {
  editingId.value = item.id;
  formError.value = "";
  form.title = item.title;
  form.amount = item.amount;
  form.categoryId = item.categoryId;
  form.spentByMemberId = item.spentByMemberId;
  form.spentAt = item.spentAt;
  formOpen.value = true;
}

async function saveExpense() {
  formError.value = "";
  formLoading.value = true;
  const body = {
    title: form.title,
    amount: form.amount,
    categoryId: form.categoryId,
    spentByMemberId: form.spentByMemberId,
    spentAt: form.spentAt,
  };
  try {
    if (editingId.value) {
      await api.patch(`/budget/expenses/${editingId.value}`, body);
    } else {
      await api.post("/budget/expenses", body);
    }
    formOpen.value = false;
    month.value = form.spentAt.slice(0, 7);
    await load();
  } catch (err) {
    formError.value = getApiError(err).message;
  } finally {
    formLoading.value = false;
  }
}

async function removeExpense(item: BudgetExpense) {
  if (
    !(await confirm({
      title: `Удалить «${item.title}»?`,
      confirmLabel: "Удалить",
      danger: true,
    }))
  ) {
    return;
  }
  try {
    await api.delete(`/budget/expenses/${item.id}`);
    await load();
  } catch (err) {
    error.value = getApiError(err).message;
  }
}

function openCategories() {
  categoryError.value = "";
  newCategory.value = "";
  categoriesOpen.value = true;
}

async function addCategory() {
  categoryError.value = "";
  categoryLoading.value = true;
  try {
    await api.post("/budget/categories", { name: newCategory.value.trim() });
    newCategory.value = "";
    await load();
  } catch (err) {
    categoryError.value = getApiError(err).message;
  } finally {
    categoryLoading.value = false;
  }
}

async function renameCategory(cat: BudgetCategory) {
  const name = cat.name.trim();
  if (!name) return;
  categoryError.value = "";
  try {
    await api.patch(`/budget/categories/${cat.id}`, { name });
    await load();
  } catch (err) {
    categoryError.value = getApiError(err).message;
    await load();
  }
}

async function removeCategory(cat: BudgetCategory) {
  if (
    !(await confirm({
      title: `Удалить категорию «${cat.name}»?`,
      confirmLabel: "Удалить",
      danger: true,
    }))
  ) {
    return;
  }
  categoryError.value = "";
  try {
    await api.delete(`/budget/categories/${cat.id}`);
    await load();
  } catch (err) {
    categoryError.value = getApiError(err).message;
  }
}
</script>

<style scoped lang="scss">
.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.month-nav .btn {
  width: 44px;
  padding: 8px 0;
}

.month-label {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  text-align: center;
}

.total {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.expense {
  align-items: flex-start;
}

.expense-title {
  margin: 0 0 4px;
  font-weight: 700;
}

.expense .meta {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.expense-side {
  display: grid;
  justify-items: end;
  gap: 6px;
  flex-shrink: 0;
  font-weight: 700;
}

.actions {
  gap: 8px;
}

.add-cat {
  display: flex;
  gap: 8px;
}

.add-cat input {
  flex: 1;
}

.list-item input {
  flex: 1;
  min-width: 0;
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
