function main(block) {
  return `<span class="template-stock-badge" data-block-id="${block.id}">${block.settings.in_stock_text || "In Stock"}</span>`;
}

