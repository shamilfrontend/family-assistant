import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "@/api/client";

export type Me = {
  user: { id: string; email: string };
  member: {
    id: string;
    name: string;
    role: "ADULT" | "CHILD";
    familyId: string;
    birthDate: string;
  };
  family: { id: string; timezone: string };
};

export const useAuthStore = defineStore("auth", () => {
  const me = ref<Me | null>(null);
  const loaded = ref(false);

  const isAdult = computed(() => me.value?.member.role === "ADULT");

  async function loadMe() {
    try {
      const { data } = await api.get<Me>("/auth/me");
      me.value = data;
    } catch {
      me.value = null;
    } finally {
      loaded.value = true;
    }
    return me.value;
  }

  async function register(payload: {
    email: string;
    password: string;
    declaredAdult: boolean;
    timezone: string;
    name: string;
    birthDate: string;
  }) {
    const { data } = await api.post<Me>("/auth/register", payload);
    me.value = data;
    loaded.value = true;
  }

  async function login(payload: { email: string; password: string }) {
    const { data } = await api.post<Me>("/auth/login", payload);
    me.value = data;
    loaded.value = true;
  }

  async function acceptInvite(payload: Record<string, unknown>) {
    const { data } = await api.post<Me>("/auth/accept-invite", payload);
    me.value = data;
    loaded.value = true;
  }

  function clearSession() {
    me.value = null;
  }

  async function logout() {
    await api.post("/auth/logout");
    clearSession();
  }

  return { me, loaded, isAdult, loadMe, register, login, acceptInvite, logout, clearSession };
});
