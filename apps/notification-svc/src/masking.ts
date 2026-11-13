export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@", 2);
  return `${local.slice(0, 1) || "*"}***@${domain || "***"}`;
}

export function maskPhone(phone: string) {
  return `***${phone.slice(-4)}`;
}
