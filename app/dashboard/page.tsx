"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/client";
import { products } from "./products";
import "./dashboard.css";

type CartItem = { productId: number; quantity: number };
type CartScreen = "cart" | "checkout" | "success" | "failed";
type SimulationOutcome = "success" | "failed";
type SimulationMethod = "mada" | "bank-card" | "apple-pay" | "stc-pay";
const MAX_CART_QUANTITY = 99;
const simulationMethods: { id: SimulationMethod; name: string; description: string; logos: string[] }[] = [
  { id: "mada", name: "مدى", description: "بطاقة مدى البنكية", logos: ["/payment-methods/mada.svg"] },
  { id: "bank-card", name: "فيزا أو ماستركارد", description: "بطاقة ائتمانية أو بطاقة خصم", logos: ["/payment-methods/visa.svg", "/payment-methods/mastercard.svg"] },
  { id: "apple-pay", name: "Apple Pay", description: "محاكاة الدفع بمحفظة Apple", logos: ["/payment-methods/apple-pay.svg"] },
  { id: "stc-pay", name: "STC Pay", description: "محاكاة الدفع بالمحفظة الرقمية", logos: ["/payment-methods/stc-pay.svg"] },
];

/**
 * Restores valid cart items saved for one account in this browser.
 * 1. Read and parse the account's saved cart.
 * 2. Ignore unknown products and invalid quantities.
 * 3. Merge duplicate entries and return the usable items.
 */
