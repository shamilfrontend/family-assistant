<template>
  <Modal :open="confirmState.open" :title="confirmState.title" @close="resolveConfirm(false)">
    <p v-if="confirmState.message" class="muted">{{ confirmState.message }}</p>
    <div class="row actions">
      <button class="btn btn--ghost" type="button" @click="resolveConfirm(false)">
        {{ confirmState.cancelLabel }}
      </button>
      <button
        class="btn"
        :class="{ 'btn--danger': confirmState.danger }"
        type="button"
        @click="resolveConfirm(true)"
      >
        {{ confirmState.confirmLabel }}
      </button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from "@/components/Modal.vue";
import { confirmState, resolveConfirm } from "@/composables/useConfirm";
</script>

<style scoped lang="scss">
.actions {
  justify-content: flex-end;
}

.muted {
  margin: 0 0 16px;
}
</style>
