<template>
  <div class="landing">
    <header class="landing-nav">
      <BrandLogo variant="header" />
      <RouterLink class="btn btn--ghost" to="/login">Войти</RouterLink>
    </header>

    <section class="hero">
      <p class="badge badge--rose">Для одной семьи</p>
      <h1 class="hero-title">Общее пространство семьи</h1>
      <p class="lead">
        Календарь, дела, покупки, документы и здоровье — плюс AI, который отвечает и действует по этим данным.
      </p>
      <div class="hero-actions">
        <RouterLink class="btn" to="/register">Создать семью</RouterLink>
        <RouterLink class="btn btn--ghost" to="/login">Войти</RouterLink>
      </div>
    </section>

    <section class="block">
      <h2>Возможности</h2>
      <div class="features">
        <article class="card feature">
          <span class="feature-icon feature-icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M8 3.5v3M16 3.5v3M3.5 10h17" stroke-linecap="round" />
            </svg>
          </span>
          <h3>Календарь</h3>
          <p>Кружки, школа, дни рождения и кто забирает ребёнка — общее расписание на всю семью.</p>
        </article>

        <article class="card feature">
          <span class="feature-icon feature-icon--mint" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M8 9.5h8M8 13h5" stroke-linecap="round" />
            </svg>
          </span>
          <h3>Дела</h3>
          <p>Задачи с исполнителем, сроком и повтором. Ребёнок отмечает свои, взрослый видит все.</p>
        </article>

        <article class="card feature">
          <span class="feature-icon feature-icon--rose" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path
                d="M6 6h15l-1.4 8.4a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.5L5 4H3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h3>Покупки</h3>
          <p>Один общий список. С телефона достаточно названия — молоко попадёт в корзину за секунду.</p>
        </article>

        <article class="card feature">
          <span class="feature-icon feature-icon--lavender" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M7 4.5h7.5L18.5 9v10.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
              <path d="M14.5 4.5V9h4.5" />
            </svg>
          </span>
          <h3>Документы</h3>
          <p>Паспорт, полис, права: сроки на виду. За 30 дней статус «скоро истекает», номер скрыт.</p>
        </article>

        <article class="card feature">
          <span class="feature-icon feature-icon--mint" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M9 3.5h6v5.5h5.5v6H15V21H9v-6H3.5V9H9V3.5Z" stroke-linejoin="round" />
            </svg>
          </span>
          <h3>Здоровье</h3>
          <p>Врачи, прививки, осмотры и приёмы по каждому члену семьи. Аллергии живут в профиле.</p>
        </article>

        <article class="card feature">
          <img class="annette" src="/annette.jpg" alt="" />
          <h3>Annette</h3>
          <p>Отвечает по данным семьи. Запись в календарь, дела и покупки — только после вашей кнопки.</p>
        </article>

        <article class="card feature">
          <span class="feature-icon feature-icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <circle cx="9" cy="8" r="3" />
              <circle cx="16.5" cy="9.5" r="2.5" />
              <path d="M3.5 19c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5" stroke-linecap="round" />
              <path d="M14 14.2c1.5-.5 3.2-.3 4.8 1.3.6.6 1 1.4 1.2 2.5" stroke-linecap="round" />
            </svg>
          </span>
          <h3>Роли</h3>
          <p>Взрослые ведут семью, ребёнок видит своё. Вход второго взрослого и детей — по приглашению.</p>
        </article>
      </div>
    </section>

    <section class="block">
      <h2>Как начать</h2>
      <ol class="steps">
        <li class="card step">
          <span class="step-num">1</span>
          <div>
            <h3>Создайте семью</h3>
            <p>Регистрация с 18 лет: ваша карточка взрослого и общее пространство.</p>
          </div>
        </li>
        <li class="card step">
          <span class="step-num">2</span>
          <div>
            <h3>Пригласите близких</h3>
            <p>Одноразовая ссылка на 48 часов — для второго взрослого или ребёнка.</p>
          </div>
        </li>
        <li class="card step">
          <span class="step-num">3</span>
          <div>
            <h3>Ведите быт</h3>
            <p>Спрашивайте Annette, подтверждайте запись кнопкой. Данные семьи — источник правды.</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="card cta">
      <h2>Соберите семью в одном месте</h2>
      <p class="muted">Без разрозненных чатов и заметок — одно пространство и ассистент, который с ним работает.</p>
      <div class="hero-actions">
        <RouterLink class="btn" to="/register">Создать семью</RouterLink>
        <p class="cta-login muted">Уже есть вход? <RouterLink to="/login">Войти</RouterLink></p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import BrandLogo from "@/components/BrandLogo.vue";
</script>

<style scoped lang="scss">
.landing {
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 20px 16px 56px;
}

.landing-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 36px;
}

.hero {
  display: grid;
  justify-items: start;
  gap: 16px;
  margin-bottom: 48px;
  animation: page-in 0.35s ease both;
}

.hero .badge {
  margin: 0;
}

.hero-title {
  font-size: clamp(2rem, 5.5vw, 3.4rem);
  letter-spacing: -0.04em;
  line-height: 1.08;
  max-width: 12em;
  margin: 0;
}

.lead {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.5;
  color: var(--muted);
  max-width: 38em;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.hero-actions .btn {
  text-decoration: none;
}

.block {
  margin-bottom: 40px;
}

.block h2,
.cta h2 {
  margin-bottom: 16px;
}

.features {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

.feature {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 180px;
  animation: page-in 0.45s ease both;
}

.feature h3,
.step h3 {
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 700;
  margin: 0;
}

.feature p,
.step p {
  margin: 0;
  color: var(--muted);
  font-weight: 600;
  line-height: 1.45;
}

.feature-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
}

.feature-icon svg {
  width: 22px;
  height: 22px;
}

.feature-icon--blue {
  background: var(--badge-blue-bg);
  color: var(--badge-blue);
}

.feature-icon--mint {
  background: var(--badge-mint-bg);
  color: var(--badge-mint);
}

.feature-icon--rose {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.feature-icon--lavender {
  background: var(--badge-lavender-bg);
  color: var(--badge-lavender);
}

.annette {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  object-fit: cover;
  object-position: center 18%;
  background: #fff;
  box-shadow: 0 0 0 1px var(--line);
}

.steps {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
}

.step-num {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
}

.cta {
  display: grid;
  gap: 10px;
  justify-items: start;
}

.cta h2 {
  margin: 0;
}

.cta .muted {
  margin: 0;
  max-width: 36em;
}

.cta-login {
  margin: 0;
  font-weight: 600;
}

.cta-login a {
  font-weight: 700;
}

@media (min-width: 640px) {
  .landing-nav {
    margin-bottom: 56px;
  }

  .hero {
    margin-bottom: 64px;
  }

  .features {
    grid-template-columns: 1fr 1fr;
  }

  .steps {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

@media (min-width: 960px) {
  .features {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
</style>
