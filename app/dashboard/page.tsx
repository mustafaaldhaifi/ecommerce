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
type OrderItemSnapshot = { product_id: number; name: string; image: string | null; unit_price: number; quantity: number; line_total: number };
type SavedOrder = { id: string; items: OrderItemSnapshot[]; total_amount: number; currency: string; payment_method: SimulationMethod; status: string; created_at: string };
const MAX_CART_QUANTITY = 99;
const simulationMethods: { id: SimulationMethod; name: string; description: string; logos: string[] }[] = [
  { id: "mada", name: "مدى", description: "بطاقة مدى البنكية", logos: ["/payment-methods/mada.svg"] },
  { id: "bank-card", name: "فيزا أو ماستركارد", description: "بطاقة ائتمانية أو بطاقة خصم", logos: ["/payment-methods/visa.svg", "/payment-methods/mastercard.svg"] },
  { id: "apple-pay", name: "Apple Pay", description: "محاكاة الدفع بمحفظة Apple", logos: ["/payment-methods/apple-pay.svg"] },
  { id: "stc-pay", name: "STC Pay", description: "محاكاة الدفع بالمحفظة الرقمية", logos: ["/payment-methods/stc-pay.svg"] },
];

/**
 * Stores one simulated order and resolves a retry of the same attempt.
 * 1. Insert the order snapshot with its stable attempt key.
 * 2. Read the existing order if an earlier request already saved that key.
 * 3. Return the saved order ID or report the database failure.
 */
async function persistSimulatedOrder(items: OrderItemSnapshot[], total: number, method: SimulationMethod, attemptKey: string, userId: string): Promise<string> {
  // STEP 1: Save the snapshot only after the simulation has succeeded.
  const { data, error } = await supabase.from("orders")
    .insert({ items, total_amount: total, payment_method: method, idempotency_key: attemptKey })
    .select("id")
    .single();
  if (data?.id) return data.id;

  // STEP 2: A timed-out response may have saved the order; reuse it on retry.
  if (error?.code === "23505") {
    const existing = await supabase.from("orders")
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", attemptKey)
      .single();
    if (existing.data?.id) return existing.data.id;
    throw existing.error ?? error;
  }

  // STEP 3: Keep the cart when no saved order could be confirmed.
  throw error ?? new Error("Order was not returned after insert.");
}

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
 * Displays the signed-in account, catalog, cart, simulated checkout, and order history.
 * 1. Verify the account and restore its saved cart.
 * 2. Keep cart changes in browser storage and control the side dialog.
 * 3. Prepare account and cart totals for display.
 * 4. Render the header, product list, cart, simulated checkout, and order dialog.
 */
