# REST API

База: `https://family.shamilfrontend.ru/api/v1`.  
Локально тот же префикс за Caddy. JSON, UTF-8. Даты — ISO 8601. Показ времени — пояс семьи, см. [data-model.md](data-model.md).

Схема сущностей: [schema.prisma](schema.prisma). Экраны: [screens.md](screens.md). AI: [ai.md](ai.md).

Тесты RBAC — с первого модуля доступа (в коде, не в этом документе).

## Конвенции

- Клиент — SPA на том же origin; Axios с `withCredentials: true`. CSRF-токен в MVP не нужен: cookie `SameSite=Lax`, запросы только same-origin.
- Списки: `{ "items": [ ... ] }`. Пагинации нет, кроме сообщений чата (`before`, `limit`).
- Email в БД и в уникальности — в нижнем регистре. Пароль: 8–72 символа.
- `name`: 1–80 символов. `timezone`: IANA (`Europe/Moscow`). `birthDate`: `YYYY-MM-DD`.
- Гостевые методы: register, login, accept-invite, invite-preview. Остальное — сессия + членство в семье.

## Сессия

Не JWT в браузере. После login / register / accept-invite сервер ставит cookie:

| Атрибут | Значение |
| --- | --- |
| Имя | `sid` |
| Значение | UUID строки `Session` (непрозрачный id) |
| HttpOnly | да |
| Secure | да (продакшен) |
| SameSite | Lax |
| Path | `/` |
| Max-Age | 30 суток |

Нет сессии или просрочена — `401` с кодом `unauthorized`. Несколько сессий на User допустимы (телефон + ноут): login создаёт ещё одну, не сбрасывает остальные. Logout удаляет **текущую** строку `Session` и cookie. Удаление аккаунта — все сессии.

`GET /auth/me` — текущий User + Member + Family + роль.

## Ошибки

```json
{
  "error": {
    "code": "forbidden",
    "message": "Недостаточно прав"
  }
}
```

| code | HTTP | Когда |
| --- | --- | --- |
| `unauthorized` | 401 | Нет или просрочена сессия |
| `forbidden` | 403 | Роль не позволяет (в том числе чужой чат, чужой документ ребёнку) |
| `not_found` | 404 | Своей семье сущность не принадлежит / нет id |
| `conflict` | 409 | Email уже занят (до фазы 3); последний взрослый; карточка уже с аккаунтом |
| `invite_expired` | 410 | Токен истек, отозван или уже использован |
| `validation` | 422 | Невалидное тело; нет чекбокса 18+; `scope=this` на DELETE серии |
| `llm_unavailable` | 503 | DeepSeek недоступен; в данные не пишем |

В `message` и логах нет полного номера документа.

## Кто

Колонка «кто»: `гость` · `взрослый` · `ребёнок` · `оба` (любой член с аккаунтом). Уточнения — в примечании.

Ответы списков документов всегда с `numberMasked`, без `number`. Нет номера → `numberMasked: null`. Поле `number` — только `GET /documents/:id` взрослому.

События в ответах — **вхождения** в интервале `from`/`to` (серия разворачивается на сервере). Форма вхождения:

```json
{
  "id": "<event id>",
  "occurrenceStart": "2026-09-03T07:00:00.000Z",
  "occurrenceEnd": null,
  "isDetached": false,
  "title": "Футбол",
  "type": "CLUB",
  "allDay": false,
  "recurrence": "WEEKLY",
  "remindInUi": true,
  "participantIds": ["…"],
  "healthRecordId": null
}
```

`occurrenceEnd`: если у серии есть `endsAt`, то `occurrenceStart + (endsAt - startsAt)`, иначе `null`. Клиент `seriesId` не шлёт — сервер задаёт `id` и `seriesId = id` в одном insert.

PATCH `scope=this` обязан передать `occurrenceStart` того вхождения. `participantIds` — минимум 1, иначе `validation`.

---

