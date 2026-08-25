import { computed, ref, watch } from "vue";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "fa-theme";

const mode = ref<ThemeMode>("system");
let listening = false;

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStored(): ThemeMode {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

function resolve(next: ThemeMode): "light" | "dark" {
  if (next === "system") return systemDark() ? "dark" : "light";
  return next;
}

function apply(resolved: "light" | "dark") {
  document.documentElement.dataset.theme = resolved;
}

function ensureSystemListener() {
  if (listening) return;
  listening = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (mode.value === "system") apply(resolve("system"));
  });
}

/** Call once before mount so first paint matches preference. */
export function initTheme() {
  mode.value = readStored();
  apply(resolve(mode.value));
  ensureSystemListener();
}

export function useTheme() {
  ensureSystemListener();

  const resolved = computed(() => resolve(mode.value));

  watch(mode, (next) => {
    localStorage.setItem(STORAGE_KEY, next);
    apply(resolve(next));
  });

  function setTheme(next: ThemeMode) {
    mode.value = next;
  }

  return { mode, resolved, setTheme };
}
