function main(block) {
  return `<div class="template-custom-html" data-block-id="${block.id}">${block.settings.html || ""}</div>`;
}

