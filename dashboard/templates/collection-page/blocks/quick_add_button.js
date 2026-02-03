function main(block) {
  return `<button class="template-quick-add" data-block-id="${block.id}">${block.settings.label || "Quick Add"}</button>`;
}