## Auth

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | 1.1 | гость | `{ email, password, declaredAdult: true, timezone, name, birthDate }` → User, Family, Member ADULT, Chat, cookie |
| POST | `/auth/login` | 1.1 | гость | `{ email, password }` → cookie |
| POST | `/auth/logout` | 1.1 | оба | Удаляет сессию |
| GET | `/auth/me` | 1.1 | оба | `{ user: { id, email }, member: { id, name, role, familyId, birthDate }, family: { id, timezone } }` |
| GET | `/auth/invite-preview` | 1.1 | гость | Query `token`. Валидный: `{ role, memberName, expiresAt }`. Без карточки `memberName: null`. Иначе `invite_expired`. Без данных семьи |
| POST | `/auth/accept-invite` | 1.1 | гость | `{ token, email, password, name?, birthDate?, declaredAdult? }`. Для новой карточки `name` и `birthDate` обязательны; для существующей берутся с карточки. ADULT — `declaredAdult: true` |
| DELETE | `/auth/account` | 1.1 | оба | Удаляет User, все сессии, чат. Карточка остаётся (`userId` null), email свободен. Повторная регистрация — новая семья. Последний взрослый — `conflict` (только удаление семьи) |

`declaredAdult: false` или отсутствие на register / accept ADULT — `validation`. Email уже есть — `conflict`.

---

## Семья

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/family` | 1.1 | оба | `{ id, timezone, createdAt }` |
| PATCH | `/family` | 1.1 | взрослый | `{ timezone }`. timestamptz не переписываются; all-day могут съехать на соседнюю дату |
| GET | `/family/deletion-preview` | 1.1 | взрослый | Счётчики: members, events, tasks, purchases, documents, healthRecords, chats |
| DELETE | `/family` | 1.1 | взрослый | Тело ниже |

```json
{
  "confirm": true,
  "acknowledge": [
    "members",
    "events",
    "tasks",
    "purchases",
    "documents",
    "healthRecords",
    "chats"
  ]
}
```

`acknowledge` должен совпасть со списком из preview (все ключи). Иначе `validation`. После успеха cookie сбрасывается.

---

## Члены семьи

`GET /members` для ребёнка: у чужих карточек только `id`, `name`, `role`; контакты и аллергии — только у своей.

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/members` | 1.1 | оба | Список карточек семьи |
| POST | `/members` | 1.1 | взрослый | Карточка без аккаунта: `{ name, role, birthDate, phone?, email?, allergies? }` |
| GET | `/members/:id` | 1.1 | оба | Ребёнок — только свою полную карточку; чужую как в списке |
| PATCH | `/members/:id` | 1.1 | взрослый | Профиль и роль; последний ADULT → CHILD — `conflict` |
| DELETE | `/members/:id` | 1.1 | взрослый | Карточка удаляется. Если был `userId` — User (сессии, чат) тоже. Последний взрослый — `conflict` |

---

## Приглашения

`POST /invites` один раз возвращает plaintext `token` и `url`. В повторных GET — без токена.

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/invites` | 1.1 | взрослый | Неиспользованные, неистекшие |
| POST | `/invites` | 1.1 | взрослый | `{ role, memberId? }` → `{ id, token, url, expiresAt, role, memberId }` |
| POST | `/invites/:id/revoke` | 1.1 | взрослый | До `usedAt` |

Если `memberId` уже с `userId` — `conflict`. Если `memberId` задан, `role` должен совпасть с ролью карточки — иначе `validation`. `url` вида `https://family.shamilfrontend.ru/invite/{token}`.

---

## Календарь

Query `GET /events`: `from`, `to` (обязательны, ISO), `memberId?` (фильтр по участнику).

