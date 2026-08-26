import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { setupAuthInterceptor } from "./api/client";
import { initTheme } from "./lib/theme";
import router from "./router";
import { useAuthStore } from "./stores/auth";
import "./styles/main.scss";

initTheme();

const app = createApp(App);
app.use(createPinia());
app.use(router);

setupAuthInterceptor(() => {
  const auth = useAuthStore();
  auth.clearSession();
  if (!router.currentRoute.value.meta.guest) {
    void router.push("/login");
  }
});

app.mount("#app");
