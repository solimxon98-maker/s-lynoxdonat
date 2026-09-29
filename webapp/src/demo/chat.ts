/** DEMO: bot chatidagi xabarlar (foydalanuvchi chati va admin chati) */

export interface ChatButton {
  text: string;
  action: "donate" | "orders" | "profile" | "help" | "menu" | "support" | "webapp-orders" | "invite" | "fake-ref";
}

export interface ChatMessage {
  id: number;
  chat: "user" | "admin";
  from: "bot" | "me";
  html: string;
  buttons?: ChatButton[][];
  at: number;
}

let seq = 0;
const messages: ChatMessage[] = [];
const subs = new Set<() => void>();

export const chat = {
  all(): ChatMessage[] {
    return messages;
  },
  push(m: Omit<ChatMessage, "id" | "at">) {
    messages.push({ ...m, id: ++seq, at: Date.now() });
    subs.forEach((s) => s());
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  unread: { user: 0, admin: 0 },
};
