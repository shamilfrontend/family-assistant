<template>
  <div class="brand-logo" :class="`brand-logo--${variant}`">
    <svg class="brand-logo__icon" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        fill="#fff"
        d="M16.05 6.15 27.4 15.5a1.15 1.15 0 0 1-1.48 1.76l-1.42-1.2v8.84A2.2 2.2 0 0 1 22.3 27.1H9.7a2.2 2.2 0 0 1-2.2-2.2v-8.84l-1.42 1.2A1.15 1.15 0 0 1 4.6 15.5L15.95 6.15a.9.9 0 0 1 1.1 0Z"
      />
      <path
        fill="var(--accent)"
        d="M16 22.85c-2.55-1.85-4.05-3.35-4.05-5.15A2.28 2.28 0 0 1 14.2 15.4c.72 0 1.42.34 1.8 1.05.38-.71 1.08-1.05 1.8-1.05a2.28 2.28 0 0 1 2.25 2.3c0 1.8-1.5 3.3-4.05 5.15Z"
      />
    </svg>
    <p class="brand-logo__name">Семейный <span>ассистент</span></p>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "nav" | "auth";
  }>(),
  { variant: "auth" },
);
</script>

<style scoped lang="scss">
.brand-logo {
  display: flex;
  align-items: center;
}

.brand-logo__icon {
  display: block;
  flex-shrink: 0;
}

.brand-logo__name {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin: 0;
  color: var(--text);
}

.brand-logo__name span {
  color: var(--accent);
}

.brand-logo--nav {
  gap: 12px;
  margin: 0 0 28px;
}

.brand-logo--nav .brand-logo__icon {
  width: 40px;
  height: 40px;
}

.brand-logo--nav .brand-logo__name {
  font-size: 1.35rem;
}

.brand-logo--nav .brand-logo__name span {
  display: block;
}

.brand-logo--auth {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.brand-logo--auth .brand-logo__icon {
  width: 48px;
  height: 48px;
}

.brand-logo--auth .brand-logo__name {
  font-size: 2rem;
}
</style>
