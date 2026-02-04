function main(block, ctx) {
  const inner = (block.blocks ?? []).map((child) => ctx.renderBlock?.(child) ?? "").join("\n");
  return `<div class="template-card" data-block-id="${block.id}">
    <div class="template-card__image"></div>
    <div class="template-card__content">${inner}</div>
  </div>`;
}

