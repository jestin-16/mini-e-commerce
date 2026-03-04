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

  function setStatus(text) {
    $status.text(text || "");
  }

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

  function renderCart() {
    const { itemIds, count, total } = cartSummary();

    $cartCount.text(String(count));
    $cartTotal.text(money.format(total));
    animateTotal();
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

      // root element for this item (we set data-product-id for delegation)
      const $root = $node.find(".cart-item").attr("data-product-id", id);

      $root.find(".cart-item-img").attr("src", product.image || "").attr("alt", product.name || "");
      $root.find(".cart-item-title").text(product.name || "");
      $root.find(".cart-item-price").text(money.format(Number(product.price || 0)) + " each");
      $root.find(".qty-number").text(String(qty));
      $root.find(".cart-item-lineTotal").text(money.format(lineTotal));
      $root.find(".removeFromCartBtn").attr("data-product-id", id);

      $cartItems.append($node);
    }
  }

  function addToCart(productId) {
    const p = allProducts.find((x) => x.id === productId);
    if (!p) return;

    const existed = Boolean(cart[productId]);
    if (!cart[productId]) cart[productId] = { product: p, qty: 0 };
    cart[productId].qty += 1;

    renderCart();

    // subtle pulse on cart badge
    $cartCount.addClass("badge--pulse");
    setTimeout(() => $cartCount.removeClass("badge--pulse"), 520);

    // if item already existed, animate qty number briefly
    if (existed) {
      const $el = $cartItems.find(`[data-product-id="${productId}"]`).find('.qty-number');
      if ($el.length) {
        $el.addClass('qty-change');
        setTimeout(() => $el.removeClass('qty-change'), 260);
      }
    }
    // show toast for add
    showCustomToast('success', `${p.name} added to cart`);

    // refresh checkout view if open
    if (!$checkoutModal.prop('hidden')) openCheckout();
  }

  // remove entire product from cart (animation + toast)
