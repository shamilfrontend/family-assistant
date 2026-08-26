<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="card panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
        <div class="head">
          <h2 :id="titleId">{{ title }}</h2>
          <button class="close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>
        </div>
        <div class="body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onUnmounted, useId, watch } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();
const titleId = useId();

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

function unlock() {
  document.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    } else {
      unlock();
    }
  },
);

onUnmounted(unlock);
</script>

<style scoped lang="scss">
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--overlay);
  display: grid;
  align-items: end;
  padding: 16px;
  padding-bottom: calc(var(--nav-h) + 16px);
}

.panel {
  width: min(520px, 100%);
  max-height: min(90vh, calc(100dvh - var(--nav-h) - 32px));
  overflow: auto;
  margin-inline: auto;
  padding: 18px 22px 22px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.head h2 {
  margin: 0;
}

.close {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

@media (min-width: 900px) {
  .overlay {
    align-items: center;
    padding: 24px;
  }

  .panel {
    max-height: min(90vh, calc(100dvh - 48px));
  }
}
</style>
