/** Recipients are masked before they reach logs or the notification_logs table (NFR-4). */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  const prefix = phone.startsWith("+")
    ? `+${digits.slice(0, 2)}`
    : digits.slice(0, 2);
  return `${prefix}${"*".repeat(Math.max(3, digits.length - 6))}${digits.slice(-4)}`;
}

export const maskRecipient = (channel: "EMAIL" | "SMS", to: string) =>
  channel === "EMAIL" ? maskEmail(to) : maskPhone(to);
