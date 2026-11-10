import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDailyReport, downloadDailyReportCsv } from "../auth/client.js";
import type { DailyReportSummary } from "@swiftdrop/contracts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The action could not be completed.";

export function AdminReports() {
  const [report, setReport] = useState<DailyReportSummary | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Default date range: last 14 days
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(twoWeeksAgo);
  const [to, setTo] = useState(today);

  const load = useCallback((fromDate: string, toDate: string) => {
    setPending(true);
    setError("");
    void getDailyReport(fromDate, toDate)
      .then(setReport)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setPending(false));
  }, []);

  useEffect(() => {
    load(from, to);
  }, [load, from, to]);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    load(from, to);
  }

  async function handleExportCsv() {
    setDownloading(true);
    setError("");
    try {
      await downloadDailyReportCsv(from, to);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="auth-panel" style={{ maxWidth: "800px" }}>
      <span className="eyebrow">Operations & Analytics</span>
      <h1>Daily Delivery Reports</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        Review daily delivery volumes, failure rates, and active shipments.
        Export summary data as CSV for offline audits.
      </p>

      {/* Filter and Export Form */}
      <form
        onSubmit={handleFilter}
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <label
            htmlFor="from"
            style={{ display: "block", marginBottom: "0.25rem" }}
          >
            From
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div>
          <label
            htmlFor="to"
            style={{ display: "block", marginBottom: "0.25rem" }}
          >
            To
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Filtering…" : "Filter"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => void handleExportCsv()}
          disabled={downloading || pending}
        >
          {downloading ? "Exporting…" : "Export CSV"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: "#d32f2f" }}>
          {error}
        </p>
      )}

      {/* KPI Summary Cards */}
      {report && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #ddd",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#666" }}>
                Total Booked
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: "bold" }}>
                {report.totalBooked}
              </div>
            </div>
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #ddd",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#2e7d32" }}>
                Delivered
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "bold",
                  color: "#2e7d32",
                }}
              >
                {report.totalDelivered}
              </div>
            </div>
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #ddd",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#c62828" }}>
                Failed
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "bold",
                  color: "#c62828",
                }}
              >
                {report.totalFailed}
              </div>
            </div>
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid #ddd",
                background: "#fafafa",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "#1565c0" }}>
                Success Rate
              </div>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "bold",
                  color: "#1565c0",
                }}
              >
                {report.overallSuccessRatePercent.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Daily Breakdown Table */}
          <h2>Daily Breakdown</h2>
          {report.days.length === 0 ? (
            <p>No delivery activity found in the selected date range.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  marginTop: "0.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid #ccc" }}>
                    <th style={{ padding: "0.5rem" }}>Date</th>
                    <th style={{ padding: "0.5rem" }}>Booked</th>
                    <th style={{ padding: "0.5rem" }}>Delivered</th>
                    <th style={{ padding: "0.5rem" }}>Failed</th>
                    <th style={{ padding: "0.5rem" }}>In Transit</th>
                    <th style={{ padding: "0.5rem" }}>Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((row) => (
                    <tr
                      key={row.date}
                      style={{ borderBottom: "1px solid #eee" }}
                    >
                      <td style={{ padding: "0.5rem" }}>{row.date}</td>
                      <td style={{ padding: "0.5rem" }}>{row.totalBooked}</td>
                      <td style={{ padding: "0.5rem", color: "#2e7d32" }}>
                        {row.totalDelivered}
                      </td>
                      <td style={{ padding: "0.5rem", color: "#c62828" }}>
                        {row.totalFailed}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {row.totalInTransit}
                      </td>
                      <td style={{ padding: "0.5rem", fontWeight: "600" }}>
                        {row.successRatePercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: "1rem" }} className="account-links">
        <Link to="/admin/zones">Manage districts</Link>
        <Link to="/admin/pricing">Manage pricing</Link>
      </div>
    </section>
  );
}
