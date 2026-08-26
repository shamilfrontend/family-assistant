<template>
  <div class="page stack">
    <div class="card stack">
      <h1>Настройка семьи</h1>
      <h2>Участники</h2>
      <p v-if="membersError" class="alert">{{ membersError }}</p>
      <div class="list">
        <RouterLink v-for="item in members" :key="item.id" :to="`/family/members/${item.id}`">
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

    <form class="card stack" @submit.prevent="createMember">
      <h2>Новая карточка без входа</h2>
      <label>Имя <input v-model="memberForm.name" required maxlength="80" /></label>
      <label>
        Роль
        <select v-model="memberForm.role">
          <option value="CHILD">ребёнок</option>
          <option value="ADULT">взрослый</option>
        </select>
      </label>
      <label>Дата рождения <input v-model="memberForm.birthDate" type="date" required /></label>
      <label>Телефон <input v-model="memberForm.phone" /></label>
      <label>Особенности <textarea v-model="memberForm.allergies" rows="2" /></label>
      <button class="btn" type="submit" :disabled="membersLoading">Добавить</button>
    </form>

    <div class="card stack">
      <h2>Приглашения</h2>
      <p class="muted">Ссылка показывается один раз — сразу скопируйте её.</p>
      <p v-if="invitesError" class="alert">{{ invitesError }}</p>
      <p v-if="createdInvite" class="alert alert--ok">
        Ссылка:
        <span class="mono">{{ createdInvite.url }}</span>
      </p>
      <div v-if="invites.length" class="list">
        <div v-for="item in invites" :key="item.id" class="list-item">
          <span class="meta-row">
            <span class="badge" :class="item.role === 'ADULT' ? 'badge--blue' : 'badge--lavender'">
              {{ item.role === "ADULT" ? "взрослый" : "ребёнок" }}
            </span>
            <span class="muted expires">до {{ formatExpiry(item.expiresAt) }}</span>
          </span>
          <button class="btn btn--ghost" type="button" @click="revokeInvite(item.id)">Отозвать</button>
        </div>
      </div>
      <p v-else class="muted">Нет активных приглашений</p>
    </div>

    <form class="card stack" @submit.prevent="createInvite">
      <h2>Выдать ссылку</h2>
      <div class="field-grid field-grid--2">
        <label>
          Роль
          <select v-model="inviteForm.role">
            <option value="ADULT">взрослый</option>
            <option value="CHILD">ребёнок</option>
          </select>
        </label>
        <label>
          Карточка
          <select v-model="inviteForm.memberId">
            <option value="">Новая карточка</option>
            <option v-for="m in openCards" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </label>
      </div>
      <button class="btn" type="submit" :disabled="invitesLoading">Создать ссылку</button>
    </form>

    <div class="card stack">
      <h2>Часовой пояс</h2>
      <p v-if="familyError" class="alert">{{ familyError }}</p>
      <p v-if="family" class="muted">Текущий пояс: <strong>{{ family.timezone }}</strong></p>
      <form class="stack" @submit.prevent="saveTz">
        <label>
          Часовой пояс
          <select v-model="timezone">
            <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
          </select>
        </label>
        <button class="btn" type="submit" :disabled="familyLoading">Сохранить пояс</button>
      </form>
      <p class="muted">Смена пояса не пересчитывает уже сохранённые события.</p>
    </div>

    <div class="card stack danger-zone">
      <h2>Удалить семью</h2>
      <p class="muted">Сотрётся всё, что относится к этой семье, включая входы.</p>
      <button class="btn btn--ghost" type="button" @click="loadPreview">Показать, что сотрётся</button>
      <ul v-if="preview" class="preview-list">
        <li v-for="(count, key) in preview" :key="key">
          <span>{{ labels[key] }}</span>
          <span class="badge badge--rose">{{ count }}</span>
        </li>
      </ul>
      <button v-if="preview" class="btn btn--danger" type="button" :disabled="familyLoading" @click="removeFamily">
        Удалить семью
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api, getApiError } from "@/api/client";
import { formatDate } from "@/lib/time";
import { useAuthStore } from "@/stores/auth";

type Member = {
  id: string;
  name: string;
  role: "ADULT" | "CHILD";
  hasLogin?: boolean;
};
type Invite = { id: string; role: "ADULT" | "CHILD"; memberId: string | null; expiresAt: string };

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

