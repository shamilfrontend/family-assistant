<template>
  <div class="page chat-page">
    <div class="card stack chat-card">
      <div class="section-head">
        <h1>{{ heading }}</h1>
        <RouterLink v-if="readOnly" to="/chat">Мой чат</RouterLink>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <div v-if="childChats.length && !readOnly" class="kids">
        <RouterLink v-for="item in childChats" :key="item.chatId" :to="`/chats/${item.memberId}`">
          Чат: {{ item.name }}
        </RouterLink>
      </div>
      <div ref="thread" class="thread">
        <p v-if="messages.length === 0" class="muted empty-chat">Напишите, что нужно семье.</p>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="bubble"
          :class="msg.role === 'USER' ? 'bubble--user' : 'bubble--assistant'"
        >
          <p>{{ msg.content }}</p>
          <div v-if="draftsByMessage[msg.id]?.length" class="drafts">
            <div v-for="draft in draftsByMessage[msg.id]" :key="draft.id" class="draft">
              <p>{{ draftLabel(draft) }}</p>
              <div v-if="!readOnly && draft.status === 'PENDING' && canApply(draft)" class="row">
                <button class="btn" type="button" :disabled="busy" @click="apply(draft)">Применить</button>
                <button class="btn btn--ghost" type="button" :disabled="busy" @click="reject(draft)">
                  Отклонить
                </button>
              </div>
              <p v-else class="muted status">{{ draftStatus(draft) }}</p>
            </div>
          </div>
        </div>
      </div>
      <form v-if="!readOnly" class="composer" @submit.prevent="send">
        <input
          v-model="text"
          type="text"
          maxlength="4000"
          placeholder="Сообщение"
          autocomplete="off"
          :disabled="busy"
        />
        <button class="btn" type="submit" :disabled="busy || !text.trim()">Отправить</button>
      </form>
      <p v-else class="muted readonly-note">Только просмотр. Писать и применять черновики нельзя.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api, getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

type ChatSummary = { chatId: string; memberId: string | null; name: string };
type ChatMessage = { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string };
type Draft = {
  id: string;
  operation: string;
  payload: { title?: string; type?: string; taskId?: string; purchaseId?: string };
  status: string;
  expiresAt: string;
  messageId: string | null;
};

const auth = useAuthStore();
const route = useRoute();
const error = ref("");
const text = ref("");
const busy = ref(false);
const chats = ref<ChatSummary[]>([]);
const messages = ref<ChatMessage[]>([]);
const drafts = ref<Draft[]>([]);
const thread = ref<HTMLElement | null>(null);

const memberId = computed(() =>
  typeof route.params.memberId === "string" ? route.params.memberId : undefined,
);
const readOnly = computed(() => Boolean(memberId.value));
const ownChat = computed(() => chats.value.find((c) => c.memberId === auth.me?.member.id));
const activeChat = computed(() => {
  if (memberId.value) return chats.value.find((c) => c.memberId === memberId.value);
  return ownChat.value;
});
const childChats = computed(() =>
  chats.value.filter((c) => c.memberId && c.memberId !== auth.me?.member.id),
);
const heading = computed(() => {
  if (readOnly.value) return activeChat.value ? `Чат: ${activeChat.value.name}` : "Чат";
  return "Чат";
});
const draftsByMessage = computed(() => {
  const map: Record<string, Draft[]> = {};
  for (const draft of drafts.value) {
    if (!draft.messageId) continue;
    map[draft.messageId] ??= [];
    map[draft.messageId].push(draft);
  }
  return map;
});

function draftLabel(draft: Draft) {
  if (draft.operation === "CREATE_PURCHASE") {
    return `Добавить «${draft.payload.title ?? ""}» в покупки`;
  }
  if (draft.operation === "CREATE_EVENT") {
    return `Создать событие «${draft.payload.title ?? ""}»`;
  }
  if (draft.operation === "CREATE_TASK") {
    return `Создать дело «${draft.payload.title ?? ""}»`;
  }
  if (draft.operation === "COMPLETE_TASK") {
    return "Отметить дело сделанным";
  }
  if (draft.operation === "MARK_PURCHASE_BOUGHT") {
    return "Отметить покупку купленной";
  }
  return draft.operation;
}

