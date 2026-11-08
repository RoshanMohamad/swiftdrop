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

  return (
    <section className="auth-panel">
      <span className="eyebrow">Administration</span>
      <h1>Service districts</h1>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="district">District</label>
        <input
          id="district"
          name="district"
          required
          minLength={2}
          maxLength={80}
        />
        <label htmlFor="town">Public town</label>
        <input id="town" name="town" required minLength={2} maxLength={80} />
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Add district"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="parcel-list">
        {zones.map((zone) => (
          <li key={zone.id}>
            {zone.district}
            <span>
              {zone.town} · {zone.active ? "active" : "inactive"}
            </span>
            <div className="page-controls">
              <button className="secondary" onClick={() => void toggle(zone)}>
                {zone.active ? "Stop serving" : "Serve district"}
              </button>
              <button
                className="secondary"
                onClick={() => void remove(zone.id)}
              >
                Delete district
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Link to="/admin/pricing">Manage prices</Link>
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

  return (
    <section className="auth-panel">
      <span className="eyebrow">Administration</span>
      <h1>Versioned prices</h1>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="origin">Pickup district</label>
        <select id="origin" name="origin" required>
          {zones
            .filter((zone) => zone.active)
            .map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.district}
              </option>
            ))}
        </select>
        <label htmlFor="destination">Delivery district</label>
        <select id="destination" name="destination" required>
          {zones
            .filter((zone) => zone.active)
            .map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.district}
              </option>
            ))}
        </select>
        <label htmlFor="base">Base price (LKR cents)</label>
        <input id="base" name="base" type="number" min="0" required />
        <label htmlFor="extra">Price per extra kg (LKR cents)</label>
        <input id="extra" name="extra" type="number" min="0" required />
        <label htmlFor="effective">Effective from</label>
        <input id="effective" name="effective" type="datetime-local" required />
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Add price version"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="parcel-list">
        {prices.map((price) => (
          <li key={price.id}>
            Route {price.originZoneId} → {price.destinationZoneId}
            <span>
              {money(price.baseCents)} + {money(price.perExtraKgCents)}/kg ·
              from {new Date(price.effectiveFrom).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/admin/zones">Manage districts</Link>
    </section>
  );
}
