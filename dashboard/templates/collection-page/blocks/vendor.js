function main(block) {
  return `<div class="template-vendor" data-block-id="${block.id}">${block.settings.text || "Vendor"}</div>`;
}

