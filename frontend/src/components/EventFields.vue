<template>
  <div class="stack">
    <label>Название <input v-model="form.title" required maxlength="120" /></label>
    <label>
      Тип
      <select v-model="form.type">
        <option v-for="item in EVENT_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </label>
    <p v-if="form.type === 'DOCTOR'" class="muted">Это событие календаря, не мед. карта.</p>
    <label class="checkbox">
      <input v-model="form.allDay" type="checkbox" />
      Весь день
    </label>
    <label>Дата <input v-model="form.date" type="date" required /></label>
    <div v-if="!form.allDay" class="field-grid field-grid--2">
      <label>Начало <input v-model="form.time" type="time" required /></label>
      <label>Конец <input v-model="form.endTime" type="time" /></label>
    </div>
    <div v-if="!hideRecurrence" class="field-grid field-grid--2">
      <label>
        Повтор
        <select v-model="form.recurrence">
          <option v-for="item in RECURRENCE_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <label v-if="form.recurrence !== 'NONE'">
        До даты
        <input v-model="form.untilDate" type="date" />
      </label>
    </div>
    <fieldset>
      <legend>Участники</legend>
      <div class="chip-group">
        <label v-for="member in members" :key="member.id" class="chip">
          <input
            type="checkbox"
            :value="member.id"
            :checked="form.participantIds.includes(member.id)"
            @change="toggleMember(member.id, ($event.target as HTMLInputElement).checked)"
          />
          {{ member.name }}
        </label>
      </div>
    </fieldset>
    <label class="checkbox">
      <input v-model="form.remindInUi" type="checkbox" />
      Напомнить в интерфейсе
    </label>
  </div>
</template>

<script setup lang="ts">
import { EVENT_TYPES, RECURRENCE_OPTIONS, type EventFormState } from "@/lib/events";

defineProps<{
  members: { id: string; name: string }[];
  hideRecurrence?: boolean;
}>();

const form = defineModel<EventFormState>({ required: true });

function toggleMember(id: string, checked: boolean) {
  if (checked) {
    if (!form.value.participantIds.includes(id)) form.value.participantIds.push(id);
  } else {
    form.value.participantIds = form.value.participantIds.filter((item) => item !== id);
  }
}
</script>

<style scoped lang="scss">
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
}

legend {
  padding: 0;
  margin-bottom: 10px;
  font-weight: 700;
  font-size: 0.9rem;
}
</style>
