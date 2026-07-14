/**
 * lib/telegramManager.ts — MTProto Client Pool
 *
 * The TelegramManager is a singleton that keeps one live TelegramClient per
 * user. This is the key to low-latency streaming: connecting to Telegram's
 * MTProto takes ~1-2 seconds, so we pay that cost once (at login or first
 * play) and reuse the connection for every subsequent request.
 *
 * Key behaviours:
 *   • getClient()     — returns an existing connected client or creates one.
 *                       Deduplicates concurrent connection attempts with a
 *                       Promise map so two simultaneous requests for the same
 *                       user don't open two connections.
 *   • cleanupIdle()   — runs every 10 minutes and disconnects clients that
 *                       haven't been used in 30 minutes, freeing server memory.
 *   • stopClient()    — explicitly disconnects and destroys a client (called
 *                       on logout).
 */

import { TelegramClient } from "telegram";
import { createTelegramClient } from "./telegram.js";
import { AppError } from "../utils/AppError.js";

class TelegramManager {
  /**
   * Active client pool.
   * Key: userId (string)  |  Value: { instance, lastUsed timestamp }
   */
  private clients: Map<string, { instance: TelegramClient; lastUsed: number }> =
    new Map();

  /**
   * In-flight connection promises.
   * Prevents duplicate connections when two requests arrive for the same user
   * before the first connection has finished.
   */
  private initPromises: Map<string, Promise<TelegramClient>> = new Map();

  constructor() {
    // Idle-client cleanup runs every 10 minutes in the background
    setInterval(() => this.cleanupIdleClients(), 10 * 60 * 1000);
  }

  /**
   * Returns a connected TelegramClient for the given user.
   *
   * @param userId        - MongoDB user ID (used as the pool key)
   * @param sessionString - The user's saved Telegram session string
   */
  async getClient(
    userId: string,
    sessionString: string,
  ): Promise<TelegramClient> {
    const existing = this.clients.get(userId);

    // Fast path: client already connected — just refresh the activity timestamp
    if (existing && existing.instance.connected) {
      existing.lastUsed = Date.now();
      return existing.instance;
    }

    // Deduplication: if a connection is already in progress, wait for it
    if (this.initPromises.has(userId)) {
      return this.initPromises.get(userId)!;
    }

    // Slow path: create and connect a new client
    const connectionTask = (async () => {
      try {
        const client = createTelegramClient(sessionString);
        await client.connect();

        this.clients.set(userId, { instance: client, lastUsed: Date.now() });
        return client;
      } finally {
        // Always remove the in-flight promise, even if connection failed
        this.initPromises.delete(userId);
      }
    })();

    this.initPromises.set(userId, connectionTask);
    return connectionTask;
  }

  /**
   * Disconnects clients that haven't been used in the last 30 minutes.
   * Called automatically every 10 minutes by the constructor's setInterval.
   */
  private async cleanupIdleClients() {
    const idleLimit = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = Date.now();

    for (const [userId, entry] of this.clients.entries()) {
      if (now - entry.lastUsed > idleLimit) {
        console.log(`🧹 Auto-disconnecting idle user: ${userId}`);
        await this.stopClient(userId);
      }
    }
  }

  /**
   * Explicitly disconnects and removes a user's client from the pool.
   * Called on logout to free the MTProto connection immediately.
   */
  async stopClient(userId: string) {
    const entry = this.clients.get(userId);
    if (entry) {
      try {
        await entry.instance.disconnect();
        // destroy() cleans up internal event emitters and timers inside GramJS
        await entry.instance.destroy();
      } catch (e: any) {
        console.error("Error during disconnect:", e);
        throw new AppError(`An error occured: ${e.mesage || e}`);
      }
      this.clients.delete(userId);
      this.initPromises.delete(userId);
    }
  }
}

// Export a single shared instance — all parts of the app use the same pool
export const telegramManager = new TelegramManager();
