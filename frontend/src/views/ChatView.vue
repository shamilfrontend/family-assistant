<template>
  <div class="page chat-page">
    <div class="card chat-card">
      <div class="section-head">
        <div class="chat-identity">
          <img class="avatar avatar--lg" :src="assistant.avatar" alt="" />
          <div>
            <h1>{{ assistant.name }}</h1>
            <p v-if="readOnly" class="muted chat-sub">{{ heading }}</p>
          </div>
        </div>
        <RouterLink v-if="readOnly" to="/chat">Мой чат</RouterLink>
      </div>
      <p v-if="error" class="alert">{{ error }}</p>
      <div v-if="childChats.length && !readOnly" class="kids">
        <RouterLink v-for="item in childChats" :key="item.chatId" :to="`/chats/${item.memberId}`">
          Чат: {{ item.name }}
        </RouterLink>
      </div>
      <div ref="thread" class="thread">
        <div v-if="messages.length === 0 && !waiting" class="empty-chat">
          <img class="avatar avatar--hero" :src="assistant.avatar" :alt="assistant.name" />
          <p class="empty-title">{{ assistant.name }}</p>
          <p class="muted">Напишите, что нужно семье: покупки, дела или событие.</p>
        </div>
        <div v-else class="thread-inner">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="msg"
            :class="msg.role === 'USER' ? 'msg--user' : 'msg--assistant'"
          >
            <img
              v-if="msg.role === 'ASSISTANT'"
              class="avatar"
              :src="assistant.avatar"
              :alt="assistant.name"
            />
            <div class="bubble">
              <p class="bubble-text">
                <template v-for="(part, i) in tokenizeIcq(msg.content)" :key="i">
                  <IcqSmile v-if="part.type === 'icq'" :filename="part.filename" />
                  <span v-else>{{ part.value }}</span>
                </template>
              </p>
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
              <time v-if="msg.createdAt">{{ formatMsgTime(msg.createdAt) }}</time>
            </div>
          </div>
          <div v-if="waiting" class="msg msg--assistant" :aria-label="`${assistant.name} печатает`">
            <img class="avatar" :src="assistant.avatar" :alt="assistant.name" />
            <div class="bubble bubble--typing">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>
      <form v-if="!readOnly" class="composer" @submit.prevent="send">
        <div ref="pickerRoot" class="smile-wrap">
          <button
            class="smile-btn"
            type="button"
            :disabled="busy"
            :aria-expanded="pickerOpen"
            aria-label="Смайлы"
            @click="pickerOpen = !pickerOpen"
          >
            <IcqSmile filename="smile.gif" />
          </button>
          <div v-if="pickerOpen" class="picker" role="listbox" aria-label="Смайлы">
            <button
              v-for="filename in ICQ_SMILES"
              :key="filename"
              type="button"
              :title="icqTitle(filename)"
              @click="insertIcq(filename)"
            >
              <IcqSmile :filename="filename" />
            </button>
          </div>
        </div>
        <textarea
          ref="composerInput"
          v-model="text"
          rows="1"
          maxlength="4000"
          placeholder="Сообщение"
          autocomplete="off"
          :disabled="busy"
          @input="resizeComposer"
          @keydown.enter.exact.prevent="send"
        />
        <button class="btn send-btn" type="submit" :disabled="busy || !text.trim()" aria-label="Отправить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M5 12h12M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </form>
      <p v-else class="muted readonly-note">Только просмотр. Писать и применять черновики нельзя.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import IcqSmile from "@/components/IcqSmile.vue";
import { api, getApiError } from "@/api/client";
import { ICQ_SMILES, icqTitle, icqToken, tokenizeIcq, type IcqFilename } from "@/lib/icqSmiles";
import { formatTime } from "@/lib/time";
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

const assistant = { name: "Annette", avatar: "/annette.jpg" };

const auth = useAuthStore();
const route = useRoute();
const error = ref("");
const text = ref("");
const busy = ref(false);
const waiting = ref(false);
const chats = ref<ChatSummary[]>([]);
const messages = ref<ChatMessage[]>([]);
const drafts = ref<Draft[]>([]);
const thread = ref<HTMLElement | null>(null);
const composerInput = ref<HTMLTextAreaElement | null>(null);
const pickerRoot = ref<HTMLElement | null>(null);
const pickerOpen = ref(false);

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
const tz = computed(() => auth.me?.family.timezone ?? "UTC");
const draftsByMessage = computed(() => {
  const map: Record<string, Draft[]> = {};
  for (const draft of drafts.value) {
    if (!draft.messageId) continue;
    map[draft.messageId] ??= [];
    map[draft.messageId].push(draft);
  }
  return map;
});

function formatMsgTime(iso: string) {
  return formatTime(iso, tz.value);
}

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
  if (
    !auth.isAdult &&
    (draft.operation === "CREATE_EVENT" || draft.operation === "CREATE_TASK")
  ) {
    return "только для взрослых";
  }
  if (draft.status === "PENDING") return "ожидает подтверждения";
  return draft.status;
}

function resizeComposer() {
  const el = composerInput.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
}

