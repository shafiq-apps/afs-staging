function main(block) {
  return `<input class="template-search" data-block-id="${block.id}" placeholder="${block.settings.placeholder || "Search"}" />`;
}

