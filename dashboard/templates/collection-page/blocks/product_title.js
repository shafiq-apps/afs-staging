function main(block) {
  return `<div class="template-product-title" data-block-id="${block.id}">${block.settings.text || "Product"}</div>`;
}

