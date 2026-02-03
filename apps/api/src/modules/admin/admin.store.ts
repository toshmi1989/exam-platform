type ChatMessage = {
  id: string;
  telegramId: string;
  author: 'user' | 'admin';
  text?: string;
  imageData?: string;
  createdAt: number;
};

type ChatThread = {
  telegramId: string;
  status: 'new' | 'open' | 'resolved';
  lastMessageAt: number;
  unreadAdmin: number;
  unreadUser: number;
};

type Broadcast = {
  id: string;
  title: string;
  text: string;
  segment: string;
  imageData?: string;
  createdAt: number;
};

type BlacklistEntry = {
  telegramId: string;
  reason?: string;
  createdAt: number;
};

const chatMessages: ChatMessage[] = [];
const chatThreads = new Map<string, ChatThread>();
const broadcasts: Broadcast[] = [];
const blacklist = new Map<string, BlacklistEntry>();

const MAX_IMAGE_SIZE = 200 * 1024;
const CHAT_RETENTION_DAYS = 10;
const BROADCAST_RETENTION_DAYS = 30;
const MAX_MESSAGES_PER_THREAD = 200;
const MAX_BROADCASTS = 200;

function trimImageData(imageData?: string): string | undefined {
  if (!imageData) return undefined;
  return imageData.length > MAX_IMAGE_SIZE ? undefined : imageData;
}

export function cleanupStore(now = Date.now()) {
  const chatCutoff = now - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const broadcastCutoff = now - BROADCAST_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    if (chatMessages[i].createdAt < chatCutoff) {
      chatMessages.splice(i, 1);
    }
  }

  for (const [telegramId, thread] of chatThreads.entries()) {
    if (thread.lastMessageAt < chatCutoff) {
      chatThreads.delete(telegramId);
    }
  }

  for (let i = broadcasts.length - 1; i >= 0; i -= 1) {
    if (broadcasts[i].createdAt < broadcastCutoff) {
      broadcasts.splice(i, 1);
    }
  }

  if (broadcasts.length > MAX_BROADCASTS) {
    broadcasts.splice(0, broadcasts.length - MAX_BROADCASTS);
  }
}

export function isBlacklisted(telegramId: string) {
  return blacklist.has(telegramId);
}

export function listBlacklist() {
  return Array.from(blacklist.values());
}

export function addBlacklist(entry: BlacklistEntry) {
  blacklist.set(entry.telegramId, entry);
}

export function removeBlacklist(telegramId: string) {
  blacklist.delete(telegramId);
}

export function listThreads() {
  return Array.from(chatThreads.values()).sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt
  );
}

export function getUnreadForUser(telegramId: string): number {
  const thread = chatThreads.get(telegramId);
  return thread?.unreadUser ?? 0;
}

export function getTotalUnreadAdmin(): number {
  return Array.from(chatThreads.values()).reduce(
    (acc, t) => acc + (t.unreadAdmin ?? 0),
    0
  );
}

export function listMessages(telegramId: string) {
  return chatMessages
    .filter((message) => message.telegramId === telegramId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function addMessage({
  telegramId,
  author,
  text,
  imageData,
}: {
  telegramId: string;
  author: 'user' | 'admin';
  text?: string;
  imageData?: string;
}) {
  const safeText = text ? text.slice(0, 2000) : undefined;
  const message: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    telegramId,
    author,
    text: safeText,
    imageData: trimImageData(imageData),
    createdAt: Date.now(),
  };

  chatMessages.push(message);
  const existing = chatThreads.get(telegramId);
  const nextStatus =
    author === 'user'
      ? existing?.status === 'resolved'
        ? 'new'
        : existing?.status ?? 'new'
      : existing?.status ?? 'open';
  chatThreads.set(telegramId, {
    telegramId,
    status: nextStatus,
    lastMessageAt: message.createdAt,
    unreadAdmin:
      author === 'user'
        ? (existing?.unreadAdmin ?? 0) + 1
        : existing?.unreadAdmin ?? 0,
    unreadUser:
      author === 'admin'
        ? (existing?.unreadUser ?? 0) + 1
        : existing?.unreadUser ?? 0,
  });

  const threadMessages = listMessages(telegramId);
  if (threadMessages.length > MAX_MESSAGES_PER_THREAD) {
    const toRemove = threadMessages.length - MAX_MESSAGES_PER_THREAD;
    let removed = 0;
    for (let i = 0; i < chatMessages.length && removed < toRemove; i += 1) {
      if (chatMessages[i].telegramId === telegramId) {
        chatMessages.splice(i, 1);
        i -= 1;
        removed += 1;
      }
    }
  }

  return message;
}

export function updateThreadStatus(telegramId: string, status: ChatThread['status']) {
  const existing = chatThreads.get(telegramId);
  if (!existing) {
    chatThreads.set(telegramId, {
      telegramId,
      status,
      lastMessageAt: Date.now(),
      unreadAdmin: 0,
      unreadUser: 0,
    });
    return;
  }
  chatThreads.set(telegramId, {
    ...existing,
    status,
  });
}

export function markThreadReadByAdmin(telegramId: string) {
  const existing = chatThreads.get(telegramId);
  if (!existing) return;
  chatThreads.set(telegramId, {
    ...existing,
    unreadAdmin: 0,
  });
}

export function markThreadReadByUser(telegramId: string) {
  const existing = chatThreads.get(telegramId);
  if (!existing) return;
  chatThreads.set(telegramId, {
    ...existing,
    unreadUser: 0,
  });
}

export function listBroadcasts() {
  return broadcasts.sort((a, b) => b.createdAt - a.createdAt);
}

export function addBroadcast({
  title,
  text,
  segment,
  imageData,
}: {
  title: string;
  text: string;
  segment: string;
  imageData?: string;
}) {
  const broadcast: Broadcast = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: title.slice(0, 120),
    text: text.slice(0, 2000),
    segment,
    imageData: trimImageData(imageData),
    createdAt: Date.now(),
  };

  broadcasts.push(broadcast);
  if (broadcasts.length > MAX_BROADCASTS) {
    broadcasts.shift();
  }
  return broadcast;
}

