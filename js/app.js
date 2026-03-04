(() => {
  /** @type {Array<{id:string,name:string,price:number,image:string,category?:string,description?:string}>} */
  let allProducts = [];

  /** @type {Record<string, {product: any, qty: number}>} */
  const cart = {};

  /** @type {Array<any>} */
  let orders = [];

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dtf = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

  const $grid = $("#productGrid");
  const $status = $("#statusText");
  const $cartItems = $("#cartItems");
  const $cartCount = $("#cartCount");
  const $cartTotal = $("#cartTotal");
  const $search = $("#searchInput");
  const $clearCart = $("#clearCart");
  const $checkoutBtn = $("#checkoutBtn");
  const $checkoutModal = $("#checkoutModal");
  const $checkoutSummary = $("#checkoutSummary");
  const $checkoutTotal = $("#checkoutTotal");
  const $checkoutForm = $("#checkoutForm");
  const $checkoutError = $("#checkoutError");
  const $ordersList = $("#ordersList");
  const $clearOrders = $("#clearOrders");

  const $toast = $("#toast");
  const $toastTitle = $("#toastTitle");
  const $toastMsg = $("#toastMsg");
  const $toastClose = $("#toastClose");
  /** @type {number | null} */
  let toastTimer = null;

  // Updates the status text above the product grid (e.g. loading, counts, confirmations).
  function setStatus(text) {
    $status.text(text || "");
  }

  // Calculates total item count and cart total price from the in‑memory cart object.
  function cartSummary() {
    const ids = Object.keys(cart);
    let count = 0;
    let total = 0;

    for (const id of ids) {
      const item = cart[id];
      count += item.qty;
      total += item.qty * Number(item.product.price || 0);
    }

    return { itemIds: ids, count, total };
  }

  // Renders the product cards into the grid using the product template.
  function renderProducts(products) {
    $grid.empty();

    if (!products.length) {
      $grid.append(
        $("<div/>", {
          class: "hint",
          text: "No products match your search.",
        })
      );
      return;
    }

    const tpl = document.getElementById("productCardTpl");

    for (const p of products) {
      const node = tpl.content.cloneNode(true);
      const $node = $(node);

      $node.find(".card__img").attr("src", p.image).attr("alt", p.name);
      $node.find(".card__title").text(p.name);
      $node.find(".card__price").text(money.format(Number(p.price || 0)));

      const meta = [p.category].filter(Boolean).join(" · ");
      $node.find(".card__meta").text(meta);

      $node.find(".card__desc").text(p.description || "");

      $node
        .find(".addToCartBtn")
        .attr("data-product-id", p.id)
        .prop("disabled", false);

      $grid.append($node);
    }
  }

  // Renders the cart sidebar items, count, and total price from the cart state.
  function renderCart() {
    const { itemIds, count, total } = cartSummary();

    $cartCount.text(String(count));
    $cartTotal.text(money.format(total));
    $checkoutBtn.prop("disabled", count === 0);

    $cartItems.empty();

    if (!itemIds.length) {
      $cartItems.append(
        $("<div/>", { class: "hint", text: "Your cart is empty. Add a product to get started." })
      );
      return;
    }

    const tpl = document.getElementById("cartItemTpl");

    for (const id of itemIds) {
      const { product, qty } = cart[id];
      const lineTotal = qty * Number(product.price || 0);

      const node = tpl.content.cloneNode(true);
      const $node = $(node);

      $node.find(".cartItem__name").text(product.name);
      $node.find(".cartItem__qty").text(`Qty: ${qty}`);
      $node.find(".cartItem__priceEach").text(`${money.format(Number(product.price || 0))} each`);
      $node.find(".cartItem__lineTotal").text(money.format(lineTotal));

      $node.find(".removeFromCartBtn").attr("data-product-id", id);

      $cartItems.append($node);
    }
  }

  // Adds a product to the cart (or increments quantity) and re-renders the cart.
  function addToCart(productId) {
    const p = allProducts.find((x) => x.id === productId);
    if (!p) return;

    if (!cart[productId]) cart[productId] = { product: p, qty: 0 };
    cart[productId].qty += 1;

    renderCart();
  }

  // Decrements a product quantity in the cart (or removes it when it reaches zero).
  function removeFromCart(productId) {
    if (!cart[productId]) return;
    cart[productId].qty -= 1;
    if (cart[productId].qty <= 0) delete cart[productId];
    renderCart();
  }

  // Empties the entire cart and refreshes the cart sidebar UI.
  function clearCart() {
    for (const id of Object.keys(cart)) delete cart[id];
    renderCart();
  }

  // Safely parses JSON, returning a fallback value if parsing fails.
  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  // Reads locally stored orders from localStorage.
  function getStoredOrders() {
    const raw = localStorage.getItem("me_orders");
    const parsed = safeJsonParse(raw || "[]", []);
    return Array.isArray(parsed) ? parsed : [];
  }

  // Persists the given list of orders to localStorage.
  function setStoredOrders(nextOrders) {
    try {
      localStorage.setItem("me_orders", JSON.stringify(nextOrders));
    } catch {
      // ignore
    }
  }

  // Merges orders from the JSON file and localStorage, de-duplicating by ID and sorting by date.
  function mergeOrders(baseOrders, storedOrders) {
    const byId = new Map();
    for (const o of baseOrders || []) {
      if (o && o.id) byId.set(String(o.id), o);
    }
    for (const o of storedOrders || []) {
      if (o && o.id) byId.set(String(o.id), o);
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => String(b.placedAt || "").localeCompare(String(a.placedAt || "")));
    return merged;
  }

  // Renders the "Previous Orders" list in the cart sidebar.
  function renderOrders() {
    $ordersList.empty();

    if (!orders.length) {
      $ordersList.append($("<div/>", { class: "hint", text: "No previous orders yet." }));
      return;
    }

    const tpl = document.getElementById("orderTpl");

    for (const o of orders) {
      const placedAt = o.placedAt ? new Date(o.placedAt) : null;
      const placedText = placedAt && !Number.isNaN(placedAt.getTime()) ? dtf.format(placedAt) : "Unknown date";
      const itemCount = Array.isArray(o.items) ? o.items.reduce((acc, it) => acc + Number(it.qty || 0), 0) : 0;
      const itemNames = Array.isArray(o.items)
        ? o.items
            .slice(0, 3)
            .map((it) => `${it.name} ×${it.qty}`)
            .join(", ")
        : "";
      const more = Array.isArray(o.items) && o.items.length > 3 ? ` +${o.items.length - 3} more` : "";

      const node = tpl.content.cloneNode(true);
      const $node = $(node);

      $node.find(".order__id").text(String(o.id || "Order"));
      $node.find(".order__total").text(money.format(Number(o.total || 0)));
      $node
        .find(".order__meta")
        .text(`${placedText} · ${String(o.customerName || "Customer")} · ${itemCount} item(s)`);
      $node.find(".order__items").text(itemNames ? `${itemNames}${more}` : "");

      $ordersList.append($node);
    }
  }

  // Loads previous orders via AJAX from orders.json, merges with localStorage, and renders them.
  function loadOrders() {
    return $.ajax({
      url: "./data/orders.json",
      method: "GET",
      dataType: "json",
      cache: false,
    })
      .done((data) => {
        const base = Array.isArray(data) ? data : [];
        const stored = getStoredOrders();
        orders = mergeOrders(base, stored);
        renderOrders();
      })
      .fail(() => {
        const stored = getStoredOrders();
        orders = mergeOrders([], stored);
        renderOrders();
      });
  }

  // Shows a temporary toast notification with a title and message.
  function showToast(title, message) {
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }

    $toastTitle.text(title || "Notice");
    $toastMsg.text(message || "");
    $toast.prop("hidden", false);

    toastTimer = window.setTimeout(() => {
      $toast.prop("hidden", true);
      toastTimer = null;
    }, 4500);
  }

  // Clears locally stored orders and refreshes the previous orders list.
  function clearOrders() {
    setStoredOrders([]);
    // keep JSON-loaded base orders, but hide locally stored ones
    loadOrders();
    showToast("Orders cleared", "Locally saved order history was cleared.");
  }

  // Opens the checkout modal and fills the order summary based on the current cart.
  function openCheckout() {
    const { itemIds, count, total } = cartSummary();
    if (count === 0) return;

    $checkoutSummary.empty();

    for (const id of itemIds) {
      const { product, qty } = cart[id];
      const lineTotal = qty * Number(product.price || 0);

      $checkoutSummary.append(
        $("<div/>", { class: "summaryItem" }).append(
          $("<div/>").append(
            $("<div/>", { class: "summaryItem__name", text: product.name }),
            $("<div/>", {
              class: "summaryItem__meta",
              text: `Qty: ${qty} · ${money.format(Number(product.price || 0))} each`,
            })
          ),
          $("<div/>", { class: "summaryItem__name", text: money.format(lineTotal) })
        )
      );
    }

    $checkoutTotal.text(money.format(total));
    $checkoutError.prop("hidden", true).text("");
    $checkoutModal.prop("hidden", false);
    $("#checkoutName").trigger("focus");
  }

  // Closes the checkout modal.
  function closeCheckout() {
    $checkoutModal.prop("hidden", true);
  }

  // Displays a validation error message inside the checkout form.
  function showCheckoutError(message) {
    $checkoutError.text(message).prop("hidden", !message);
  }

  // Validates checkout form data, creates a new order, saves it, clears the cart, and shows feedback.
  function placeOrder() {
    const { count, total } = cartSummary();
    if (count === 0) {
      showCheckoutError("Your cart is empty.");
      return;
    }

    const name = String($("#checkoutName").val() ?? "").trim();
    const email = String($("#checkoutEmail").val() ?? "").trim();
    const address = String($("#checkoutAddress").val() ?? "").trim();
    const payment = String($("#checkoutPayment").val() ?? "").trim();

    if (!name || !email || !address || !payment) {
      showCheckoutError("Please fill in all required fields.");
      return;
    }

    const orderId = `ME-${Date.now().toString(36).toUpperCase()}`;
    const placedAt = new Date().toISOString();
    const items = Object.keys(cart).map((id) => ({
      productId: id,
      name: cart[id].product.name,
      price: Number(cart[id].product.price || 0),
      qty: Number(cart[id].qty || 0),
    }));

    const newOrder = {
      id: orderId,
      placedAt,
      customerName: name,
      payment,
      items,
      total,
    };

    const stored = getStoredOrders();
    stored.unshift(newOrder);
    setStoredOrders(stored);

    orders = mergeOrders(orders, [newOrder]);
    renderOrders();

    clearCart();
    closeCheckout();
    setStatus(`Order ${orderId} placed · Total ${money.format(total)}`);
    showToast("Order placed", `${orderId} · ${money.format(total)} · Thanks, ${name}!`);
  }

  // Filters products using the search query against name, category, and description.
  function filterProducts(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return allProducts;

    return allProducts.filter((p) => {
      const hay = `${p.name} ${p.category || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // Loads product data from products.json via AJAX and renders product cards.
  function loadProducts() {
    setStatus("Loading products…");

    return $.ajax({
      url: "./data/products.json",
      method: "GET",
      dataType: "json",
      cache: false,
    })
      .done((data) => {
        allProducts = Array.isArray(data) ? data : [];
        renderProducts(allProducts);
        setStatus(`Loaded ${allProducts.length} products`);
      })
      .fail((xhr) => {
        allProducts = [];
        renderProducts(allProducts);
        const msg =
          "Could not load products.json via AJAX. Start a local server (not file://) and refresh.";
        setStatus(msg);
        // eslint-disable-next-line no-console
        console.error("AJAX load failed:", xhr?.status, xhr?.statusText);
      });
  }

  // Wires up all DOM event handlers (add/remove cart, checkout, search, toggles, etc.).
  function wireEvents() {
    $grid.on("click", ".addToCartBtn", function () {
      const id = String($(this).attr("data-product-id") || "");
      addToCart(id);
    });

    $cartItems.on("click", ".removeFromCartBtn", function () {
      const id = String($(this).attr("data-product-id") || "");
      removeFromCart(id);
    });

    $clearCart.on("click", () => clearCart());

    $checkoutBtn.on("click", () => openCheckout());
    $("#closeCheckout").on("click", () => closeCheckout());
    $("#cancelCheckout").on("click", () => closeCheckout());
    $checkoutModal.on("click", "[data-close-modal='true']", () => closeCheckout());

    $(document).on("keydown", (e) => {
      if (e.key === "Escape" && !$checkoutModal.prop("hidden")) closeCheckout();
    });

    $checkoutForm.on("submit", (e) => {
      e.preventDefault();
      placeOrder();
    });

    $clearOrders.on("click", () => clearOrders());
    $toastClose.on("click", () => $toast.prop("hidden", true));

    $search.on("input", function () {
      const q = $(this).val();
      const filtered = filterProducts(String(q ?? ""));
      renderProducts(filtered);
      setStatus(`${filtered.length} shown`);
    });

    $("#cartToggle").on("click", function () {
      const $sidebar = $("#cartSidebar");
      const isHidden = $sidebar.is(":hidden");
      $sidebar.toggle(isHidden);
      $(this).attr("aria-expanded", String(isHidden));
    });
  }

  $(function () {
    wireEvents();
    renderCart();
    loadProducts();
    loadOrders();
  });
})();