function removeFromCart(productId) {
    const entry = cart[productId];
    if (!entry) return;
    const name = entry.product?.name || 'Item';

    const $row = $cartItems.find(`[data-product-id="${productId}"]`);
    const finish = () => {
        delete cart[productId];
        renderCart();
        showCustomToast('error', `${name} removed from cart`);
        if (!$checkoutModal.prop('hidden')) openCheckout();
    };

    if ($row.length) {
        $row.fadeOut(220, finish);
    } else {
        finish();
    }
}

  function changeQty(productId, delta) {
    if (!cart[productId]) return;
    const next = Number(cart[productId].qty || 0) + Number(delta || 0);
    if (next <= 0) {
      // delegate full removal to removeFromCart (handles toast once)
      removeFromCart(productId);
      return;
    }
    cart[productId].qty = next;
    renderCart();

    // small highlight on the qty number
    const $el = $cartItems.find(`[data-product-id="${productId}"]`).find('.qty-number');
    if ($el.length) {
      $el.addClass('qty-change');
      setTimeout(() => $el.removeClass('qty-change'), 260);
    }
    // show update toast
    const name = cart[productId].product?.name || 'Item';
    showCustomToast('info', `${name} quantity updated`);

    if (!$checkoutModal.prop('hidden')) openCheckout();
  }

  function clearCart() {
    for (const id of Object.keys(cart)) delete cart[id];
    renderCart();
  }

  function safeJsonParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function getStoredOrders() {
    const raw = localStorage.getItem("me_orders");
    const parsed = safeJsonParse(raw || "[]", []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function setStoredOrders(nextOrders) {
    try {
      localStorage.setItem("me_orders", JSON.stringify(nextOrders));
    } catch {
      // ignore
    }
  }

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

  // Custom toast system (bottom-right modern toasts)
  // dedupe last custom toast message to avoid duplicates
  let _lastToast = { msg: '', time: 0 };
  function showCustomToast(type, message, timeout = 3000) {
    // ignore if same message shown very recently
    const now = Date.now();
    if (message === _lastToast.msg && now - _lastToast.time < 600) {
      return;
    }
    _lastToast = { msg: message, time: now };

    const $container = $("#customToastContainer");
    if (!$container.length) return;

    const klass = `custom-toast ${type || 'info'}`;
    const $t = $("<div/>", { class: klass, text: message });

    $container.append($t);

    // auto remove
    const tid = window.setTimeout(() => {
      $t.fadeOut(260, () => $t.remove());
      window.clearTimeout(tid);
    }, timeout);

    // click to dismiss
    $t.on('click', () => {
      $t.remove();
      window.clearTimeout(tid);
    });
  }

  function animateTotal() {
    $cartTotal.addClass('total-pulse');
    setTimeout(() => $cartTotal.removeClass('total-pulse'), 420);
  }

  function clearOrders() {
    setStoredOrders([]);
    // keep JSON-loaded base orders, but hide locally stored ones
    loadOrders();
    showToast("Orders cleared", "Locally saved order history was cleared.");
  }

  function openCheckout() {
    const { itemIds, count, total } = cartSummary();
    if (count === 0) return;

    $checkoutSummary.empty();

    for (const id of itemIds) {
      const { product, qty } = cart[id];
      const lineTotal = qty * Number(product.price || 0);

      const $item = $("<div/>", { class: 'checkout-item', 'data-product-id': id }).append(
        $("<img/>", { class: 'checkout-img', src: product.image || '', alt: product.name || '' }),
        $("<div/>", { class: 'checkout-details' }).append(
          $("<h6/>", { text: product.name }),
          $("<div/>", { text: money.format(Number(product.price || 0)) }),
          $("<div/>", { class: 'qty-controls' }).append(
            $("<button/>", { class: 'qty-minus', type: 'button', text: '−' }),
            $("<span/>", { class: 'qty-value', text: String(qty) }),
            $("<button/>", { class: 'qty-plus', type: 'button', text: '+' })
          )
        ),
        $("<div/>", { class: 'checkout-lineTotal', text: money.format(lineTotal) })
      );

      $checkoutSummary.append($item);
    }

    $checkoutTotal.text(money.format(total));
    $checkoutError.prop("hidden", true).text("");
    $checkoutModal.prop("hidden", false);
    // prevent background scroll and focus
    $(document.body).addClass('modal-open');
    $("#checkoutName").trigger("focus");
  }

  function closeCheckout() {
    $checkoutModal.prop("hidden", true);
    $(document.body).removeClass('modal-open');
  }

  function showCheckoutError(message) {
    $checkoutError.text(message).prop("hidden", !message);
  }

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
    showCustomToast('success', 'Order placed successfully!');
  }

  function filterProducts(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return allProducts;

    return allProducts.filter((p) => {
      const hay = `${p.name} ${p.category || ""} ${p.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

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

  function wireEvents() {
    $grid.on("click", ".addToCartBtn", function () {
      const id = String($(this).attr("data-product-id") || "");
      addToCart(id);
    });

    $cartItems.on("click", ".removeFromCartBtn", function () {
      const id = String($(this).attr("data-product-id") || "");
      removeFromCart(id);
    });

    // Quantity controls (delegated for dynamic items)
    $(document).on("click", ".qty-plus", function () {
      const id = String($(this).closest("[data-product-id]").attr("data-product-id") || "");
      if (!id) return;
      changeQty(id, 1);
    });

    $(document).on("click", ".qty-minus", function () {
      const id = String($(this).closest("[data-product-id]").attr("data-product-id") || "");
      if (!id) return;
      changeQty(id, -1);
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
      $sidebar.toggleClass("cart--hidden");
      const expanded = !$sidebar.hasClass("cart--hidden");
      $(this).attr("aria-expanded", String(expanded));
    });
  }

  $(function () {
    wireEvents();
    renderCart();
    // start hidden so toggle works consistently on mobile/desktop
    $("#cartSidebar").addClass("cart--hidden");
    loadProducts();
    loadOrders();

    // Smooth navbar shrink on scroll
    $(window).on("scroll", function () {
      if ($(window).scrollTop() > 50) {
        $(".topbar").addClass("scrolled");
      } else {
        $(".topbar").removeClass("scrolled");
      }
    });

    // Scroll reveal fade-up animation via IntersectionObserver
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            $(entry.target).addClass("active");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    // Initial reveal elements
    $(".reveal-up").each(function () {
      observer.observe(this);
    });

    // Observe newly added cards to fade-in
    const mutObserver = new MutationObserver((mutations) => {
      mutations.forEach((mut) => {
        mut.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && $(node).hasClass("card")) {
            $(node).addClass("reveal-up");
            observer.observe(node);
          }
        });
      });
    });
    const gridEl = document.getElementById("productGrid");
    if (gridEl) mutObserver.observe(gridEl, { childList: true });

    // Button ripple effect
    $(document).on("mousedown", ".primaryBtn, .ghostBtn, .cartBtn", function (e) {
      const $btn = $(this);
      const radius = Math.max($btn.outerWidth(), $btn.outerHeight());
      const offset = $btn.offset();
      const x = e.pageX - offset.left - radius / 2;
      const y = e.pageY - offset.top - radius / 2;

      const $ripple = $("<span class='ripple'></span>");
      $ripple.css({
        width: radius,
        height: radius,
        top: y + "px",
        left: x + "px"
      });

      $btn.append($ripple);
      setTimeout(() => {
        $ripple.remove();
      }, 600);
    });
  });
})();