function readStoredCart(userId: string): CartItem[] {
  try {
    // STEP 1: Read only this account's browser storage entry.
    const stored = window.localStorage.getItem(`riwaa-cart:${userId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    // STEP 2: Discard entries that do not match the current product list.
    const quantities = new Map<number, number>();
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { productId, quantity } = entry as Partial<CartItem>;
      if (typeof productId !== "number" || typeof quantity !== "number") continue;
      if (!Number.isInteger(productId) || !Number.isInteger(quantity)) continue;
      if (!products.some((product) => product.id === productId) || quantity < 1) continue;

      // STEP 3: Keep a single bounded quantity for each product.
      quantities.set(productId, Math.min(MAX_CART_QUANTITY, (quantities.get(productId) ?? 0) + quantity));
    }
    return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
  } catch {
    // NOTE: An unavailable or corrupted storage entry should not block shopping.
    return [];
  }
}

/**
 * Displays the signed-in account, product catalog, editable cart, and payment simulation.
 * 1. Verify the account and restore its saved cart.
 * 2. Keep cart changes in browser storage and control the side dialog.
 * 3. Prepare account and cart totals for display.
 * 4. Render the header, product list, cart, and simulated checkout.
 */
export default function Dashboard() {
  const router = useRouter();
  const cartDialogRef = useRef<HTMLDialogElement>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOwnerId, setCartOwnerId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartScreen, setCartScreen] = useState<CartScreen>("cart");
  const [simulationMethod, setSimulationMethod] = useState<SimulationMethod>("mada");
  const [simulationOutcome, setSimulationOutcome] = useState<SimulationOutcome>("success");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedAmount, setSimulatedAmount] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [signOutError, setSignOutError] = useState("");

  // STEP 1: Keep account and cart details tied to the verified session.
  useEffect(() => {
    let active = true;

    /**
     * Loads the verified account and its saved cart before showing personal details.
     * 1. Request the current user from Supabase Auth.
     * 2. Return to sign-in when there is no valid user.
     * 3. Restore this account's cart and show the account, or report a network failure.
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

        // STEP 3: Restore only this account's cart before enabling cart actions.
        setCart(readStoredCart(data.user.id));
        setCartOwnerId(data.user.id);
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
        if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
        simulationTimerRef.current = null;
        setCart([]);
        setCartOwnerId(null);
        setIsCartOpen(false);
        setUser(null);
        router.replace("/");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // STEP 2: Save changes after the verified account's cart has been restored.
  useEffect(() => {
    if (!user || cartOwnerId !== user.id) return;
    try {
      window.localStorage.setItem(`riwaa-cart:${user.id}`, JSON.stringify(cart));
    } catch {
      // NOTE: The current page remains usable when browser storage is disabled.
    }
  }, [cart, cartOwnerId, user]);

  useEffect(() => {
    const dialog = cartDialogRef.current;
    if (!dialog) return;
    if (isCartOpen && !dialog.open) dialog.showModal();
    if (!isCartOpen && dialog.open) dialog.close();
  }, [isCartOpen]);

  useEffect(() => () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
  }, []);

  function closeCart() {
    if (isSimulating) return;
    setIsCartOpen(false);
  }

  /**
   * Adds one unit and opens the cart for immediate review.
   * 1. Ignore clicks before the verified account's cart is ready.
   * 2. Increase an existing quantity or add a new cart line.
   * 3. Show the side dialog with the updated cart.
   */
  function handleAddToCart(productId: number) {
    // STEP 1: Avoid mixing a pending or different account's cart.
    if (!user || cartOwnerId !== user.id) return;

    // STEP 2: Add one unit while keeping quantities within the UI limit.
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) return current.map((item) => item.productId === productId
        ? { ...item, quantity: Math.min(MAX_CART_QUANTITY, item.quantity + 1) }
        : item);
      return [...current, { productId, quantity: 1 }];
    });

    // STEP 3: Let the customer edit the quantity right away.
    setCartScreen("cart");
    setIsCartOpen(true);
  }

  function changeQuantity(productId: number, difference: number) {
    setCart((current) => current.map((item) => item.productId === productId
      ? { ...item, quantity: Math.max(1, Math.min(MAX_CART_QUANTITY, item.quantity + difference)) }
      : item));
  }

  function removeFromCart(productId: number) {
    setCart((current) => current.filter((item) => item.productId !== productId));
  }

  /**
   * Simulates a payment result without contacting a payment provider.
   * 1. Reject duplicate submissions or an empty, unverified cart.
   * 2. Show a short processing state using the selected test outcome.
   * 3. Clear the cart on simulated success or retain it on simulated failure.
   */
  function handleSimulatedPayment() {
    // STEP 1: Only process a ready cart on the checkout screen.
    if (cartScreen !== "checkout" || isSimulating || !user || cartOwnerId !== user.id || cart.length === 0) return;

    // STEP 2: Make the simulated result visible after a short wait.
    setIsSimulating(true);
    const selectedOutcome = simulationOutcome;
    const amount = cartTotal;
    simulationTimerRef.current = setTimeout(() => {
      simulationTimerRef.current = null;
      setIsSimulating(false);

      // STEP 3: Only the simulated success removes items from this browser's cart.
      if (selectedOutcome === "success") {
        setSimulatedAmount(amount);
        setCart([]);
        setCartScreen("success");
      } else {
        setCartScreen("failed");
      }
    }, 1300);
  }

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

  // STEP 3: Build the account label and current cart summary.
  const firstName = typeof user?.user_metadata?.first_name === "string"
    ? user.user_metadata.first_name.trim()
    : "";
  const lastName = typeof user?.user_metadata?.last_name === "string"
    ? user.user_metadata.last_name.trim()
    : "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || "مستخدم رِواء";
  const initial = firstName.charAt(0) || user?.email?.charAt(0).toUpperCase() || "ر";
  const cartLines = cart.flatMap((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return product ? [{ product, quantity: item.quantity }] : [];
  });
  const cartCount = cartLines.reduce((count, item) => count + item.quantity, 0);
  const cartTotal = cartLines.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const selectedSimulationMethod = simulationMethods.find((method) => method.id === simulationMethod) ?? simulationMethods[0];

  // STEP 4: Show the catalog and an editable cart beside the existing header.
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
              <button className="dashboard-cart-trigger" type="button" onClick={() => { setCartScreen("cart"); setIsCartOpen(true); }} aria-label={`افتح السلة، عدد القطع ${cartCount}`}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16l-1.4 11H5.4L4 8ZM9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>السلة</span>
                <span className="dashboard-cart-badge" aria-hidden="true">{cartCount}</span>
              </button>
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
                <button className="dashboard-add-button" type="button" onClick={() => handleAddToCart(product.id)} disabled={!user || cartOwnerId !== user.id}>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16l-1.4 11H5.4L4 8ZM9 9V6a3 3 0 0 1 6 0v3M12 12v5m-2.5-2.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  أضف للسلة
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <dialog
        ref={cartDialogRef}
        className="dashboard-cart-dialog"
        aria-labelledby="cart-title"
        onClose={() => { setIsCartOpen(false); setCartScreen("cart"); setSimulationMethod("mada"); setSimulationOutcome("success"); }}
        onCancel={(event) => { if (isSimulating) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeCart(); }}
      >
        <div className="dashboard-cart-panel">
          <div className="dashboard-cart-heading">
            <div>
              <p>{cartScreen === "cart" ? "مشترياتك من رِواء" : "تجربة دفع دون خصم فعلي"}</p>
              <h2 id="cart-title">{cartScreen === "cart" ? <>سلة التسوق <span>({cartCount})</span></> : "الدفع التجريبي"}</h2>
            </div>
            <button className="dashboard-cart-close" type="button" onClick={closeCart} disabled={isSimulating} aria-label="إغلاق السلة">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>

          {cartScreen === "checkout" ? (
            <div className="dashboard-simulation">
              <div className="dashboard-simulation-notice">
                <span aria-hidden="true">✦</span>
                <div><strong>وضع تجريبي</strong><p>لن تُطلب بيانات بطاقة ولن يُخصم أي مبلغ. هذه تجربة لشكل عملية الدفع فقط.</p></div>
              </div>
              <div className="dashboard-simulation-summary">
                <h3>ملخص السلة</h3>
                <div><span>عدد القطع</span><strong>{cartCount}</strong></div>
                <div><span>المبلغ الإجمالي</span><strong>{cartTotal.toLocaleString("en-US")} ر.س</strong></div>
              </div>
              <fieldset className="dashboard-payment-methods" disabled={isSimulating}>
                <legend>اختر طريقة الدفع التجريبية</legend>
                <div className="dashboard-payment-method-list">
                  {simulationMethods.map((method) => (
                    <label className={simulationMethod === method.id ? "dashboard-payment-method selected" : "dashboard-payment-method"} key={method.id}>
                      <input type="radio" name="simulation-method" value={method.id} checked={simulationMethod === method.id} onChange={() => setSimulationMethod(method.id)} />
                      <span className={`dashboard-payment-logos dashboard-payment-logos-${method.id}`} aria-hidden="true">
                        {method.logos.map((logo) => <Image key={logo} src={logo} alt="" width={70} height={30} />)}
                      </span>
                      <span className="dashboard-payment-copy"><strong>{method.name}</strong><small>{method.description}</small></span>
                    </label>
                  ))}
                </div>
                <p>هذه خيارات محاكاة؛ الطرق الفعلية تعتمد على تفعيلها في حساب Tap وجهاز العميل.</p>
              </fieldset>
              <fieldset className="dashboard-simulation-outcomes" disabled={isSimulating}>
                <legend>اختر نتيجة المحاكاة</legend>
                <label className={simulationOutcome === "success" ? "dashboard-simulation-option selected" : "dashboard-simulation-option"}>
                  <input type="radio" name="simulation-outcome" value="success" checked={simulationOutcome === "success"} onChange={() => setSimulationOutcome("success")} />
                  <span><strong>دفع ناجح</strong><small>تظهر رسالة نجاح وتُفرغ السلة.</small></span>
                </label>
                <label className={simulationOutcome === "failed" ? "dashboard-simulation-option selected" : "dashboard-simulation-option"}>
                  <input type="radio" name="simulation-outcome" value="failed" checked={simulationOutcome === "failed"} onChange={() => setSimulationOutcome("failed")} />
                  <span><strong>دفع مرفوض</strong><small>تظهر رسالة رفض وتبقى المنتجات في السلة.</small></span>
                </label>
              </fieldset>
              <div className="dashboard-simulation-actions">
                <button className="dashboard-simulation-pay" type="button" onClick={handleSimulatedPayment} disabled={isSimulating}>
                  {isSimulating ? <><span className="dashboard-simulation-spinner" aria-hidden="true" />جارٍ تنفيذ المحاكاة...</> : `تأكيد الدفع التجريبي · ${cartTotal.toLocaleString("en-US")} ر.س`}
                </button>
                <button className="dashboard-simulation-back" type="button" onClick={() => setCartScreen("cart")} disabled={isSimulating}>العودة إلى السلة</button>
              </div>
            </div>
          ) : cartScreen === "success" ? (
            <div className="dashboard-simulation-result" role="status">
              <span className="dashboard-simulation-result-icon success" aria-hidden="true">✓</span>
              <h3>نجحت المحاكاة</h3>
              <p>تمت تجربة دفع عبر {selectedSimulationMethod.name} بقيمة {simulatedAmount.toLocaleString("en-US")} ر.س. لم تُرسل أي عملية إلى Tap ولم يُخصم أي مبلغ.</p>
              <button type="button" onClick={closeCart}>العودة إلى المنتجات</button>
            </div>
          ) : cartScreen === "failed" ? (
            <div className="dashboard-simulation-result" role="status">
              <span className="dashboard-simulation-result-icon failed" aria-hidden="true">×</span>
              <h3>لم تنجح المحاكاة</h3>
              <p>تمت محاكاة رفض الدفع عبر {selectedSimulationMethod.name}. منتجاتك وكمياتها ما زالت محفوظة في السلة.</p>
              <button type="button" onClick={() => { setSimulationOutcome("success"); setCartScreen("checkout"); }}>إعادة المحاولة</button>
              <button className="dashboard-simulation-result-secondary" type="button" onClick={() => setCartScreen("cart")}>العودة إلى السلة</button>
            </div>
          ) : cartLines.length === 0 ? (
            <div className="dashboard-cart-empty">
              <span className="dashboard-cart-empty-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M12 23h40l-4 30H16l-4-30ZM24 25v-6a8 8 0 0 1 16 0v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <h3>سلتك فارغة الآن</h3>
              <p>اختر ما يعجبك من المنتجات وأضفه إلى السلة.</p>
              <button type="button" onClick={() => setIsCartOpen(false)}>تصفح المنتجات</button>
            </div>
          ) : (
            <>
              <div className="dashboard-cart-items">
                {cartLines.map(({ product, quantity }) => (
                  <article className="dashboard-cart-item" key={product.id}>
                    <div className="dashboard-cart-item-image">
                      {product.image ? <Image src={product.image} alt={product.alt} fill sizes="84px" /> : <span aria-hidden="true">رِواء</span>}
                    </div>
                    <div className="dashboard-cart-item-details">
                      <span className="dashboard-cart-item-category">{product.category}</span>
                      <h3>{product.name}</h3>
                      <p>{product.price} ر.س للقطعة</p>
                      <div className="dashboard-cart-item-controls">
                        <div className="dashboard-quantity-control" aria-label={`كمية ${product.name}`}>
                          <button type="button" onClick={() => changeQuantity(product.id, -1)} disabled={quantity <= 1} aria-label={`إنقاص كمية ${product.name}`}>−</button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => changeQuantity(product.id, 1)} disabled={quantity >= MAX_CART_QUANTITY} aria-label={`زيادة كمية ${product.name}`}>+</button>
                        </div>
                        <button className="dashboard-remove-item" type="button" onClick={() => removeFromCart(product.id)} aria-label={`حذف ${product.name} من السلة`}>حذف</button>
                      </div>
                    </div>
                    <strong className="dashboard-cart-line-total">{(product.price * quantity).toLocaleString("en-US")} ر.س</strong>
                  </article>
                ))}
              </div>
              <div className="dashboard-cart-footer">
                <div><span>المجموع</span><strong>{cartTotal.toLocaleString("en-US")} ر.س</strong></div>
                <button type="button" onClick={() => setCartScreen("checkout")}>متابعة إلى الدفع التجريبي</button>
                <button className="dashboard-cart-continue" type="button" onClick={closeCart}>متابعة التسوق</button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </main>
  );
}
