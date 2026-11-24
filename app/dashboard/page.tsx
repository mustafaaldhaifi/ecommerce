"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/client";
import { products } from "./products";
import "./dashboard.css";

/**
 * Displays the signed-in account and the local product catalog.
 * 1. Verify the account and handle session changes.
 * 2. Prepare the account name for the header.
 * 3. Render the header and the product list.
 */
export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [signOutError, setSignOutError] = useState("");

  // STEP 1: Keep account details tied to the current Supabase session.
  useEffect(() => {
    let active = true;

    /**
     * Loads the verified account before showing personal details.
     * 1. Request the current user from Supabase Auth.
     * 2. Return to sign-in when there is no valid user.
     * 3. Show the account or a retry message if the request fails.
     */
    async function loadAccount() {
      try {
        // STEP 1: Verify the stored session with Supabase Auth.
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;

        // STEP 2: Keep signed-out visitors on the sign-in page.
        if (error || !data.user) {
          router.replace("/");
          return;
        }

        // STEP 3: Show the verified account in the header.
        setUser(data.user);
      } catch {
        // STEP 3: Give the user a clear recovery path for network failures.
        if (active) setLoadError("تعذّر تحميل حسابك. حدّث الصفحة للمحاولة مرة أخرى.");
      }
    }

    void loadAccount();

    // NOTE: A session can end in another tab while this page remains open.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        router.replace("/");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  /**
   * Signs out from the current browser session.
   * 1. Lock the button and clear a previous error.
   * 2. End the local Supabase session.
   * 3. Return to sign-in or restore the button if an exception occurs.
   */
  async function handleSignOut() {
    // STEP 1: Prevent repeated sign-out requests.
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");

    try {
      // STEP 2: End this browser session without affecting other devices.
      await supabase.auth.signOut({ scope: "local" });

      // STEP 3: Return to the existing sign-in page.
      router.replace("/");
    } catch {
      // STEP 3: Restore the button if sign-out could not be started.
      setSignOutError("تعذّر تسجيل الخروج. حاول مرة أخرى.");
      setIsSigningOut(false);
    }
  }

  // STEP 2: Build a readable name from the saved profile details.
  const firstName = typeof user?.user_metadata?.first_name === "string"
    ? user.user_metadata.first_name.trim()
    : "";
  const lastName = typeof user?.user_metadata?.last_name === "string"
    ? user.user_metadata.last_name.trim()
    : "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "مستخدم رِواء";
  const initial = firstName.charAt(0) || user?.email?.charAt(0).toUpperCase() || "ر";

  // STEP 3: Show the catalog below the existing account header.
  return (
    <main className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <div className="brand" aria-label="رِواء">
              <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
              <span className="brand-name">رِواء<span className="brand-dot">.</span></span>
            </div>
            <span className="dashboard-header-divider" aria-hidden="true" />
            <h1>لوحة التحكم</h1>
          </div>

          {user ? (
            <div className="dashboard-account">
              <span className="dashboard-avatar" aria-hidden="true">{initial}</span>
              <div className="dashboard-person">
                <strong>{displayName}</strong>
                <span dir="ltr">{user.email ?? ""}</span>
              </div>
              <button className="dashboard-signout" type="button" onClick={handleSignOut} disabled={isSigningOut}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M14 8l4 4-4 4m4-4H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>{isSigningOut ? "جارٍ الخروج..." : "تسجيل الخروج"}</span>
              </button>
            </div>
          ) : (
            <span className="dashboard-checking" role="status">{loadError || "جارٍ تحميل حسابك..."}</span>
          )}
        </div>
        {signOutError && <p className="dashboard-error" role="alert">{signOutError}</p>}
      </header>
      <section className="dashboard-catalog" aria-labelledby="catalog-title">
        <div className="dashboard-catalog-heading">
          <div>
            <p className="dashboard-catalog-kicker">مجموعة رِواء للمنزل</p>
            <h2 id="catalog-title">تفاصيل تجعل البيت أقرب إليك</h2>
            <p className="dashboard-catalog-description">قطع مختارة للأثاث والإضاءة والديكور، بتصاميم هادئة تناسب كل زاوية.</p>
          </div>
          <span className="dashboard-product-count">{products.length} منتجًا</span>
        </div>

        <div className="dashboard-product-grid">
          {products.map((product) => (
            <article className="dashboard-product-card" key={product.id}>
              <div className="dashboard-product-image">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.alt}
                    fill
                    sizes="(max-width: 560px) 100vw, (max-width: 850px) 50vw, (max-width: 1150px) 33vw, 25vw"
                  />
                ) : (
                  <div className="dashboard-image-pending" aria-label="صورة المنتج ستضاف لاحقًا">
                    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="8" y="12" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="2" /><circle cx="22" cy="25" r="4" stroke="currentColor" strokeWidth="2" /><path d="m12 46 13-13 10 9 7-6 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span>الصورة قريبًا</span>
                  </div>
                )}
              </div>
              <div className="dashboard-product-details">
                <span className="dashboard-product-category">{product.category}</span>
                <h3>{product.name}</h3>
                <p className="dashboard-product-price">{product.price} <span>ر.س</span></p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