function insertIcq(filename: IcqFilename) {
  const code = icqToken(filename);
  const el = composerInput.value;
  const start = el?.selectionStart ?? text.value.length;
  const end = el?.selectionEnd ?? start;
  const before = text.value.slice(0, start);
  const after = text.value.slice(end);
  const left = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
  const right = after && !after.startsWith(" ") && !after.startsWith("\n") ? " " : "";
  text.value = `${before}${left}${code}${right}${after}`;
  pickerOpen.value = false;
  nextTick(() => {
    const pos = start + left.length + code.length + right.length;
    el?.focus();
    el?.setSelectionRange(pos, pos);
    resizeComposer();
  });
}

function onPickerPointer(event: PointerEvent) {
  if (!pickerRoot.value?.contains(event.target as Node)) pickerOpen.value = false;
}

function onPickerKey(event: KeyboardEvent) {
  if (event.key === "Escape") pickerOpen.value = false;
}

watch(pickerOpen, (open) => {
  if (open) {
    document.addEventListener("pointerdown", onPickerPointer);
    document.addEventListener("keydown", onPickerKey);
  } else {
    document.removeEventListener("pointerdown", onPickerPointer);
    document.removeEventListener("keydown", onPickerKey);
  }
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onPickerPointer);
  document.removeEventListener("keydown", onPickerKey);
});

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
  if (!chat || !content || busy.value) return;
  error.value = "";
  pickerOpen.value = false;
  const tempId = `tmp-${Date.now()}`;
  messages.value = [
    ...messages.value,
    { id: tempId, role: "USER", content, createdAt: new Date().toISOString() },
  ];
  text.value = "";
  await nextTick();
  resizeComposer();
  busy.value = true;
  waiting.value = true;
  await scrollDown();
  try {
    const { data } = await api.post<{
      user: ChatMessage;
      message: ChatMessage;
      drafts: Draft[];
    }>(`/chats/${chat.chatId}/messages`, { content });
    messages.value = [...messages.value.filter((m) => m.id !== tempId), data.user, data.message];
    drafts.value = [...drafts.value, ...data.drafts];
    await scrollDown();
  } catch (err) {
    messages.value = messages.value.filter((m) => m.id !== tempId);
    text.value = content;
    await nextTick();
    resizeComposer();
    const apiErr = getApiError(err);
    error.value = apiErr.code === "llm_unavailable" ? `${assistant.name} сейчас не отвечает` : apiErr.message;
  } finally {
    busy.value = false;
    waiting.value = false;
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
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: calc(var(--nav-h) + 12px + env(safe-area-inset-bottom, 0px));
}

.chat-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.kids {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kids a {
  display: inline-flex;
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
}

.kids a.router-link-active {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-color: transparent;
}

.chat-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.chat-identity h1 {
  margin: 0;
}

.chat-sub {
  margin: 2px 0 0;
  font-size: 0.85rem;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  object-position: center 18%;
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 0 0 1px var(--line);
}

.avatar--lg {
  width: 44px;
  height: 44px;
}

.avatar--hero {
  width: 72px;
  height: 72px;
  margin: 0 auto 10px;
}

.thread {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 4px 2px 8px;
}

.empty-chat {
  margin: auto;
  text-align: center;
  max-width: 280px;
}

.empty-title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
}

.empty-chat .muted {
  margin: 0;
}

.thread-inner {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msg {
  display: flex;
  max-width: min(78%, 440px);
}

.msg--user {
  align-self: flex-end;
}

.msg--assistant {
  align-self: flex-start;
  align-items: flex-end;
  gap: 8px;
  max-width: min(88%, 480px);
}

.bubble {
  width: fit-content;
  max-width: 100%;
  padding: 10px 14px 8px;
  border-radius: 18px;
}

.bubble-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
}

.bubble p {
  margin: 0;
  white-space: pre-wrap;
}

.bubble time {
  display: block;
  margin-top: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  opacity: 0.72;
}

.msg--user .bubble time {
  text-align: right;
}

.msg--user .bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 6px;
}

.msg--assistant .bubble {
  min-width: 0;
  max-width: calc(100% - 40px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-bottom-left-radius: 6px;
}

.bubble--typing {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 12px 16px;
}

.bubble--typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
  animation: typing 1.2s ease-in-out infinite;
}

.bubble--typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.bubble--typing span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
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
  background: var(--bg);
}

.status {
  margin: 0;
  font-size: 0.85rem;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 4px;
  overflow: visible;
}

.smile-wrap {
  position: relative;
  flex-shrink: 0;
}

.smile-btn {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 50%;
  font-size: 1.55rem;
  line-height: 1;
  color: inherit;
  cursor: pointer;
}

.smile-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.smile-btn :deep(.icq-smile) {
  width: 28px;
  height: 28px;
  vertical-align: middle;
}

.picker {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 8;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  width: 248px;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
}

.picker button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 10px;
  font-size: 1.55rem;
  line-height: 1;
  cursor: pointer;
}

.picker button :deep(.icq-smile) {
  width: 28px;
  height: 28px;
  vertical-align: middle;
}

.picker button:hover {
  background: var(--accent-soft);
}

.composer textarea {
  flex: 1;
  width: auto;
  min-height: 48px;
  max-height: 132px;
  resize: none;
  line-height: 1.4;
  border-radius: var(--radius-pill);
  padding: 12px 16px;
  overflow-y: auto;
}

.send-btn {
  width: 48px;
  height: 48px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 50%;
}

.send-btn svg {
  width: 22px;
  height: 22px;
}

.readonly-note {
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .bubble--typing span {
    animation: none;
    opacity: 0.7;
  }
}

@media (min-width: 900px) {
  .chat-page {
    padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