function canApply(draft: Draft) {
  if (draft.operation === "CREATE_EVENT" || draft.operation === "CREATE_TASK") return auth.isAdult;
  return true;
}

function draftStatus(draft: Draft) {
  if (draft.status === "APPLIED") return "применено";
  if (draft.status === "REJECTED") return "отклонено";
  return draft.status;
}

async function scrollDown() {
  await nextTick();
  thread.value?.scrollTo({ top: thread.value.scrollHeight });
}

async function loadChats() {
  const { data } = await api.get<{ items: ChatSummary[] }>("/chats");
  chats.value = data.items;
}

async function loadThread() {
  const chat = activeChat.value;
  if (!chat) return;
  const [msgs, pending] = await Promise.all([
    api.get<{ items: ChatMessage[] }>(`/chats/${chat.chatId}/messages`),
    readOnly.value
      ? Promise.resolve({ data: { items: [] as Draft[] } })
      : api.get<{ items: Draft[] }>(`/chats/${chat.chatId}/drafts`, { params: { status: "PENDING" } }),
  ]);
  messages.value = msgs.data.items;
  drafts.value = pending.data.items;
  await scrollDown();
}

onMounted(async () => {
  try {
    await loadChats();
    if (readOnly.value && !activeChat.value) {
      error.value = "Чат недоступен";
      return;
    }
    await loadThread();
  } catch (err) {
    error.value = getApiError(err).message;
  }
});

watch(
  () => route.params.memberId,
  async () => {
    error.value = "";
    try {
      await loadChats();
      await loadThread();
    } catch (err) {
      error.value = getApiError(err).message;
    }
  },
);

async function send() {
  const chat = activeChat.value;
  const content = text.value.trim();
  if (!chat || !content) return;
  error.value = "";
  busy.value = true;
  try {
    const { data } = await api.post<{
      user: ChatMessage;
      message: ChatMessage;
      drafts: Draft[];
    }>(`/chats/${chat.chatId}/messages`, { content });
    text.value = "";
    messages.value = [...messages.value, data.user, data.message];
    drafts.value = [...drafts.value, ...data.drafts];
    await scrollDown();
  } catch (err) {
    const apiErr = getApiError(err);
    error.value = apiErr.code === "llm_unavailable" ? "Ассистент сейчас не отвечает" : apiErr.message;
  } finally {
    busy.value = false;
  }
}

async function apply(draft: Draft) {
  const chat = activeChat.value;
  if (!chat) return;
  busy.value = true;
  error.value = "";
  try {
    await api.post(`/chats/${chat.chatId}/drafts/${draft.id}/apply`);
    drafts.value = drafts.value.map((d) => (d.id === draft.id ? { ...d, status: "APPLIED" } : d));
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    busy.value = false;
  }
}

async function reject(draft: Draft) {
  const chat = activeChat.value;
  if (!chat) return;
  busy.value = true;
  error.value = "";
  try {
    await api.post(`/chats/${chat.chatId}/drafts/${draft.id}/reject`);
    drafts.value = drafts.value.map((d) => (d.id === draft.id ? { ...d, status: "REJECTED" } : d));
  } catch (err) {
    error.value = getApiError(err).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.chat-page {
  padding-bottom: calc(var(--nav-h) + 12px);
}

.chat-card {
  min-height: calc(100vh - var(--nav-h) - 56px);
}

.kids {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kids a {
  font-size: 0.85rem;
  font-weight: 700;
}

.thread {
  display: grid;
  gap: 10px;
  align-content: start;
  flex: 1;
  max-height: calc(100vh - 280px);
  overflow: auto;
  padding-right: 4px;
}

.empty-chat {
  margin: 12px 0;
}

.bubble {
  max-width: 92%;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
}

.bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.bubble--user {
  justify-self: end;
  background: var(--accent);
  color: #fff;
}

.bubble--assistant {
  justify-self: start;
  background: var(--bg);
}

.drafts {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.draft {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--surface);
}

.status {
  margin: 0;
  font-size: 0.85rem;
}

.composer {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  padding-top: 8px;
  background: var(--surface);
}

.composer input {
  flex: 1;
}

.readonly-note {
  margin: 0;
}

@media (min-width: 900px) {
  .chat-card {
    min-height: calc(100vh - 80px);
  }

  .thread {
    max-height: calc(100vh - 240px);
  }
}
</style>
