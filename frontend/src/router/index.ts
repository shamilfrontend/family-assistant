import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: () => import("@/views/LoginView.vue"), meta: { guest: true } },
    { path: "/register", component: () => import("@/views/RegisterView.vue"), meta: { guest: true } },
    { path: "/invite/:token", component: () => import("@/views/InviteView.vue"), meta: { guest: true } },
    {
      path: "/",
      component: () => import("@/layouts/AppLayout.vue"),
      meta: { auth: true },
      children: [
        { path: "", component: () => import("@/views/TodayView.vue") },
        { path: "calendar", component: () => import("@/views/CalendarView.vue") },
        {
          path: "calendar/events/new",
          component: () => import("@/views/EventFormView.vue"),
          meta: { adult: true },
        },
        { path: "calendar/events/:id", component: () => import("@/views/EventDetailView.vue") },
        { path: "purchases", component: () => import("@/views/PurchasesView.vue") },
        { path: "tasks", component: () => import("@/views/TasksView.vue") },
        { path: "tasks/:id", component: () => import("@/views/TaskDetailView.vue") },
        { path: "documents", component: () => import("@/views/DocumentsView.vue") },
        {
          path: "documents/new",
          component: () => import("@/views/DocumentFormView.vue"),
          meta: { adult: true },
        },
        { path: "documents/:id", component: () => import("@/views/DocumentDetailView.vue") },
        { path: "health", component: () => import("@/views/HealthView.vue") },
        { path: "health/:memberId", component: () => import("@/views/HealthMemberView.vue") },
        { path: "chat", component: () => import("@/views/ChatView.vue") },
        {
          path: "chats/:memberId",
          component: () => import("@/views/ChatView.vue"),
          meta: { adult: true },
        },
        { path: "profile", component: () => import("@/views/ProfileView.vue") },
        {
          path: "family",
          component: () => import("@/views/FamilyView.vue"),
          meta: { adult: true },
        },
        {
          path: "family/members",
          redirect: "/family",
        },
        {
          path: "family/members/:id",
          component: () => import("@/views/MemberDetailView.vue"),
          meta: { adult: true },
        },
        {
          path: "family/invites",
          redirect: "/family",
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.loadMe();

  if (to.meta.guest && auth.me) return { path: "/" };
  if (to.meta.auth && !auth.me) return { path: "/login" };
  if (to.meta.adult && auth.me?.member.role !== "ADULT") return { path: "/" };
  if (to.path === "/health" && auth.me?.member.role === "CHILD") {
    return { path: `/health/${auth.me.member.id}` };
  }
  return true;
});

export default router;
