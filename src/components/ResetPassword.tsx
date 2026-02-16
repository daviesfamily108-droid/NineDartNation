import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api.js";

function validatePassword(password: string) {
  return (
    password.length >= 10 &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("token") || "";
      setToken(t);
    } catch {}
  }, []);

  async function onSubmit(e: any) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError("Missing or invalid reset token.");
      return;
    }
    if (!password || password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!validatePassword(password)) {
      setError(
        "Password must be at least 10 chars and include a number and symbol.",
      );
      return;
    }
    try {
      const r = await apiFetch("/api/auth/confirm-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Reset failed");
      setSuccess("Password changed. You can now sign in.");
    } catch (e: any) {
      setError(e?.message || "Reset failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="background-animated" />
      <div className="relative z-10 w-full max-w-lg mx-auto p-4">
        <form className="card w-full space-y-4" onSubmit={onSubmit}>
          <div className="flex flex-col items-center justify-center gap-2 mb-2 text-center">
            <h1 className="logo text-center">Reset your password</h1>
          </div>
          {!token && (
            <div className="text-red-400">
              This reset link is missing a token. Please use the link from your
              email.
            </div>
          )}
          <input
            className="input w-full"
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            className="input w-full"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && (
            <div className="text-red-400 font-semibold text-sm">{error}</div>
          )}
          {success && (
            <div className="text-emerald-400 font-semibold text-sm">
              {success}
            </div>
          )}
          <button className="btn w-full" type="submit" disabled={!token}>
            Change Password
          </button>
          <a className="underline text-sm text-center" href="/">
            Back to sign in
          </a>
        </form>
      </div>
    </div>
  );
}
