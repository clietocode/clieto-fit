"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api-url";

const portals = [
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Gym Admin / Trainer" },
  { value: "USER", label: "Member" },
] as const;

export default function LoginForm() {
  const router = useRouter();
  const [portal, setPortal] = useState<(typeof portals)[number]["value"]>("USER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, portal }),
      });
      const result = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      router.replace(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-aside" aria-label="Clieto Fit">
        <Link className="brand brand-light" href="/">
          <span className="brand-mark">C</span>
          <span>clieto<span className="brand-accent">fit</span></span>
        </Link>
        <div className="aside-copy">
          <span className="eyebrow eyebrow-light">STRONGER, TOGETHER</span>
          <h1>Your gym.<br />Your momentum.</h1>
          <p>One calm, connected place to train, coach, and grow your community.</p>
        </div>
        <div className="aside-footer"><span className="pulse-dot" /> Built for the everyday work.</div>
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
      </section>

      <section className="login-main">
        <div className="login-mobile-brand">
          <Link className="brand" href="/">
            <span className="brand-mark">C</span>
            <span>clieto<span className="brand-accent">fit</span></span>
          </Link>
        </div>
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your portal</h2>
          <p className="muted">Choose your portal and enter your account details.</p>
          <form onSubmit={submit} className="form-stack">
            <label className="field">
              <span>Portal</span>
              <select value={portal} onChange={(event) => setPortal(event.target.value as typeof portal)}>
                {portals.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@yourgym.com"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="login-help">Need access? Ask your gym administrator to set up your account.</p>
          <div className="login-security"><span aria-hidden="true">◈</span> Secure sign-in · Your gym data stays private</div>
        </div>
      </section>
    </main>
  );
}