export default function Dashboard() {
  const router = useRouter();
  const cartDialogRef = useRef<HTMLDialogElement>(null);
  const ordersDialogRef = useRef<HTMLDialogElement>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentBusyRef = useRef(false);
  const verifiedUserIdRef = useRef<string | null>(null);
  const ordersRequestIdRef = useRef(0);
  const pendingOrderRef = useRef<{ signature: string; key: string; method: SimulationMethod } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOwnerId, setCartOwnerId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartScreen, setCartScreen] = useState<CartScreen>("cart");
  const [simulationMethod, setSimulationMethod] = useState<SimulationMethod>("mada");
  const [simulationOutcome, setSimulationOutcome] = useState<SimulationOutcome>("success");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedAmount, setSimulatedAmount] = useState(0);
  const [savedOrderId, setSavedOrderId] = useState("");
  const [orderSaveError, setOrderSaveError] = useState("");
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
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
        verifiedUserIdRef.current = data.user.id;
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
        paymentBusyRef.current = false;
        pendingOrderRef.current = null;
        verifiedUserIdRef.current = null;
        ordersRequestIdRef.current += 1;
        setCart([]);
        setCartOwnerId(null);
        setIsCartOpen(false);
        setIsOrdersOpen(false);
        setOrders([]);
        setUser(null);
        router.replace("/");
      }
    });

    return () => {
      active = false;
      verifiedUserIdRef.current = null;
      ordersRequestIdRef.current += 1;
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

  useEffect(() => {
    const dialog = ordersDialogRef.current;
    if (!dialog) return;
    if (isOrdersOpen && !dialog.open) dialog.showModal();
    if (!isOrdersOpen && dialog.open) dialog.close();
  }, [isOrdersOpen]);

  useEffect(() => () => {
    if (simulationTimerRef.current) clearTimeout(simulationTimerRef.current);
  }, []);

  function closeCart() {
    if (isSimulating) return;
    setIsCartOpen(false);
  }

  function closeOrders() {
    ordersRequestIdRef.current += 1;
    setIsOrdersOpen(false);
  }

  /**
   * Opens the customer's order history and refreshes it from Supabase.
   * 1. Reject requests without a verified account or during checkout.
   * 2. Open the dialog and request this account's newest orders.
   * 3. Show the rows or a recoverable loading error if the request is current.
   */
  async function openOrders() {
    // STEP 1: Keep order history bound to the verified customer.
    if (!user || verifiedUserIdRef.current !== user.id || isSimulating) return;
    const userId = user.id;
    const requestId = ++ordersRequestIdRef.current;

    // STEP 2: Open one dialog and load fresh history for this account.
    setIsCartOpen(false);
    setIsOrdersOpen(true);
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const { data, error } = await supabase.from("orders")
        .select("id,items,total_amount,currency,payment_method,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (requestId !== ordersRequestIdRef.current || verifiedUserIdRef.current !== userId) return;
      setOrders((data ?? []) as SavedOrder[]);
    } catch {
      // STEP 3: Let the customer retry without closing the dialog.
      if (requestId === ordersRequestIdRef.current && verifiedUserIdRef.current === userId) {
        setOrdersError("تعذّر تحميل طلباتك. حاول مرة أخرى.");
      }
    } finally {
      if (requestId === ordersRequestIdRef.current && verifiedUserIdRef.current === userId) {
        setOrdersLoading(false);
      }
    }
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
   * Completes the selected simulation and saves successful orders.
   * 1. Show a rejected simulation without creating an order.
   * 2. Save or recover the successful order using its attempt key.
   * 3. Clear the cart only after the database confirms the saved order.
   */
  async function finishSimulatedPayment(outcome: SimulationOutcome, items: OrderItemSnapshot[], amount: number, method: SimulationMethod, attemptKey: string, userId: string) {
    try {
      // STEP 1: A rejected test payment never becomes an order.
      if (outcome === "failed") {
        if (verifiedUserIdRef.current === userId) setCartScreen("failed");
        return;
      }

      // STEP 2: Confirm that the database saved this attempt exactly once.
      const orderId = await persistSimulatedOrder(items, amount, method, attemptKey, userId);
      if (verifiedUserIdRef.current !== userId) return;

      // STEP 3: Show success and remove the saved products from the cart.
      pendingOrderRef.current = null;
      setSavedOrderId(orderId);
      setSimulatedAmount(amount);
      setCart([]);
      setCartScreen("success");
    } catch {
      // STEP 3: Keep the cart and attempt key for a safe retry.
      if (verifiedUserIdRef.current === userId) {
        setOrderSaveError("نجحت المحاكاة، لكن تعذّر تأكيد حفظ الطلب. سلتك محفوظة؛ حاول مرة أخرى.");
      }
    } finally {
      paymentBusyRef.current = false;
      if (verifiedUserIdRef.current === userId) setIsSimulating(false);
    }
  }

  /**
   * Starts a simulated payment for the current verified cart.
   * 1. Reject duplicate clicks and invalid checkout state.
   * 2. Snapshot the cart and retain one key for retries of that cart.
   * 3. Wait briefly before completing the simulated result.
   */
  function handleSimulatedPayment() {
    // STEP 1: Only process a ready cart once on the checkout screen.
    if (cartScreen !== "checkout" || paymentBusyRef.current || !user || verifiedUserIdRef.current !== user.id || cartOwnerId !== user.id || cartLines.length === 0) return;
    paymentBusyRef.current = true;
    setIsSimulating(true);
    setOrderSaveError("");

    // STEP 2: Keep the same key when retrying a cart whose save result was uncertain.
    const userId = user.id;
    const items = cartLines.map(({ product, quantity }) => ({
      product_id: product.id,
      name: product.name,
      image: product.image,
      unit_price: product.price,
      quantity,
      line_total: product.price * quantity,
    }));
    const signature = JSON.stringify({ userId, items });
    const pending = pendingOrderRef.current?.signature === signature
      ? pendingOrderRef.current
      : { signature, key: window.crypto.randomUUID(), method: simulationMethod };
    if (simulationOutcome === "success") pendingOrderRef.current = pending;
    const method = pending.method;
    setSimulationMethod(method);

    // STEP 3: Keep the existing visible processing pause before the result.
    simulationTimerRef.current = setTimeout(() => {
      simulationTimerRef.current = null;
      void finishSimulatedPayment(simulationOutcome, items, cartTotal, method, pending.key, userId);
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
            <h1 className="brand" aria-label="رِواء">
              <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
              <span className="brand-name">رِواء<span className="brand-dot">.</span></span>
            </h1>
          </div>

          {user ? (
            <div className="dashboard-account">
              <div className="dashboard-profile">
                <span className="dashboard-avatar" aria-hidden="true">{initial}</span>
                <div className="dashboard-person">
                  <strong>{displayName}</strong>
                  <span dir="ltr">{user.email ?? ""}</span>
                </div>
              </div>
              <div className="dashboard-header-actions">
                <button className="dashboard-orders-trigger" type="button" onClick={() => { void openOrders(); }} aria-label="طلباتي" title="طلباتي">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-4 2-4-2-3 2V6a2 2 0 0 1 2-2Zm2 5h6M9 13h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>طلباتي</span>
                </button>
                <button className="dashboard-cart-trigger" type="button" onClick={() => { setCartScreen("cart"); setIsCartOpen(true); }} aria-label={`افتح السلة، عدد القطع ${cartCount}`} title="السلة">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16l-1.4 11H5.4L4 8ZM9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>السلة</span>
                  <span className="dashboard-cart-badge" aria-hidden="true">{cartCount}</span>
                </button>
                <button className="dashboard-signout" type="button" onClick={handleSignOut} disabled={isSigningOut} aria-label={isSigningOut ? "جارٍ تسجيل الخروج" : "تسجيل الخروج"} title="تسجيل الخروج">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M14 8l4 4-4 4m4-4H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
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
        onClose={() => { setIsCartOpen(false); setCartScreen("cart"); setOrderSaveError(""); if (!pendingOrderRef.current) setSimulationMethod("mada"); setSimulationOutcome("success"); }}
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
                {orderSaveError && <p className="dashboard-order-save-error" role="alert">{orderSaveError}</p>}
                <button className="dashboard-simulation-pay" type="button" onClick={handleSimulatedPayment} disabled={isSimulating}>
                  {isSimulating ? <><span className="dashboard-simulation-spinner" aria-hidden="true" />جارٍ تأكيد الطلب...</> : orderSaveError ? "إعادة محاولة حفظ الطلب" : `تأكيد الدفع التجريبي · ${cartTotal.toLocaleString("en-US")} ر.س`}
                </button>
                <button className="dashboard-simulation-back" type="button" onClick={() => { setOrderSaveError(""); setCartScreen("cart"); }} disabled={isSimulating}>العودة إلى السلة</button>
              </div>
            </div>
          ) : cartScreen === "success" ? (
            <div className="dashboard-simulation-result" role="status">
              <span className="dashboard-simulation-result-icon success" aria-hidden="true">✓</span>
              <h3>تم حفظ طلبك التجريبي</h3>
              <p>تمت تجربة دفع عبر {selectedSimulationMethod.name} بقيمة {simulatedAmount.toLocaleString("en-US")} ر.س. لم تُرسل أي عملية إلى Tap ولم يُخصم أي مبلغ.</p>
              <span className="dashboard-saved-order-id">رقم الطلب <b dir="ltr">{savedOrderId.slice(0, 8).toUpperCase()}</b></span>
              <button type="button" onClick={() => { void openOrders(); }}>عرض طلباتي</button>
              <button className="dashboard-simulation-result-secondary" type="button" onClick={closeCart}>العودة إلى المنتجات</button>
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
      <dialog
        ref={ordersDialogRef}
        className="dashboard-orders-dialog"
        aria-labelledby="orders-title"
        onClose={closeOrders}
        onClick={(event) => { if (event.target === event.currentTarget) closeOrders(); }}
      >
        <div className="dashboard-orders-panel">
          <div className="dashboard-cart-heading">
            <div>
              <p>سجل مشترياتك من رِواء</p>
              <h2 id="orders-title">طلباتي السابقة</h2>
            </div>
            <button className="dashboard-cart-close" type="button" onClick={closeOrders} aria-label="إغلاق الطلبات">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="dashboard-orders-body" aria-live="polite">
            {ordersLoading ? (
              <div className="dashboard-orders-state"><span className="dashboard-orders-spinner" aria-hidden="true" /><p>جارٍ تحميل طلباتك...</p></div>
            ) : ordersError ? (
              <div className="dashboard-orders-state"><p role="alert">{ordersError}</p><button type="button" onClick={() => { void openOrders(); }}>إعادة المحاولة</button></div>
            ) : orders.length === 0 ? (
              <div className="dashboard-orders-state"><span className="dashboard-orders-empty-icon" aria-hidden="true">✦</span><h3>لا توجد طلبات بعد</h3><p>ستظهر طلباتك هنا بعد نجاح تجربة الدفع وحفظها.</p></div>
            ) : (
              <div className="dashboard-orders-list">
                <p className="dashboard-orders-note">كل الطلبات المعروضة تجريبية، ولم يُخصم عنها أي مبلغ.</p>
                {orders.map((order) => (
                  <details className="dashboard-order-card" key={order.id}>
                    <summary>
                      <span className="dashboard-order-summary-top"><strong>طلب #{order.id.slice(0, 8).toUpperCase()}</strong><span>تجريبي</span></span>
                      <span className="dashboard-order-summary-bottom">
                        <time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" })}</time>
                        <b>{Number(order.total_amount).toLocaleString("en-US")} ر.س</b>
                      </span>
                      <span className="dashboard-order-summary-hint">{simulationMethods.find((method) => method.id === order.payment_method)?.name ?? order.payment_method} · عرض المنتجات</span>
                    </summary>
                    <div className="dashboard-order-details">
                      {(Array.isArray(order.items) ? order.items.filter((item) => item && typeof item.name === "string") : []).map((item, index) => (
                        <div className="dashboard-order-item" key={`${item.product_id}-${index}`}>
                          <span className="dashboard-order-item-image">
                            {typeof item.image === "string" && item.image.startsWith("/products/")
                              ? <Image src={item.image} alt="" width={54} height={54} />
                              : <span aria-hidden="true">رِواء</span>}
                          </span>
                          <span className="dashboard-order-item-copy"><strong>{item.name}</strong><small>{item.quantity} × {Number(item.unit_price).toLocaleString("en-US")} ر.س</small></span>
                          <b>{Number(item.line_total).toLocaleString("en-US")} ر.س</b>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>
    </main>
  );
}
