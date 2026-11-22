import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDailyReport, downloadDailyReportCsv } from "../auth/client.js";
import type { DailyReportSummary } from "@swiftdrop/contracts";
import { Icon } from "../../shared/components/Icon.js";

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
    <section className="admin-panel">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">Operations & Analytics</span>
          <h1>
            <span className="title-icon">
              <Icon name="chart" />
            </span>
            Daily Delivery Reports
          </h1>
          <p className="muted">
            Review daily delivery volumes, failure rates, and active shipments.
            Export summary data as CSV for offline audits.
          </p>
        </div>
        <div className="heading-actions">
          <Link to="/admin/zones" className="text-button">
            Manage districts
          </Link>
          <Link to="/admin/pricing" className="text-button">
            Manage pricing
          </Link>
        </div>
      </header>

      <form onSubmit={handleFilter} className="filter-row stacked">
        <div>
          <label htmlFor="from">From</label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="to">To</label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
        <div className="filter-actions">
          <button className="primary" type="submit" disabled={pending}>
            <Icon name="filter" />
            {pending ? "Filtering…" : "Filter"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={downloading || pending}
          >
            <Icon name="download" />
            {downloading ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <Icon name="box" />
              <span className="stat-label">Total Booked</span>
              <strong className="stat-value">{report.totalBooked}</strong>
            </div>
            <div className="stat-tile tone-success">
              <Icon name="check-circle" />
              <span className="stat-label">Delivered</span>
              <strong className="stat-value">{report.totalDelivered}</strong>
            </div>
            <div className="stat-tile tone-danger">
              <Icon name="x-circle" />
              <span className="stat-label">Failed</span>
              <strong className="stat-value">{report.totalFailed}</strong>
            </div>
            <div className="stat-tile feature">
              <Icon name="chart" />
              <span className="stat-label">Success Rate</span>
              <strong className="stat-value">
                {report.overallSuccessRatePercent.toFixed(1)}%
              </strong>
            </div>
          </div>

          <div className="section-head">
            <h2>Daily Breakdown</h2>
            <span className="fine">
              {from} to {to}
            </span>
          </div>
          {report.days.length === 0 ? (
            <div className="empty-state">
              <p>No delivery activity found in the selected date range.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Booked</th>
                    <th className="num">Delivered</th>
                    <th className="num">Failed</th>
                    <th className="num">In Transit</th>
                    <th className="num">Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td className="num">{row.totalBooked}</td>
                      <td className="num text-success">{row.totalDelivered}</td>
                      <td className="num text-danger">{row.totalFailed}</td>
                      <td className="num">{row.totalInTransit}</td>
                      <td className="num strong">
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
    </section>
  );
}