Ребёнок: сервер отдаёт только вхождения, где он участник, в окне сегодня … +30 дней; `memberId` чужого человека — `forbidden`, если явно запрошен не свой id. Без `memberId` — свои ближайшие. `GET /events/:id` — если участник, даже вне окна 30 дней.

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/events` | 1.2 | оба | Вхождения в интервале |
| GET | `/events/:id` | 1.2 | оба | Ребёнок — если участник. Query `occurrenceStart?` — какое вхождение показать |
| POST | `/events` | 1.2 | взрослый | `{ title, type, startsAt, endsAt?, allDay, recurrence, recurrenceUntil?, participantIds, remindInUi }`. `participantIds` минимум 1. `seriesId` не принимать. Не `HEALTH_APPOINTMENT` |
| PATCH | `/events/:id` | 1.2 | взрослый | Query `scope=this\|series` (для серии обязателен). Для `this` в теле `occurrenceStart`. `HEALTH_APPOINTMENT` — `forbidden` |
| DELETE | `/events/:id` | 1.2 | взрослый | Только `scope=series` или одиночное. `scope=this` — `validation`. `HEALTH_APPOINTMENT` — `forbidden` |

Тип `DOCTOR` в теле допустим — это не мед. запись.

---

## Покупки

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/purchases` | 1.3 | оба | Query `bought=true\|false\|all` (default `all`) |
| POST | `/purchases` | 1.3 | оба | `{ title, category?, quantity? }`. Нет `category` → `OTHER`. `addedByMemberId` = текущий член |
| PATCH | `/purchases/:id` | 1.3 | оба | Взрослый — любые поля, в том числе `isBought: false`. Ребёнок: `isBought: true` на любую; title/category/quantity — только свою, пока не куплено; `isBought: false` — `forbidden` |
| DELETE | `/purchases/:id` | 1.3 | оба | Взрослый — любую. Ребёнок — свою, если ещё не куплено |
| POST | `/purchases/clear-bought` | 1.3 | взрослый | Удаляет все с `isBought=true` |

---

## Дела

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/tasks` | 1.4 | оба | Query `status?`, `assigneeId?`. Ребёнок — только свои |
| GET | `/tasks/:id` | 1.4 | оба | Ребёнок — только своё |
| POST | `/tasks` | 1.4 | взрослый | `{ title, assigneeMemberId, dueAt, recurrence }`. `seriesId` не принимать |
| PATCH | `/tasks/:id` | 1.4 | взрослый | Поля кроме статуса (статус — complete/reopen) |
| DELETE | `/tasks/:id` | 1.4 | взрослый | |
| POST | `/tasks/:id/complete` | 1.4 | оба | Ребёнок — только своё. Повтор — DONE + новое OPEN |
| POST | `/tasks/:id/reopen` | 1.4 | взрослый | Снять «сделано» |

---

## Документы

В коллекциях: `numberMasked`, без `number`. Нет номера → `numberMasked: null`. Статус `expiresSoon: boolean` (30 дней).

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/documents` | 1.4 | оба | Ребёнок — только свои, маска |
| POST | `/documents` | 1.4 | взрослый | `{ ownerMemberId, type, number?, expiresAt }` |
| GET | `/documents/:id` | 1.4 | оба | Взрослый — `number`. Ребёнок — своё, только маска. Просмотр полного номера — `AuditLog` `DOCUMENT_NUMBER_VIEW` |
| PATCH | `/documents/:id` | 1.4 | взрослый | |
| DELETE | `/documents/:id` | 1.4 | взрослый | |

---

## Здоровье

Query `GET /health-records`: `memberId?`. Ребёнок — только свой `memberId`, иначе `forbidden`.

Тело `POST`/`PATCH`: `kind` + поля этого вида. Обязательные: `DOCTOR` — `doctorName`, `specialty`; `VACCINATION` — `vaccineName`, `vaccinatedAt`; `CHECKUP` — `checkupType`, `checkupAt`; `APPOINTMENT` — `appointmentTitle`, `appointmentAt`. `APPOINTMENT` в той же транзакции создаёт/обновляет событие `HEALTH_APPOINTMENT` с участником `HealthRecord.memberId`. Удаление приёма удаляет событие. Событие из календаря отдельно не удаляют.

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/health-records` | 1.5 | оба | Ребёнок — только своё. Чтение — аудит `HEALTH_READ` |
| POST | `/health-records` | 1.5 | взрослый | |
| GET | `/health-records/:id` | 1.5 | оба | Ребёнок — только своё |
| PATCH | `/health-records/:id` | 1.5 | взрослый | |
| DELETE | `/health-records/:id` | 1.5 | взрослый | |

Аллергии через `PATCH /members/:id`, не через здоровье.

---

## Напоминания

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/reminders` | 1.2 | оба | Считается на лету |

