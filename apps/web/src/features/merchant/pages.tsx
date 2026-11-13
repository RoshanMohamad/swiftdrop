import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { merchantRegistrationSchema } from "@swiftdrop/contracts";
import {
  createMerchantApiClientSchema,
  type MerchantApiClientScope,
} from "@swiftdrop/contracts";
import {
  createMerchantApiClient,
  errorMessage,
  listMerchantApiClients,
  listMerchants,
  registerMerchant,
  reviewMerchant,
  revokeMerchantApiClient,
  rotateMerchantApiClient,
  getMerchantWebhookSettings,
  saveMerchantWebhookSettings,
  rotateMerchantWebhookSecret,
} from "../auth/client.js";

type Merchant = Awaited<ReturnType<typeof listMerchants>>["items"][number];
type MerchantApiClient = Awaited<
  ReturnType<typeof listMerchantApiClients>
>["items"][number];

export function MerchantClients() {
  const [clients, setClients] = useState<MerchantApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secretResult, setSecretResult] = useState<Awaited<
    ReturnType<typeof createMerchantApiClient>
  > | null>(null);
  const [refresh, setRefresh] = useState(0);
  const actionLock = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void listMerchantApiClients()
      .then(({ items }) => {
        if (live) setClients(items);
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [refresh]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = {
      name: data.get("name"),
      scopes: data.getAll("scopes"),
    };
    const parsed = createMerchantApiClientSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the client details.");
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await createMerchantApiClient(parsed.data);
      setSecretResult(result);
      form.reset();
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function rotate(client: MerchantApiClient) {
    if (actionLock.current || client.revokedAt) return;
    if (
      !window.confirm(
        `Rotate credentials for “${client.name}”? The old secret stops working immediately.`,
      )
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setSecretResult(null);
    try {
      setSecretResult(await rotateMerchantApiClient(client.id));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function revoke(client: MerchantApiClient) {
    if (actionLock.current || client.revokedAt) return;
    if (!window.confirm(`Revoke “${client.name}”? This cannot be undone.`))
      return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setSecretResult(null);
    try {
      await revokeMerchantApiClient(client.id);
      setMessage(`${client.name} was revoked.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secretResult) return;
    try {
      await navigator.clipboard.writeText(secretResult.clientSecret);
      setMessage(
        "Secret copied. Store it in your password manager; it cannot be viewed again.",
      );
    } catch {
      setMessage(
        "Copy was unavailable. Select and copy the secret now; it cannot be viewed again.",
      );
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Merchant platform</span>
          <h1>API clients</h1>
          <p className="muted">
            Create credentials for your integration. Secrets are shown once and
            stored as hashes.
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {secretResult && (
        <div className="notice secret-panel" role="alert">
          <h2>Copy this secret now</h2>
          <p>
            This secret is shown once. Closing or refreshing this page loses it.
          </p>
          <label>
            Client ID
            <input
              readOnly
              autoComplete="off"
              value={secretResult.client.clientId}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <label>
            Client secret
            <input
              readOnly
              autoComplete="off"
              value={secretResult.clientSecret}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button className="secondary" onClick={() => void copySecret()}>
            Copy secret
          </button>
          <button className="secondary" onClick={() => setSecretResult(null)}>
            I’ve saved it
          </button>
        </div>
      )}
      <form
        className="merchant-client-form"
        onSubmit={(event) => void create(event)}
      >
        <h2>Create API client</h2>
        <label htmlFor="merchant-client-name">Client name</label>
        <input
          id="merchant-client-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          disabled={busy}
        />
        <fieldset>
          <legend>Scopes</legend>
          {(
            [
              "orders:read",
              "orders:write",
            ] as const satisfies readonly MerchantApiClientScope[]
          ).map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                disabled={busy}
              />{" "}
              {scope}
            </label>
          ))}
        </fieldset>
        <button className="primary" disabled={busy}>
          {busy ? "Working…" : "Create client"}
        </button>
      </form>
      <h2>Existing clients</h2>
      {loading ? (
        <p role="status">Loading API clients…</p>
      ) : clients.length === 0 ? (
        <p className="notice">
          No API clients yet. Create one after your merchant account is
          approved.
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Client ID</th>
                <th scope="col">Scopes</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{client.clientId}</td>
                  <td>{client.scopes.join(", ")}</td>
                  <td>{client.revokedAt ? "Revoked" : "Active"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="secondary"
                        disabled={busy || Boolean(client.revokedAt)}
                        onClick={() => void rotate(client)}
                      >
                        Rotate
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || Boolean(client.revokedAt)}
                        onClick={() => void revoke(client)}
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MerchantWebhookSettings() {
  const [settings, setSettings] = useState<
    Awaited<ReturnType<typeof getMerchantWebhookSettings>> | null
  >(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const actionLock = useRef(false);

  useEffect(() => {
    let live = true;
    void getMerchantWebhookSettings()
      .then((result) => {
        if (!live) return;
        setSettings(result);
        setUrl(result.url ?? "");
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setSigningSecret(null);
    try {
      const result = await saveMerchantWebhookSettings(url);
      setSettings(result.settings);
      setUrl(result.settings.url ?? "");
      setSigningSecret(result.signingSecret);
      setMessage(
        result.signingSecret
          ? "Webhook configured. Save the signing secret now; it will not be shown again."
          : "Webhook URL updated.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function rotate() {
    if (actionLock.current || !settings?.configured) return;
    if (
      !window.confirm(
        "Rotate the webhook signing secret? The old secret stops working immediately.",
      )
    )
      return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setSigningSecret(null);
    try {
      const result = await rotateMerchantWebhookSecret();
      setSigningSecret(result.signingSecret);
      setMessage("Secret rotated. Save the new signing secret now.");
      setSettings(await getMerchantWebhookSettings());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!signingSecret) return;
    try {
      await navigator.clipboard.writeText(signingSecret);
      setMessage("Signing secret copied. Store it securely; it cannot be viewed again.");
    } catch {
      setMessage("Copy is unavailable. Select and save the secret now; it cannot be viewed again.");
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Merchant platform</span>
          <h1>Webhook settings</h1>
          <p className="muted">
            Configure a public HTTPS endpoint to receive delivery events. The
            signing secret is encrypted at rest and shown only when created or
            rotated.
          </p>
        </div>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice success" role="status">{message}</p>}
      {signingSecret && (
        <div className="notice secret-panel" role="alert">
          <h2>Save this signing secret now</h2>
          <p>It will not be available again after you close this message.</p>
          <label htmlFor="merchant-webhook-secret">Signing secret</label>
          <input
            id="merchant-webhook-secret"
            readOnly
            autoComplete="off"
            value={signingSecret}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="secondary" onClick={() => void copySecret()}>
            Copy secret
          </button>
          <button className="secondary" onClick={() => setSigningSecret(null)}>
            I’ve saved it
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading webhook settings…</p>
      ) : (
        <form className="merchant-client-form" onSubmit={(event) => void save(event)}>
          <h2>{settings?.configured ? "Update endpoint" : "Configure endpoint"}</h2>
          <label htmlFor="merchant-webhook-url">Webhook URL</label>
          <input
            id="merchant-webhook-url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://hooks.example.com/swiftdrop"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            required
            maxLength={2048}
            disabled={busy}
          />
          <p className="muted">
            HTTPS is required. Loopback, private-network and link-local
            destinations are blocked.
          </p>
          <button className="primary" disabled={busy || !url.trim()}>
            {busy ? "Saving…" : "Save webhook URL"}
          </button>
          {settings?.configured && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => void rotate()}
            >
              Rotate signing secret
            </button>
          )}
        </form>
      )}
      {settings?.configured && (
        <p className="muted">
          Configured endpoint: <code>{settings.url}</code>
          {settings.updatedAt && (
            <> · Updated {new Date(settings.updatedAt).toLocaleString()}</>
          )}
        </p>
      )}
    </section>
  );
}

export function MerchantSignup() {
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const element = event.currentTarget;
    const values = Object.fromEntries(new FormData(element));
    const input = {
      businessName: values.businessName,
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      password: values.password,
    };
    const parsed = merchantRegistrationSchema.safeParse(input);
    const nextErrors: Record<string, string[]> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        (nextErrors[String(issue.path[0] ?? "form")] ??= []).push(
          issue.message,
        );
    if (values.password !== values.confirm)
      nextErrors.confirm = ["Passwords do not match."];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Check the highlighted fields.");
      element
        .querySelector<HTMLElement>(`[name="${Object.keys(nextErrors)[0]}"]`)
        ?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await registerMerchant(
        merchantRegistrationSchema.parse(input),
      );
      setComplete(true);
      element.reset();
      setMessage(result.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="auth-panel">
      <span className="eyebrow">Merchant onboarding</span>
      <h1>Register your business</h1>
      {complete ? (
        <div className="notice" role="status">
          <p>{message}</p>
          <Link to="/auth/login">Continue to sign in</Link>
        </div>
      ) : (
        <>
          <p>
            Submit your details for review. API access becomes available after
            approval.
          </p>
          <form ref={form} onSubmit={(event) => void submit(event)} noValidate>
            <label htmlFor="merchant-business">Business name</label>
            <input
              id="merchant-business"
              name="businessName"
              autoComplete="organization"
              required
              aria-invalid={Boolean(errors.businessName)}
            />
            {errors.businessName?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-name">Contact name</label>
            <input
              id="merchant-name"
              name="fullName"
              autoComplete="name"
              required
              aria-invalid={Boolean(errors.fullName)}
            />
            {errors.fullName?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-email">Email</label>
            <input
              id="merchant-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-phone">Phone</label>
            <input
              id="merchant-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              aria-invalid={Boolean(errors.phone)}
            />
            {errors.phone?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-password">Password</label>
            <input
              id="merchant-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <label htmlFor="merchant-confirm">Confirm password</label>
            <input
              id="merchant-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errors.confirm)}
            />
            {errors.confirm?.map((error) => (
              <small key={error}>{error}</small>
            ))}
            <p role="alert">{message}</p>
            <button className="primary" disabled={pending}>
              {pending ? "Submitting…" : "Submit application"}
            </button>
          </form>
        </>
      )}
      <p>
        <Link to="/auth/login">Already registered? Sign in</Link>
      </p>
    </section>
  );
}

export function AdminMerchants() {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const actionLock = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void listMerchants()
      .then(({ items }) => {
        if (live) setRows(items);
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [refresh]);

  async function decide(row: Merchant, status: "APPROVED" | "REJECTED") {
    if (actionLock.current) return;
    if (
      status === "REJECTED" &&
      !window.confirm(`Reject the application from ${row.businessName}?`)
    )
      return;
    actionLock.current = true;
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await reviewMerchant(row.id, status);
      setNotice(`${row.businessName}: ${status.toLowerCase()}.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
      setRefresh((value) => value + 1);
    } finally {
      actionLock.current = false;
      setBusyId(null);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Merchant applications</h1>
          <p className="muted">
            Review business registrations before API access is enabled.
          </p>
        </div>
      </div>
      <p
        role={error ? "alert" : "status"}
        className={error ? "notice error" : "notice"}
      >
        {error || notice}
      </p>
      {error && (
        <button
          className="secondary"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Retry
        </button>
      )}
      {loading ? (
        <p role="status">Loading applications…</p>
      ) : rows.length === 0 ? (
        <p className="notice">No merchant applications yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Business</th>
                <th scope="col">Contact</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.businessName}</td>
                  <td>{row.fullName}</td>
                  <td>{row.email}</td>
                  <td>{row.phone}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === "PENDING" && (
                      <div className="row-actions">
                        <button
                          className="primary"
                          disabled={busyId !== null}
                          onClick={() => void decide(row, "APPROVED")}
                        >
                          {busyId === row.id ? "Working…" : "Approve"}
                        </button>
                        <button
                          className="secondary"
                          disabled={busyId !== null}
                          onClick={() => void decide(row, "REJECTED")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
