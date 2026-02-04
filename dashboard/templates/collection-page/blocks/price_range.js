function main(block) {
  return `<div class="template-price-range" data-block-id="${block.id}">
    <span>${block.settings.min ?? ""}</span> - <span>${block.settings.max ?? ""}</span>
  </div>`;
}

