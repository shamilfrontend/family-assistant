import { reactive } from "vue";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
};

let resolver: ((value: boolean) => void) | null = null;

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: "",
  message: "",
  confirmLabel: "ОК",
  cancelLabel: "Отмена",
  danger: false,
});

function settle(value: boolean) {
  confirmState.open = false;
  const resolve = resolver;
  resolver = null;
  resolve?.(value);
}

export function resolveConfirm(value: boolean) {
  settle(value);
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  if (resolver) settle(false);
  confirmState.title = options.title;
  confirmState.message = options.message ?? "";
  confirmState.confirmLabel = options.confirmLabel ?? (options.danger ? "Удалить" : "ОК");
  confirmState.cancelLabel = options.cancelLabel ?? "Отмена";
  confirmState.danger = options.danger ?? false;
  confirmState.open = true;
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function useConfirm() {
  return { confirm };
}
