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
      component: () => import("@/layouts/RootLayout.vue"),
      children: [
        { path: "", component: () => import("@/views/TodayView.vue") },
        { path: "calendar", component: () => import("@/views/CalendarView.vue"), meta: { auth: true } },
        { path: "calendar/events/new", redirect: "/calendar" },
        {
          path: "calendar/events/:id",
          component: () => import("@/views/EventDetailView.vue"),
          meta: { auth: true },
        },
        { path: "purchases", component: () => import("@/views/PurchasesView.vue"), meta: { auth: true } },
        { path: "tasks", component: () => import("@/views/TasksView.vue"), meta: { auth: true } },
        { path: "tasks/:id", component: () => import("@/views/TaskDetailView.vue"), meta: { auth: true } },
        { path: "documents", component: () => import("@/views/DocumentsView.vue"), meta: { auth: true } },
        { path: "documents/new", redirect: "/documents" },
        {
          path: "documents/:id",
          component: () => import("@/views/DocumentDetailView.vue"),
          meta: { auth: true },
        },
        { path: "health", component: () => import("@/views/HealthView.vue"), meta: { auth: true } },
        {
          path: "health/:memberId",
          component: () => import("@/views/HealthMemberView.vue"),
          meta: { auth: true },
        },
        { path: "chat", component: () => import("@/views/ChatView.vue"), meta: { auth: true } },
        {
          path: "chats/:memberId",
          component: () => import("@/views/ChatView.vue"),
          meta: { auth: true, adult: true },
        },
        { path: "profile", component: () => import("@/views/ProfileView.vue"), meta: { auth: true } },
        {
          path: "family",
          component: () => import("@/views/FamilyView.vue"),
          meta: { auth: true, adult: true },
        },
        {
          path: "family/members",
          redirect: "/family",
        },
        {
          path: "family/members/:id",
          component: () => import("@/views/MemberDetailView.vue"),
          meta: { auth: true, adult: true },
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
