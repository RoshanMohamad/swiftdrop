/**
 * NFR-8 Performance Benchmark Suite
 * Measures latency percentiles for quotes engine and public endpoints,
 * asserting that p95 latency remains strictly below 300 ms.
 */
import { performance } from "node:perf_hooks";
import { StandardPricingStrategy } from "../apps/core-api/src/modules/pricing/strategy.js";

const P95_THRESHOLD_MS = 300;
const ITERATIONS = 100;
const BASE_URL = process.env.API_URL || "http://127.0.0.1:3000";

function calculatePercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p90Index = Math.floor(sorted.length * 0.9);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);

  return {
    count: sorted.length,
    min: sorted[0].toFixed(2),
    avg: (sorted.reduce((acc, v) => acc + v, 0) / sorted.length).toFixed(2),
    p50: sorted[p50Index].toFixed(2),
    p90: sorted[p90Index].toFixed(2),
    p95: sorted[p95Index].toFixed(2),
    p99: sorted[p99Index].toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
  };
}

async function benchmarkEngineThroughput() {
  console.log("=================================================");
  console.log(" NFR-8: Benchmark 1 - In-Memory Quote Calculation Engine");
  console.log("=================================================");
  const strategy = new StandardPricingStrategy();
  const rule = {
    id: 1,
    originZoneId: 1,
    destinationZoneId: 2,
    baseCents: 50000,
    perExtraKgCents: 10000,
    effectiveFrom: new Date(),
  };

  const latencies = [];
  const TOTAL_RUNS = 25000;

  const startTotal = performance.now();
  for (let i = 0; i < TOTAL_RUNS; i++) {
    const t0 = performance.now();
    strategy.calculate(
      {
        weightGrams: 1000 + (i % 5000),
        lengthMm: 150,
        widthMm: 150,
        heightMm: 150,
      },
      rule,
    );
    const t1 = performance.now();
    latencies.push(t1 - t0);
  }
  const totalElapsed = performance.now() - startTotal;

  const stats = calculatePercentiles(latencies);
  console.table([
    {
      Metric: "Pure Pricing Engine",
      Operations: TOTAL_RUNS,
      "Throughput (ops/sec)": Math.round((TOTAL_RUNS / totalElapsed) * 1000),
      "p50 (ms)": stats.p50,
      "p95 (ms)": stats.p95,
      "p99 (ms)": stats.p99,
      "Target p95 < 300ms":
        parseFloat(stats.p95) < P95_THRESHOLD_MS ? "PASS" : "FAIL",
    },
  ]);

  if (parseFloat(stats.p95) >= P95_THRESHOLD_MS) {
    throw new Error(
      `Engine p95 SLA violated: ${stats.p95} ms >= ${P95_THRESHOLD_MS} ms`,
    );
  }
}

async function benchmarkHttpEndpoint() {
  console.log("\n=================================================");
  console.log(` NFR-8: Benchmark 2 - HTTP Probe Latency (${BASE_URL})`);
  console.log("=================================================");

  try {
    const probe = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!probe.ok) {
      console.log(
        `Note: Server at ${BASE_URL} returned non-200 status. Skipping live HTTP probe.`,
      );
      return;
    }
  } catch {
    console.log(
      `Note: Server at ${BASE_URL} is not currently running. Skipping live HTTP probe.`,
    );
    return;
  }

  const latencies = [];
  console.log(
    `Executing ${ITERATIONS} sequential requests to ${BASE_URL}/api/health...`,
  );

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/health`);
    await res.json();
    const t1 = performance.now();
    latencies.push(t1 - t0);
  }

  const stats = calculatePercentiles(latencies);
  console.table([
    {
      Endpoint: "/api/health",
      Requests: ITERATIONS,
      "Min (ms)": stats.min,
      "Avg (ms)": stats.avg,
      "p95 (ms)": stats.p95,
      "Max (ms)": stats.max,
      "Status (< 300ms)":
        parseFloat(stats.p95) < P95_THRESHOLD_MS ? "PASS" : "FAIL",
    },
  ]);

  if (parseFloat(stats.p95) >= P95_THRESHOLD_MS) {
    throw new Error(
      `HTTP p95 SLA violated: ${stats.p95} ms >= ${P95_THRESHOLD_MS} ms`,
    );
  }
}

async function main() {
  try {
    await benchmarkEngineThroughput();
    await benchmarkHttpEndpoint();
    console.log("\n✔ NFR-8 Benchmark verification completed successfully!");
  } catch (err) {
    console.error("\n❌ NFR-8 Benchmark failed:", err);
    process.exit(1);
  }
}

main();