const labels: Record<string, string> = {
  members: "люди",
  events: "события",
  tasks: "дела",
  purchases: "покупки",
  documents: "документы",
  healthRecords: "мед. записи",
  chats: "чаты",
};

const auth = useAuthStore();
const router = useRouter();

const members = ref<Member[]>([]);
const membersError = ref("");
const membersLoading = ref(false);
const memberForm = reactive({
  name: "",
  role: "CHILD" as "ADULT" | "CHILD",
  birthDate: "",
  phone: "",
  allergies: "",
});

const invites = ref<Invite[]>([]);
const invitesError = ref("");
const invitesLoading = ref(false);
const createdInvite = ref<{ url: string } | null>(null);
const inviteForm = reactive({ role: "CHILD" as "ADULT" | "CHILD", memberId: "" });
const openCards = computed(() =>
  members.value.filter((m) => !m.hasLogin && m.role === inviteForm.role),
);

const family = ref<{ id: string; timezone: string } | null>(null);
const timezone = ref("Europe/Moscow");
const preview = ref<Record<string, number> | null>(null);
const familyError = ref("");
const familyLoading = ref(false);

function formatExpiry(iso: string): string {
  const tz = auth.me?.family.timezone ?? "UTC";
  return formatDate(iso, tz);
}

async function loadMembers() {
  const { data } = await api.get<{ items: Member[] }>("/members");
  members.value = data.items;
}

async function loadInvites() {
  const { data } = await api.get<{ items: Invite[] }>("/invites");
  invites.value = data.items;
}

onMounted(async () => {
  try {
    const [fam] = await Promise.all([
      api.get<{ id: string; timezone: string }>("/family"),
      loadMembers(),
      loadInvites(),
    ]);
    family.value = fam.data;
    timezone.value = fam.data.timezone;
  } catch (err) {
    familyError.value = getApiError(err).message;
  }
});

async function createMember() {
  membersError.value = "";
  membersLoading.value = true;
  try {
    await api.post("/members", {
      name: memberForm.name,
      role: memberForm.role,
      birthDate: memberForm.birthDate,
      phone: memberForm.phone || undefined,
      allergies: memberForm.allergies || undefined,
    });
    memberForm.name = "";
    memberForm.birthDate = "";
    memberForm.phone = "";
    memberForm.allergies = "";
    await loadMembers();
  } catch (err) {
    membersError.value = getApiError(err).message;
  } finally {
    membersLoading.value = false;
  }
}

async function createInvite() {
  invitesError.value = "";
  createdInvite.value = null;
  invitesLoading.value = true;
  try {
    const { data } = await api.post("/invites", {
      role: inviteForm.role,
      memberId: inviteForm.memberId || undefined,
    });
    createdInvite.value = data;
    await loadInvites();
  } catch (err) {
    invitesError.value = getApiError(err).message;
  } finally {
    invitesLoading.value = false;
  }
}

async function revokeInvite(id: string) {
  invitesError.value = "";
  try {
    await api.post(`/invites/${id}/revoke`);
    await loadInvites();
  } catch (err) {
    invitesError.value = getApiError(err).message;
  }
}

async function saveTz() {
  familyError.value = "";
  familyLoading.value = true;
  try {
    const { data } = await api.patch("/family", { timezone: timezone.value });
    family.value = data;
    await auth.loadMe();
  } catch (err) {
    familyError.value = getApiError(err).message;
  } finally {
    familyLoading.value = false;
  }
}

async function loadPreview() {
  familyError.value = "";
  const { data } = await api.get<Record<string, number>>("/family/deletion-preview");
  preview.value = data;
}

async function removeFamily() {
  if (!preview.value) return;
  if (!confirm("Удалить семью безвозвратно?")) return;
  familyError.value = "";
  familyLoading.value = true;
  try {
    await api.delete("/family", {
      data: {
        confirm: true,
        acknowledge: Object.keys(preview.value),
      },
    });
    auth.me = null;
    await router.push("/register");
  } catch (err) {
    familyError.value = getApiError(err).message;
  } finally {
    familyLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.meta {
  gap: 8px;
  flex-wrap: nowrap;
}

.expires {
  font-size: 0.85rem;
  font-weight: 600;
}

.list-item {
  align-items: center;
}

.preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.preview-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid var(--line);
  font-weight: 600;
}

.preview-list li:last-child {
  border-bottom: 0;
}

.danger-zone h2 {
  color: var(--danger);
}
</style>
