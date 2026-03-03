# Mini E-Commerce Product Page

## What you get
- Product cards loaded via **jQuery AJAX** from `data/products.json`
- **Add to cart** from dynamically rendered cards
- Cart sidebar with **item count**, **remove**, **clear**, and **total price**
- **Live search filtering** over loaded products

## Run it (important for AJAX)
AJAX requests usually fail when opening `index.html` with `file://`. Run a local server instead.



Then open `http://localhost:5500/` in your browser.

### Option 
A: VS Code / Cursor “Live Server”
Install “Live Server”, then “Open with Live Server” on `index.html`.

## Files
- `index.html`: UI + templates
- `css/style.css`: styling
- `js/app.js`: AJAX + cart + DOM updates + search
- `data/products.json`: product data source
- `data/orders.json`: sample previous orders loaded via AJAX

## Notes (saving orders)
Browsers can’t write back to `data/orders.json` without a backend. New orders are saved to `localStorage` and merged with `data/orders.json` when rendering “Previous Orders”.

