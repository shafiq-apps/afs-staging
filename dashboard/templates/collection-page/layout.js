function layout(areas) {
  return `
    <style>
      .layout-shell { display: grid; grid-template-columns: 280px 1fr; gap: 16px; }
      .layout-filters { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      .layout-products { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
      .layout-pagination { margin-top: 16px; display: flex; justify-content: center; }
    </style>
    <div class="layout-shell">
      <aside class="layout-filters">${areas.filters || ""}</aside>
      <section class="layout-products">${areas.products || ""}</section>
    </div>
    <div class="layout-pagination">${areas.pagination || ""}</div>
  `;
}
