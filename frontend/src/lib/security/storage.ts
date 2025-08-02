import { encrypt, decrypt } from "@/lib/security/crypto";

class SecureStorage {
  private readonly prefix = "hm_secure_";

  setItem(key: string, value: any, options?: StorageOptions) {
    const data = JSON.stringify(value);
    const encrypted = options?.encrypt ? encrypt(data) : data;

    if (options?.session) {
      sessionStorage.setItem(this.prefix + key, encrypted);
    } else {
      localStorage.setItem(this.prefix + key, encrypted);
    }
  }

  getItem<T>(key: string, options?: StorageOptions): T | null {
    const storage = options?.session ? sessionStorage : localStorage;
    const encrypted = storage.getItem(this.prefix + key);

    if (!encrypted) return null;

    try {
      const data = options?.encrypt ? decrypt(encrypted) : encrypted;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  removeItem(key: string, options?: StorageOptions) {
    const storage = options?.session ? sessionStorage : localStorage;
    storage.removeItem(this.prefix + key);
  }

  clear(options?: StorageOptions) {
    const storage = options?.session ? sessionStorage : localStorage;
    const keys = Object.keys(storage);

    keys.forEach((key) => {
      if (key.startsWith(this.prefix)) {
        storage.removeItem(key);
      }
    });
  }
}

export const secureStorage = new SecureStorage();