```json
{
  "today": {
    "events": [],
    "tasks": []
  },
  "soon": {
    "events": [],
    "documents": []
  }
}
```

- `today.events` — вхождения на сегодня (ребёнок — свои).
- `today.tasks` — открытые дела со сроком сегодня (1.4; до 1.4 — `[]`).
- `soon.events` — с `remindInUi`, сегодня … +7 дней.
- `soon.documents` — истекают в ближайшие 30 дней (1.4; маска, без номера).

---

## Чаты и AI

Контекст для модели собирает **сервер** по роли. Клиент шлёт только текст сообщения. `:id` в путях чата — **id чата**, не memberId. Клиент берёт `chatId` из `GET /chats`. Поведение модели, tools и промпт — [ai.md](ai.md).

| Метод | Путь | Подфаза | Кто | Примечание |
| --- | --- | --- | --- | --- |
| GET | `/chats` | 1.3 | оба | Свой чат. Взрослый — плюс чаты детей `{ chatId, memberId, name }` |
| GET | `/chats/:id` | 1.3 | оба | Свой или (взрослый) чат ребёнка семьи |
| GET | `/chats/:id/messages` | 1.3 | оба | Query `before?`, `limit` (default 50). Те же права, что GET чата |
| POST | `/chats/:id/messages` | 1.3 | оба | Только **свой** чат: `{ content }`. Ответ: user-сообщение + assistant (+ `drafts[]` если есть). LLM down — `llm_unavailable`, user-сообщение **не** обязано сохраняться |
| GET | `/chats/:id/drafts` | 1.3 | оба | Query `status=PENDING`. Только свой чат |
| POST | `/chats/:id/drafts/:draftId/apply` | 1.3 | оба | Только свой чат, статус PENDING, не истёк. Пишет в данные с проверкой роли |
| POST | `/chats/:id/drafts/:draftId/reject` | 1.3 | оба | Только свой чат |

Взрослый на `POST /chats/:id/messages` и apply/reject чужого (детского) чата — `forbidden`.

Тело apply успех: `{ draft, entity }` (созданная/обновлённая сущность в форме соответствующего GET). Повторный apply того же id — `conflict`. Истёкший черновик — `validation`.

Apply проверяет роль так же, как соответствующий POST/PATCH:

- `CREATE_PURCHASE`, `MARK_PURCHASE_BOUGHT` — оба (ребёнок — по правилам PATCH покупок)
- `CREATE_EVENT`, `CREATE_TASK` — взрослый; ребёнок — `forbidden`
- `COMPLETE_TASK` — ребёнок только своё дело

Операции черновика: 1.3 — `CREATE_PURCHASE`; 1.4 — `CREATE_EVENT`, `CREATE_TASK`, `COMPLETE_TASK`, `MARK_PURCHASE_BOUGHT`. Иное — не создаётся. Категория покупки, если модель не указала — `OTHER`. Несколько черновиков одного ответа ссылаются на одно assistant-сообщение (`AiDraft.messageId`).

---

## Примеры

Регистрация:

```http
POST /api/v1/auth/register
Content-Type: application/json

{"email":"parent@example.com","password":"********","declaredAdult":true,"timezone":"Europe/Moscow","name":"Анна","birthDate":"1990-05-12"}
```

Список документов (маска):

```json
{
  "items": [
    {
      "id": "…",
      "ownerMemberId": "…",
      "type": "PASSPORT",
      "numberMasked": "••••1234",
      "expiresAt": "2026-11-01",
      "expiresSoon": true
    }
  ]
}
```

Черновик покупки в ответе чата:

```json
{
  "message": {
    "id": "…",
    "role": "assistant",
    "content": "Добавить молоко в покупки?"
  },
  "drafts": [
    {
      "id": "…",
      "operation": "CREATE_PURCHASE",
      "payload": { "title": "молоко", "category": "FOOD" },
      "status": "PENDING",
      "expiresAt": "2026-08-25T19:00:00.000Z"
    }
  ]
}
```
