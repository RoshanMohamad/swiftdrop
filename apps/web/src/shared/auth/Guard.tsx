import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "@swiftdrop/contracts";
import { roleHome, useSession } from "../../features/auth/session.js";

export interface GuardProps {
  role?: Role;
  roles?: Role[];
  children: ReactNode;
}

/**
 * Route protection guard that checks authentication, profile completeness,
 * and authorized role access before rendering children.
 */
export function Guard({ role, roles, children }: GuardProps) {
  const { state } = useSession();

  if (!state.user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!state.user.profileComplete) {
    return <Navigate to="/auth/complete-profile" replace />;
  }

  const allowed = roles
    ? roles.includes(state.user.role)
    : state.user.role === role;

  if (!allowed) {
    return <Navigate to={roleHome(state.user.role)} replace />;
  }

  return <>{children}</>;
}

export const RequireRole = Guard;

