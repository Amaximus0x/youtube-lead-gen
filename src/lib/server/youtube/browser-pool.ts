/**
 * Browser Instance Pool for Multi-Tab Search Support
 *
 * This module manages a pool of Puppeteer browser instances to support
 * multiple simultaneous searches across different browser tabs.
 *
 * Features:
 * - Pool of 3-5 browser instances (configurable)
 * - Round-robin allocation
 * - Automatic cleanup of idle instances
 * - Graceful degradation to single instance if pool fails
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import chromium from '@sparticuz/chromium';

interface BrowserPoolInstance {
  browser: Browser;
  inUse: boolean;
  lastUsed: number;
  sessionKey: string | null;
}

class BrowserPool {
  private pool: BrowserPoolInstance[] = [];
  private readonly MAX_INSTANCES = 3; // Maximum concurrent browser instances
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private initializationPromise: Promise<void> | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the browser pool
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.createInitialPool();
    return this.initializationPromise;
  }

  private async createInitialPool(): Promise<void> {
    console.log('[BrowserPool] Initializing browser pool...');

    try {
      // Create one browser instance initially (lazy loading for others)
      await this.createBrowserInstance();
      console.log('[BrowserPool] Initial browser instance created');

      // Start cleanup interval
      this.startCleanupInterval();
    } catch (error) {
      console.error('[BrowserPool] Failed to initialize pool:', error);
      throw error;
    }
  }

  /**
   * Create a new browser instance
   */
  private async createBrowserInstance(): Promise<BrowserPoolInstance> {
    const isProduction = process.env.NODE_ENV === 'production';

    const browser = await puppeteer.launch({
      args: isProduction
        ? [
            ...chromium.args,
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process'
          ]
        : [
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
      defaultViewport: chromium.defaultViewport,
      executablePath: isProduction ? await chromium.executablePath() : puppeteer.executablePath(),
      headless: true
    });

    const instance: BrowserPoolInstance = {
      browser,
      inUse: false,
      lastUsed: Date.now(),
      sessionKey: null
    };

    this.pool.push(instance);
    console.log(
      `[BrowserPool] Created browser instance ${this.pool.length}/${this.MAX_INSTANCES}`
    );

    return instance;
  }

  /**
   * Get an available browser instance (or create one if pool not full)
   */
  async acquire(sessionKey: string): Promise<{ browser: Browser; instanceId: number }> {
    console.log(`[BrowserPool] Acquiring browser for session: ${sessionKey}`);

    // First, try to find an instance already used by this session
    for (let i = 0; i < this.pool.length; i++) {
      const instance = this.pool[i];
      if (instance.sessionKey === sessionKey && !instance.inUse) {
        instance.inUse = true;
        instance.lastUsed = Date.now();
        console.log(`[BrowserPool] Reusing browser ${i + 1} for session ${sessionKey}`);
        return { browser: instance.browser, instanceId: i };
      }
    }

    // Try to find an idle instance
    for (let i = 0; i < this.pool.length; i++) {
      const instance = this.pool[i];
      if (!instance.inUse) {
        instance.inUse = true;
        instance.sessionKey = sessionKey;
        instance.lastUsed = Date.now();
        console.log(`[BrowserPool] Assigned browser ${i + 1} to session ${sessionKey}`);
        return { browser: instance.browser, instanceId: i };
      }
    }

    // All instances busy - create new one if pool not full
    if (this.pool.length < this.MAX_INSTANCES) {
      console.log('[BrowserPool] All browsers busy, creating new instance...');
      const instance = await this.createBrowserInstance();
      const instanceId = this.pool.length - 1;
      instance.inUse = true;
      instance.sessionKey = sessionKey;
      instance.lastUsed = Date.now();
      return { browser: instance.browser, instanceId };
    }

    // Pool full and all busy - wait for first available
    console.log('[BrowserPool] Pool full, waiting for available instance...');
    return this.waitForAvailableInstance(sessionKey);
  }

  /**
   * Wait for an available instance (with timeout)
   */
  private async waitForAvailableInstance(
    sessionKey: string,
    timeout: number = 30000
  ): Promise<{ browser: Browser; instanceId: number }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      for (let i = 0; i < this.pool.length; i++) {
        const instance = this.pool[i];
        if (!instance.inUse) {
          instance.inUse = true;
          instance.sessionKey = sessionKey;
          instance.lastUsed = Date.now();
          console.log(`[BrowserPool] Browser ${i + 1} became available for session ${sessionKey}`);
          return { browser: instance.browser, instanceId: i };
        }
      }

      // Wait 500ms before checking again
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error('Timeout waiting for available browser instance');
  }

  /**
   * Release a browser instance back to the pool
   */
  release(instanceId: number): void {
    if (instanceId >= 0 && instanceId < this.pool.length) {
      const instance = this.pool[instanceId];
      instance.inUse = false;
      instance.lastUsed = Date.now();
      console.log(
        `[BrowserPool] Released browser ${instanceId + 1} (session: ${instance.sessionKey})`
      );
      // Don't clear sessionKey - keep for potential reuse
    }
  }

  /**
   * Cleanup idle browser instances
   */
  private async cleanupIdleInstances(): Promise<void> {
    const now = Date.now();

    for (let i = this.pool.length - 1; i >= 1; i--) {
      // Keep at least 1 instance
      const instance = this.pool[i];

      if (!instance.inUse && now - instance.lastUsed > this.IDLE_TIMEOUT) {
        console.log(`[BrowserPool] Closing idle browser ${i + 1}`);
        try {
          await instance.browser.close();
          this.pool.splice(i, 1);
        } catch (error) {
          console.error(`[BrowserPool] Error closing browser ${i + 1}:`, error);
        }
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleInstances();
    }, 60000); // Check every minute
  }

  /**
   * Close all browser instances
   */
  async closeAll(): Promise<void> {
    console.log('[BrowserPool] Closing all browser instances...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await Promise.all(
      this.pool.map(async (instance, i) => {
        try {
          await instance.browser.close();
          console.log(`[BrowserPool] Closed browser ${i + 1}`);
        } catch (error) {
          console.error(`[BrowserPool] Error closing browser ${i + 1}:`, error);
        }
      })
    );

    this.pool = [];
    this.initializationPromise = null;
  }

  /**
   * Get pool status
   */
  getStatus(): {
    total: number;
    inUse: number;
    idle: number;
    maxInstances: number;
  } {
    const inUse = this.pool.filter((i) => i.inUse).length;
    return {
      total: this.pool.length,
      inUse,
      idle: this.pool.length - inUse,
      maxInstances: this.MAX_INSTANCES
    };
  }
}

// Singleton instance
let browserPoolInstance: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool();
  }
  return browserPoolInstance;
}

export async function closeBrowserPool(): Promise<void> {
  if (browserPoolInstance) {
    await browserPoolInstance.closeAll();
    browserPoolInstance = null;
  }
}
