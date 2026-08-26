<template>
  <RouterView />
  <ConfirmModal />
  <ReloadPrompt />
</template>

<script setup lang="ts">
import ConfirmModal from "@/components/ConfirmModal.vue";
import ReloadPrompt from "@/components/ReloadPrompt.vue";
</script>
