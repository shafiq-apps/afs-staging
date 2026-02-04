function main(block) {
  return `<div class="template-banner" data-block-id="${block.id}">${block.settings.text || ""}</div>`;
}

