<template>
  <img v-if="src" class="icq-smile" :src="src" :alt="alt" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { icqSrc, icqTitle, isIcqFilename } from "@/lib/icqSmiles";

const props = defineProps<{ filename: string }>();

const src = computed(() => (isIcqFilename(props.filename) ? icqSrc(props.filename) : ""));
const alt = computed(() => icqTitle(props.filename));
</script>

<style scoped>
.icq-smile {
  width: 1.45em;
  height: 1.45em;
  display: inline-block;
  vertical-align: -0.32em;
  object-fit: contain;
}
</style>
