const STORAGE_KEYS = {
  BOOKS: "bookkeep_books",
  SESSIONS: "bookkeep_sessions",
  AUTH: "bookkeep_auth",
} as const;

export function saveToLocalStorage<T>(key: string, data: T): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
}

export function getFromLocalStorage<T>(key: string): T | null {
  try {
    if (typeof window !== "undefined") {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
  } catch (error) {
    console.error("Error reading from localStorage:", error);
  }
  return null;
}

export function removeFromLocalStorage(key: string): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error("Error removing from localStorage:", error);
  }
}

export function saveBooks(books: unknown[]): void {
  saveToLocalStorage(STORAGE_KEYS.BOOKS, books);
}

export function getBooks(): unknown[] | null {
  return getFromLocalStorage<unknown[]>(STORAGE_KEYS.BOOKS);
}

export function saveSessions(sessions: unknown[]): void {
  saveToLocalStorage(STORAGE_KEYS.SESSIONS, sessions);
}

export function getSessions(): unknown[] | null {
  return getFromLocalStorage<unknown[]>(STORAGE_KEYS.SESSIONS);
}

export function saveAuthState(authState: unknown): void {
  saveToLocalStorage(STORAGE_KEYS.AUTH, authState);
}

export function getAuthState(): unknown {
  return getFromLocalStorage(STORAGE_KEYS.AUTH);
}

export function clearAll(): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    removeFromLocalStorage(key);
  });
}

