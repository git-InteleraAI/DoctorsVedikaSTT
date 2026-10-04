const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

/**
 * ============================================================
 * GEMINI REQUEST MANAGER & CONCURRENCY CONTROLLER
 * ============================================================
 *
 * Production-grade queue and concurrency manager for Google Gemini API calls.
 *
 * Capabilities:
 * 1. Priority Queue: HIGH priority for Save & Process final summary, LOW for background AI.
 * 2. Concurrency Semaphore: GEMINI_MAX_CONCURRENCY limit (default: 5).
 * 3. Rate Limit (429) & 5xx Resilience: Bounded exponential backoff + full jitter.
 * 4. Retry-After Header Compliance: Parses provider retry headers.
 * 5. Idempotency Guard: Deduplicates simultaneous/duplicate requests by key.
 * 6. Zero Transcript Loss: Decoupled summary generation from transcript storage.
 * 7. Comprehensive Operational Metrics: Tracks throughput, latency (avg, P95, P99), 429s, errors, queue depth.
 */

class GeminiRequestManager {
    constructor() {
        this.maxConcurrency = parseInt(process.env.GEMINI_MAX_CONCURRENCY || "5", 10);
        this.maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES || "4", 10);
        this.timeoutMs = parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS || "20000", 10);
        this.maxQueueSize = parseInt(process.env.GEMINI_QUEUE_MAX_SIZE || "1000", 10);

        this.activeRequests = 0;
        this.highPriorityQueue = []; // Final Save & Process requests
        this.lowPriorityQueue = [];  // Background rolling context

        this.inFlightIdempotentRequests = new Map(); // key -> Promise

        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimit429Count: 0,
            serverError5xxCount: 0,
            timeoutCount: 0,
            retryCount: 0,
            latencies: [], // ms
            activeConcurrency: 0,
            queueDepth: 0,
        };
    }

    /**
     * Enqueue a Gemini API request with priority and idempotency key
     */
    async enqueue({ priority = "HIGH", idempotencyKey = null, requestFn }) {
        if (idempotencyKey && this.inFlightIdempotentRequests.has(idempotencyKey)) {
            console.log(`[GeminiRequestManager] Reusing in-flight request for idempotencyKey: ${idempotencyKey}`);
            return this.inFlightIdempotentRequests.get(idempotencyKey);
        }

        if (this.highPriorityQueue.length + this.lowPriorityQueue.length >= this.maxQueueSize) {
            const err = new Error(`Gemini queue capacity exceeded (${this.maxQueueSize}). Request rejected.`);
            err.status = 429;
            throw err;
        }

        const taskPromise = new Promise((resolve, reject) => {
            const item = {
                priority,
                idempotencyKey,
                requestFn,
                resolve,
                reject,
                enqueuedAt: Date.now(),
            };

            if (priority === "HIGH") {
                this.highPriorityQueue.push(item);
            } else {
                this.lowPriorityQueue.push(item);
            }

            this.updateQueueMetrics();
            this.processNext();
        });

        if (idempotencyKey) {
            this.inFlightIdempotentRequests.set(idempotencyKey, taskPromise);
            taskPromise.finally(() => {
                this.inFlightIdempotentRequests.delete(idempotencyKey);
            });
        }

        return taskPromise;
    }

    /**
     * Process next item in priority queue
     */
    processNext() {
        if (this.activeRequests >= this.maxConcurrency) {
            return;
        }

        // HIGH priority queue (Save & Process) takes precedence
        let item = this.highPriorityQueue.shift();
        if (!item) {
            item = this.lowPriorityQueue.shift();
        }

        if (!item) {
            return;
        }

        this.activeRequests++;
        this.updateQueueMetrics();

        this.executeTaskWithRetry(item)
            .then((result) => item.resolve(result))
            .catch((err) => {
                if (typeof item.reject === "function") {
                    try {
                        item.reject(err);
                    } catch (rejectErr) {
                        console.warn("[GeminiRequestManager] Error handling rejection:", rejectErr.message);
                    }
                }
            })
            .finally(() => {
                this.activeRequests--;
                this.updateQueueMetrics();
                this.processNext();
            });
    }

    /**
     * Execute task with bounded exponential backoff + jitter
     */
    async executeTaskWithRetry(item) {
        const { requestFn } = item;
        let attempt = 0;
        let baseDelay = 1000; // 1 sec base delay

        while (true) {
            attempt++;
            this.metrics.totalRequests++;

            const startTime = Date.now();

            try {
                // Execute request function with timeout race & timer cleanup
                let timerId = null;
                const timeoutPromise = new Promise((_, reject) => {
                    timerId = setTimeout(() => {
                        const timeoutErr = new Error(`Gemini request timed out after ${this.timeoutMs}ms`);
                        timeoutErr.code = "ETIMEDOUT";
                        reject(timeoutErr);
                    }, this.timeoutMs);
                });

                const reqPromise = requestFn();
                // Attach a silent error handler to reqPromise so if timeoutPromise wins the race,
                // any later rejection of reqPromise is caught safely without crashing Node.js
                reqPromise.catch(() => {});

                const result = await Promise.race([reqPromise, timeoutPromise]);
                if (timerId) clearTimeout(timerId);

                const duration = Date.now() - startTime;

                this.recordSuccess(duration);
                return result;
            } catch (err) {
                const duration = Date.now() - startTime;
                const errMsg = typeof err?.message === "string" ? err.message : JSON.stringify(err);
                const isRateLimit = err?.status === 429 || /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(errMsg);
                const isServerError = err?.status >= 500 && err?.status < 600 || /500|502|503|504|UNAVAILABLE|INTERNAL/i.test(errMsg);
                const isTimeout = err?.code === "ETIMEDOUT" || /timeout/i.test(errMsg);

                if (isRateLimit) this.metrics.rateLimit429Count++;
                if (isServerError) this.metrics.serverError5xxCount++;
                if (isTimeout) this.metrics.timeoutCount++;

                const isRetryable = isRateLimit || isServerError || isTimeout;

                if (isRetryable && attempt <= this.maxRetries) {
                    this.metrics.retryCount++;

                    // Parse Retry-After if available
                    let delayMs = 0;
                    if (err?.response?.headers?.get) {
                        const retryAfterHeader = err.response.headers.get("retry-after");
                        if (retryAfterHeader) {
                            const parsedVal = parseInt(retryAfterHeader, 10);
                            if (!isNaN(parsedVal)) {
                                delayMs = parsedVal * 1000;
                            }
                        }
                    }

                    if (!delayMs) {
                        // Exponential backoff with full jitter: delay = random(0, baseDelay * 2^attempt)
                        const maxDelay = baseDelay * Math.pow(2, attempt - 1);
                        delayMs = Math.floor(Math.random() * maxDelay);
                    }

                    const shortErrMsg = isRateLimit ? "429 Quota Exceeded" : (err?.message || "Error");
                    console.warn(`[GeminiRequestManager] Task attempt ${attempt}/${this.maxRetries} failed (${shortErrMsg}). Retrying in ${delayMs}ms...`);
                    await new Promise((r) => setTimeout(r, delayMs));
                } else {
                    this.metrics.failedRequests++;
                    const shortErrMsg = isRateLimit ? "429 Quota Exceeded" : (err?.message || "Error");
                    console.error(`[GeminiRequestManager] Task failed permanently after ${attempt} attempts: ${shortErrMsg}`);
                    throw err;
                }
            }
        }
    }

    recordSuccess(durationMs) {
        this.metrics.successfulRequests++;
        this.metrics.latencies.push(durationMs);
        if (this.metrics.latencies.length > 500) {
            this.metrics.latencies.shift();
        }
    }

    updateQueueMetrics() {
        this.metrics.activeConcurrency = this.activeRequests;
        this.metrics.queueDepth = this.highPriorityQueue.length + this.lowPriorityQueue.length;
    }

    /**
     * Return snapshot of operational metrics
     */
    getMetrics() {
        const sortedLatencies = [...this.metrics.latencies].sort((a, b) => a - b);
        const count = sortedLatencies.length;
        const avg = count > 0 ? Math.round(sortedLatencies.reduce((a, b) => a + b, 0) / count) : 0;
        const p95 = count > 0 ? sortedLatencies[Math.floor(count * 0.95)] : 0;
        const p99 = count > 0 ? sortedLatencies[Math.floor(count * 0.99)] : 0;

        return {
            ...this.metrics,
            maxConcurrencyConfigured: this.maxConcurrency,
            avgLatencyMs: avg,
            p95LatencyMs: p95,
            p99LatencyMs: p99,
        };
    }
}

// Singleton instance across backend Node process
const geminiRequestManager = new GeminiRequestManager();

module.exports = {
    geminiRequestManager,
    GeminiRequestManager,
};
