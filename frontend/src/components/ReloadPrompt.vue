<template>
  <div v-if="needRefresh" class="pwa-toast" role="status">
    <p>Доступна новая версия</p>
    <button class="btn" type="button" @click="updateServiceWorker()">Обновить</button>
  </div>
</template>

<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";

const { needRefresh, updateServiceWorker } = useRegisterSW();
</script>

<style scoped lang="scss">
.pwa-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.pwa-toast p {
  margin: 0;
  font-weight: 600;
}

.pwa-toast .btn {
  flex-shrink: 0;
  padding: 8px 14px;
}

@media (min-width: 900px) {
  .pwa-toast {
    left: auto;
    right: 24px;
    bottom: 24px;
    width: min(360px, calc(100% - 48px));
  }
}
</style>
