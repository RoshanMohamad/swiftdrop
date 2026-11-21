import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addPrice,
  addZone,
  deleteZone,
  listPrices,
  listZones,
  updateZone,
} from "../auth/client.js";
import type { PriceInput, ZoneInput } from "@swiftdrop/contracts";
import { Icon } from "../../shared/components/Icon.js";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The action could not be completed.";

const money = (cents: number) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
  }).format(cents / 100);

export function AdminZones() {
  const [zones, setZones] = useState<Awaited<ReturnType<typeof listZones>>>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    void listZones()
      .then(setZones)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await addZone({
        district: String(form.get("district")),
        town: String(form.get("town")),
        active: true,
      } satisfies ZoneInput);
      event.currentTarget.reset();
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function toggle(zone: (typeof zones)[number]) {
    setError("");
    try {
      await updateZone(zone.id, {
        district: zone.district,
        town: zone.town,
        active: !zone.active,
      });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await deleteZone(id);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const activeCount = zones.filter((zone) => zone.active).length;

  return (
    <section className="admin-panel">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>
            <span className="title-icon">
              <Icon name="pin" />
            </span>
            Service districts
          </h1>
          <p className="muted">
            Where SwiftDrop picks up and delivers. Pausing a district hides it
            from new bookings without touching existing parcels.
          </p>
        </div>
        <Link to="/admin/pricing" className="button-link secondary">
          Manage prices
        </Link>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="split-layout">
        <form className="form-card" onSubmit={(event) => void submit(event)}>
          <h2>Add a district</h2>
          <p className="fine">New districts start as active.</p>
          <div className="form-rows">
            <div className="field">
              <label htmlFor="district">
                <Icon name="pin" />
                District
              </label>
              <input
                id="district"
                name="district"
                required
                minLength={2}
                maxLength={80}
              />
            </div>
            <div className="field">
              <label htmlFor="town">
                <Icon name="building" />
                Public town
              </label>
              <input
                id="town"
                name="town"
                required
                minLength={2}
                maxLength={80}
              />
              <small>Shown on public tracking instead of a full address.</small>
            </div>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={pending}>
              <Icon name="plus" />
              {pending ? "Saving…" : "Add district"}
            </button>
          </div>
        </form>
        <div className="list-card">
          <div className="list-card-head">
            <h2>Districts</h2>
            <span className="count-pill">
              {activeCount} of {zones.length} active
            </span>
          </div>
          {zones.length === 0 ? (
            <p className="list-empty">No districts yet. Add the first one.</p>
          ) : (
            <ul className="row-list">
              {zones.map((zone) => (
                <li key={zone.id} className="list-row">
                  <Icon name="pin" className="list-row-icon" />
                  <div className="list-row-main">
                    <strong>{zone.district}</strong>
                    <span>{zone.town}</span>
                  </div>
                  <span
                    className={`user-status ${zone.active ? "user-status-active" : "user-status-paused"}`}
                  >
                    {zone.active ? "Active" : "Paused"}
                  </span>
                  <div className="row-actions">
                    <button
                      className="pill-action success"
                      onClick={() => void toggle(zone)}
                    >
                      <Icon name={zone.active ? "pause" : "play"} />
                      {zone.active ? "Stop serving" : "Serve district"}
                    </button>
                    <button
                      className="pill-action danger"
                      onClick={() => void remove(zone.id)}
                    >
                      <Icon name="trash" />
                      Delete district
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function AdminPricing() {
  const [zones, setZones] = useState<Awaited<ReturnType<typeof listZones>>>([]);
  const [prices, setPrices] = useState<Awaited<ReturnType<typeof listPrices>>>(
    [],
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    void Promise.all([listZones(), listPrices()])
      .then(([z, p]) => {
        setZones(z);
        setPrices(p);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await addPrice({
        originZoneId: Number(form.get("origin")),
        destinationZoneId: Number(form.get("destination")),
        baseCents: Number(form.get("base")),
        perExtraKgCents: Number(form.get("extra")),
        effectiveFrom: new Date(String(form.get("effective"))).toISOString(),
      } satisfies PriceInput);
      event.currentTarget.reset();
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const zoneName = (id: number) =>
    zones.find((zone) => zone.id === id)?.district ?? `District ${id}`;
  const activeZones = zones.filter((zone) => zone.active);

  return (
    <section className="admin-panel">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>
            <span className="title-icon">
              <Icon name="tag" />
            </span>
            Versioned prices
          </h1>
          <p className="muted">
            Each change adds a version from its effective date, so earlier
            receipts keep the price they were booked at.
          </p>
        </div>
        <Link to="/admin/zones" className="button-link secondary">
          Manage districts
        </Link>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="split-layout">
        <form className="form-card" onSubmit={(event) => void submit(event)}>
          <h2>Add a price version</h2>
          <p className="fine">Amounts are in LKR cents: 57000 = LKR 570.00.</p>
          <div className="form-rows">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="origin">
                  <Icon name="pin" />
                  Pickup district
                </label>
                <select id="origin" name="origin" required>
                  {activeZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.district}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="destination">
                  <Icon name="pin" />
                  Delivery district
                </label>
                <select id="destination" name="destination" required>
                  {activeZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.district}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="base">
                  <Icon name="coins" />
                  Base price (LKR cents)
                </label>
                <input id="base" name="base" type="number" min="0" required />
              </div>
              <div className="field">
                <label htmlFor="extra">
                  <Icon name="box" />
                  Price per extra kg (LKR cents)
                </label>
                <input id="extra" name="extra" type="number" min="0" required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="effective">
                <Icon name="calendar" />
                Effective from
              </label>
              <input
                id="effective"
                name="effective"
                type="datetime-local"
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={pending}>
              <Icon name="plus" />
              {pending ? "Saving…" : "Add price version"}
            </button>
          </div>
        </form>
        <div className="list-card">
          <div className="list-card-head">
            <h2>Rate card</h2>
            <span className="count-pill">
              {prices.length} {prices.length === 1 ? "version" : "versions"}
            </span>
          </div>
          {prices.length === 0 ? (
            <p className="list-empty">No prices yet. Add the first version.</p>
          ) : (
            <ul className="row-list">
              {prices.map((price) => (
                <li key={price.id} className="list-row">
                  <Icon name="tag" className="list-row-icon" />
                  <div className="list-row-main">
                    <strong>
                      {zoneName(price.originZoneId)} →{" "}
                      {zoneName(price.destinationZoneId)}
                    </strong>
                    <span>
                      <code className="route-id">
                        Route {price.originZoneId} → {price.destinationZoneId}
                      </code>{" "}
                      · from {new Date(price.effectiveFrom).toLocaleString()}
                    </span>
                  </div>
                  <div className="price-figure">
                    <strong>{money(price.baseCents)}</strong>
                    <span>+ {money(price.perExtraKgCents)} per extra kg</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
