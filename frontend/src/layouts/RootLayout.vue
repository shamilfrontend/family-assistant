<template>
  <LandingView v-if="isGuestHome" />
  <AppLayout v-else />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppLayout from "@/layouts/AppLayout.vue";
import LandingView from "@/views/LandingView.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();

const isGuestHome = computed(() => !auth.me && route.path === "/");
</script>
